import { exportDatabaseToJSON, importDatabaseFromJSON } from './db';

const BACKUP_FILE_NAME = 'Qureshi_Inventory_Backup.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface SyncStatus {
  isLoggedIn: boolean;
  userEmail?: string;
  lastSyncedAt?: string;
  isSyncing: boolean;
  error?: string;
}

// Global Google token storage
let googleAccessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('gdrive_access_token') : null;
let tokenExpiresAt: number = typeof window !== 'undefined' ? Number(localStorage.getItem('gdrive_token_expires_at') || 0) : 0;
let autoSyncTimer: NodeJS.Timeout | null = null;
const statusListeners = new Set<(status: SyncStatus) => void>();

export function getStoredAccessToken(): string | null {
  if (!googleAccessToken) return null;
  if (Date.now() >= tokenExpiresAt) {
    // Token expired
    localStorage.removeItem('gdrive_access_token');
    localStorage.removeItem('gdrive_token_expires_at');
    googleAccessToken = null;
    notifyStatusListeners({ isLoggedIn: false, isSyncing: false });
    return null;
  }
  return googleAccessToken;
}

export function saveAccessToken(token: string, expiresInSeconds: number = 3600) {
  googleAccessToken = token;
  tokenExpiresAt = Date.now() + (expiresInSeconds - 60) * 1000;
  localStorage.setItem('gdrive_access_token', token);
  localStorage.setItem('gdrive_token_expires_at', tokenExpiresAt.toString());
  notifyStatusListeners({ isLoggedIn: true, isSyncing: false, lastSyncedAt: localStorage.getItem('gdrive_last_synced') || undefined });
}

export function clearAccessToken() {
  googleAccessToken = null;
  tokenExpiresAt = 0;
  localStorage.removeItem('gdrive_access_token');
  localStorage.removeItem('gdrive_token_expires_at');
  localStorage.removeItem('gdrive_last_synced');
  localStorage.removeItem('gdrive_user_email');
  notifyStatusListeners({ isLoggedIn: false, isSyncing: false });
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void) {
  statusListeners.add(listener);
  listener({
    isLoggedIn: !!getStoredAccessToken(),
    lastSyncedAt: localStorage.getItem('gdrive_last_synced') || undefined,
    isSyncing: false
  });
  return () => {
    statusListeners.delete(listener);
  };
}

function notifyStatusListeners(status: SyncStatus) {
  statusListeners.forEach(fn => fn(status));
}

/**
 * Initialize Google GIS Token Client
 */
export function initGoogleAuthClient(clientId: string, onTokenReceived: (token: string) => void) {
  if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
    console.warn("Google Identity Services script not yet loaded.");
    return null;
  }

  const client = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: (response: any) => {
      if (response.access_token) {
        saveAccessToken(response.access_token, response.expires_in || 3600);
        onTokenReceived(response.access_token);
        // Automatically attempt startup restore/sync on fresh login
        autoCheckAndRestoreFromDrive();
      } else if (response.error) {
        console.error("Google Auth error:", response);
      }
    },
  });

  return client;
}

/**
 * Find backup file on Google Drive
 */
async function findBackupFileId(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
    }
    throw new Error(`Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Backup local SQLite/JSON database to Google Drive
 */
export async function uploadBackupToDrive(): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;

  notifyStatusListeners({
    isLoggedIn: true,
    isSyncing: true,
    lastSyncedAt: localStorage.getItem('gdrive_last_synced') || undefined
  });

  try {
    const jsonContent = await exportDatabaseToJSON();
    const existingFileId = await findBackupFileId(token);

    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: 'application/json',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (existingFileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      const now = new Date().toISOString();
      localStorage.setItem('gdrive_last_synced', now);
      notifyStatusListeners({
        isLoggedIn: true,
        isSyncing: false,
        lastSyncedAt: now
      });
      return true;
    } else {
      if (res.status === 401) clearAccessToken();
      notifyStatusListeners({ isLoggedIn: false, isSyncing: false, error: 'Authorization failed' });
      return false;
    }
  } catch (err) {
    console.error("Failed to upload backup to Drive:", err);
    notifyStatusListeners({
      isLoggedIn: !!getStoredAccessToken(),
      isSyncing: false,
      error: 'Upload error'
    });
    return false;
  }
}

/**
 * Download and Restore latest backup from Google Drive
 */
export async function downloadAndRestoreFromDrive(): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;

  notifyStatusListeners({ isLoggedIn: true, isSyncing: true });

  try {
    const fileId = await findBackupFileId(token);
    if (!fileId) {
      console.log("No remote backup file found on Google Drive.");
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false });
      return false;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false });
      return false;
    }

    const jsonText = await res.text();
    const restored = await importDatabaseFromJSON(jsonText);
    if (restored) {
      const now = new Date().toISOString();
      localStorage.setItem('gdrive_last_synced', now);
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false, lastSyncedAt: now });
    } else {
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false });
    }
    return restored;
  } catch (err) {
    console.error("Failed to restore from Drive:", err);
    notifyStatusListeners({ isLoggedIn: true, isSyncing: false, error: 'Restore error' });
    return false;
  }
}

/**
 * Schedule a debounced auto-sync (30 seconds after changes occur)
 */
export function triggerDebouncedDriveBackup() {
  const token = getStoredAccessToken();
  if (!token) return;

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(() => {
    console.log("[Google Drive] Triggering 30s debounced auto-backup...");
    uploadBackupToDrive();
  }, 30000);
}

/**
 * Auto check & restore backup on new browser/device startup if logged in
 */
export async function autoCheckAndRestoreFromDrive(): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;

  const hasSyncedBefore = localStorage.getItem('gdrive_last_synced');
  // If no local sync record exists or first run on device, download latest backup from Drive
  if (!hasSyncedBefore) {
    console.log("[Google Drive] First launch on device. Restoring backup from Google Drive...");
    return await downloadAndRestoreFromDrive();
  }
  return false;
}
