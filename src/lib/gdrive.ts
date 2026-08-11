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
// Tracks whether the local DB has changed since the last successful upload,
// so we only back up on close/leave when there is actually something new.
let dirtySinceSync = false;
let lifecycleRegistered = false;
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
  localStorage.removeItem('gdrive_synced_modified_time');
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
 * Find the backup file on Google Drive, returning its id and last-modified time.
 */
async function findBackupFileMeta(accessToken: string): Promise<{ id: string; modifiedTime: string } | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    if (response.status === 401) {
      clearAccessToken();
    }
    throw new Error(`Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return { id: data.files[0].id, modifiedTime: data.files[0].modifiedTime };
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
    const existing = await findBackupFileMeta(token);
    const existingFileId = existing?.id;

    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: 'application/json',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([jsonContent], { type: 'application/json' }));

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';
    let method = 'POST';

    if (existingFileId) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,modifiedTime`;
      method = 'PATCH';
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      dirtySinceSync = false;
      // Record the exact cloud version we just wrote, so a later open can tell
      // whether the backup was changed by ANOTHER device since this sync.
      const uploaded = await res.json().catch(() => null);
      if (uploaded?.modifiedTime) {
        localStorage.setItem('gdrive_synced_modified_time', uploaded.modifiedTime);
      }
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
    const meta = await findBackupFileMeta(token);
    if (!meta) {
      console.log("No remote backup file found on Google Drive.");
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false });
      return false;
    }

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      notifyStatusListeners({ isLoggedIn: true, isSyncing: false });
      return false;
    }

    const jsonText = await res.text();
    const restored = await importDatabaseFromJSON(jsonText);
    if (restored) {
      // We are now in sync with this exact cloud version.
      localStorage.setItem('gdrive_synced_modified_time', meta.modifiedTime);
      const now = new Date().toISOString();
      localStorage.setItem('gdrive_last_synced', now);
      dirtySinceSync = false;
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
 * Schedule a debounced auto-sync — 5 seconds after the last change, the whole
 * database is backed up to Google Drive. Called on every DB mutation.
 */
export function triggerDebouncedDriveBackup() {
  const token = getStoredAccessToken();
  if (!token) return;

  dirtySinceSync = true;

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
  }

  autoSyncTimer = setTimeout(() => {
    console.log("[Google Drive] Triggering 5s debounced auto-backup...");
    uploadBackupToDrive();
  }, 5000);
}

/**
 * Immediately upload any pending changes (used when the tab is being closed
 * or hidden). Skips the wait if nothing changed since the last successful sync.
 */
export function flushPendingBackup() {
  const token = getStoredAccessToken();
  if (!token || !dirtySinceSync) return;

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  console.log("[Google Drive] Flushing backup before the page closes...");
  uploadBackupToDrive();
}

/**
 * Attach page-lifecycle listeners so the latest data is backed up when the user
 * leaves or closes the site. `visibilitychange -> hidden` is the reliable signal
 * (it fires right before a tab is closed/backgrounded, while the page is still
 * alive long enough to complete the upload); `pagehide` is a fallback.
 * Safe to call multiple times — it only registers once.
 */
export function registerLifecycleAutoBackup() {
  if (typeof window === 'undefined' || lifecycleRegistered) return;
  lifecycleRegistered = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingBackup();
    }
  });

  window.addEventListener('pagehide', () => {
    flushPendingBackup();
  });
}

/**
 * Auto check & restore backup on new browser/device startup if logged in.
 * Kept for the post-login callback path.
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

/**
 * What should happen when the app opens, given the state of Drive vs local:
 *  - 'none'         : nothing to do (not connected, no cloud backup, or already in sync)
 *  - 'auto-restore' : fresh device / no local data yet — safe to pull silently
 *  - 'prompt'       : the cloud backup was changed on ANOTHER device since this
 *                     device last synced — ask before overwriting local data
 */
export type StartupSyncAction =
  | { type: 'none' }
  | { type: 'auto-restore' }
  | { type: 'prompt'; cloudModifiedTime: string };

export async function getStartupSyncAction(): Promise<StartupSyncAction> {
  const token = getStoredAccessToken();
  if (!token) return { type: 'none' };

  try {
    const meta = await findBackupFileMeta(token);
    if (!meta) return { type: 'none' }; // nothing backed up yet

    const lastSynced = localStorage.getItem('gdrive_last_synced');
    if (!lastSynced) {
      // Fresh device / browser — safe to restore silently.
      return { type: 'auto-restore' };
    }

    const syncedModified = localStorage.getItem('gdrive_synced_modified_time');
    if (syncedModified) {
      // Exact check: the cloud version differs from the one we last wrote/restored,
      // meaning another device edited it. Ask before overwriting.
      if (meta.modifiedTime !== syncedModified) {
        return { type: 'prompt', cloudModifiedTime: meta.modifiedTime };
      }
      return { type: 'none' };
    }

    // Legacy fallback (synced before this feature existed): use a 60s tolerance
    // so we don't prompt on our own just-uploaded backup.
    if (new Date(meta.modifiedTime).getTime() > new Date(lastSynced).getTime() + 60_000) {
      return { type: 'prompt', cloudModifiedTime: meta.modifiedTime };
    }
    return { type: 'none' };
  } catch (err) {
    console.error('[Google Drive] Startup sync check failed:', err);
    return { type: 'none' };
  }
}
