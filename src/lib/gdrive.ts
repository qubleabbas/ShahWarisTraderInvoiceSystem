import { exportDatabaseToJSON, importDatabaseFromJSON, mergeDatabaseFromJSON, db } from './db';

const BACKUP_FILE_NAME = 'Qureshi_Inventory_Backup.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// How often to poll Drive for changes made on another device.
const POLL_INTERVAL_MS = 20_000;
// Debounce local changes before pushing, so a burst of edits is one sync.
const PUSH_DEBOUNCE_MS = 3_500;

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
const statusListeners = new Set<(status: SyncStatus) => void>();

// Sync engine state
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let pendingSync = false; // a sync was requested while one was running
let dirty = false; // local changes not yet pushed
let engineStarted = false;

export function saveStoredGoogleClientId(clientId: string) {
  if (typeof window !== 'undefined' && clientId) {
    localStorage.setItem('google_client_id', clientId);
  }
  db.settings.put({ key: 'google_client_id', value: clientId }).catch(console.error);
}

export function getStoredGoogleClientId(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('google_client_id') || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  }
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

export function getStoredAccessToken(): string | null {
  if (!googleAccessToken) return null;
  if (Date.now() >= tokenExpiresAt) {
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
    isSyncing: syncing,
  });
  return () => {
    statusListeners.delete(listener);
  };
}

function notifyStatusListeners(status: SyncStatus) {
  statusListeners.forEach((fn) => fn(status));
}

function emitStatus(partial: Partial<SyncStatus>) {
  notifyStatusListeners({
    isLoggedIn: !!getStoredAccessToken(),
    lastSyncedAt: localStorage.getItem('gdrive_last_synced') || undefined,
    isSyncing: syncing,
    ...partial,
  });
}

function markSynced(modifiedTime?: string) {
  if (modifiedTime) localStorage.setItem('gdrive_synced_modified_time', modifiedTime);
  const now = new Date().toISOString();
  localStorage.setItem('gdrive_last_synced', now);
  dirty = false;
  emitStatus({ isSyncing: false, lastSyncedAt: now });
}

/**
 * Initialize Google GIS Token Client
 */
export function initGoogleAuthClient(clientId: string, onTokenReceived: (token: string) => void) {
  if (typeof window === 'undefined' || !(window as any).google?.accounts?.oauth2) {
    console.warn('Google Identity Services script not yet loaded.');
    return null;
  }

  saveStoredGoogleClientId(clientId);

  const client = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback: (response: any) => {
      if (response.access_token) {
        saveAccessToken(response.access_token, response.expires_in || 3600);
        onTokenReceived(response.access_token);
        initSyncOnStartup();
      } else if (response.error) {
        console.error('Google Auth error:', response);
      }
    },
  });

  return client;
}

// ---------------------------------------------------------------------------
// Low-level Drive helpers
// ---------------------------------------------------------------------------

async function findBackupFileMeta(accessToken: string): Promise<{ id: string; modifiedTime: string } | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    throw new Error(`Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return { id: data.files[0].id, modifiedTime: data.files[0].modifiedTime };
  }
  return null;
}

async function rawDownload(accessToken: string, fileId: string): Promise<string | null> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    throw new Error(`Drive API download error: ${response.statusText}`);
  }

  return response.text();
}

async function rawUploadNew(accessToken: string, jsonText: string): Promise<{ id: string; modifiedTime: string }> {
  const metadata = {
    name: BACKUP_FILE_NAME,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([jsonText], { type: 'application/json' }));

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    throw new Error(`Drive API upload error: ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id, modifiedTime: data.modifiedTime };
}

async function rawUpdateExisting(accessToken: string, fileId: string, jsonText: string): Promise<{ id: string; modifiedTime: string }> {
  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: jsonText,
    }
  );

  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    throw new Error(`Drive API update error: ${response.statusText}`);
  }

  const data = await response.json();
  return { id: data.id, modifiedTime: data.modifiedTime };
}

// ---------------------------------------------------------------------------
// Main two-way sync algorithm
// ---------------------------------------------------------------------------

export async function syncNow(): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;

  if (syncing) {
    pendingSync = true;
    return true;
  }

  syncing = true;
  emitStatus({ isSyncing: true });

  try {
    const meta = await findBackupFileMeta(token);

    if (!meta) {
      const jsonText = await exportDatabaseToJSON();
      const newMeta = await rawUploadNew(token, jsonText);
      markSynced(newMeta.modifiedTime);
      syncing = false;
      if (pendingSync) {
        pendingSync = false;
        setTimeout(() => syncNow(), 500);
      }
      return true;
    }

    const lastKnownRemoteTime = localStorage.getItem('gdrive_synced_modified_time');
    const remoteIsNewer = !lastKnownRemoteTime || meta.modifiedTime > lastKnownRemoteTime;

    if (remoteIsNewer) {
      const jsonText = await rawDownload(token, meta.id);
      if (jsonText != null) {
        await mergeDatabaseFromJSON(jsonText);
      }
    }

    const mergedJsonText = await exportDatabaseToJSON();
    const updatedMeta = await rawUpdateExisting(token, meta.id, mergedJsonText);
    markSynced(updatedMeta.modifiedTime);

    syncing = false;
    if (pendingSync) {
      pendingSync = false;
      setTimeout(() => syncNow(), 500);
    }
    return true;
  } catch (err) {
    console.error('Drive sync failed:', err);
    syncing = false;
    emitStatus({ isSyncing: false, error: (err as Error).message });
    return false;
  }
}

export function scheduleAutoSync() {
  dirty = true;
  const token = getStoredAccessToken();
  if (!token) return;

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    syncNow();
  }, PUSH_DEBOUNCE_MS);
}

export function startSyncEngine() {
  if (engineStarted || typeof window === 'undefined') return;
  engineStarted = true;

  initSyncOnStartup();

  setInterval(() => {
    if (getStoredAccessToken()) {
      syncNow();
    }
  }, POLL_INTERVAL_MS);
}

export async function initSyncOnStartup() {
  const token = getStoredAccessToken();
  if (!token) return;

  try {
    await syncNow();
  } catch (err) {
    console.error('[Sync] startup sync failed:', err);
  }
}

export async function uploadBackupToDrive(): Promise<boolean> {
  return syncNow();
}

export async function downloadAndRestoreFromDrive(): Promise<boolean> {
  const token = getStoredAccessToken();
  if (!token) return false;

  syncing = true;
  emitStatus({ isSyncing: true });

  try {
    const meta = await findBackupFileMeta(token);
    if (!meta) {
      syncing = false;
      emitStatus({ isSyncing: false });
      return false;
    }

    const jsonText = await rawDownload(token, meta.id);
    if (jsonText == null) {
      syncing = false;
      emitStatus({ isSyncing: false });
      return false;
    }

    const restored = await importDatabaseFromJSON(jsonText);
    syncing = false;
    if (restored) {
      markSynced(meta.modifiedTime);
    } else {
      emitStatus({ isSyncing: false });
    }
    return restored;
  } catch (err) {
    console.error('Failed to restore from Drive:', err);
    syncing = false;
    emitStatus({ isSyncing: false, error: 'Restore error' });
    return false;
  }
}

export function registerLifecycleAutoBackup() {
  startSyncEngine();
}
