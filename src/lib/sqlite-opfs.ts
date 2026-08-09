/**
 * SQLite WASM with OPFS (Origin Private File System) Persistence Manager
 * Qureshi Inventory & Billing System
 */

const OPFS_SQLITE_FILENAME = 'qureshi_inventory_db.sqlite';

/**
 * Check if Origin Private File System (OPFS) is supported in current browser environment
 */
export function isOpfsSupported(): boolean {
  return typeof window !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * Save binary SQLite database array buffer directly to OPFS (Origin Private File System)
 */
export async function saveSqliteToOPFS(binaryData: Uint8Array): Promise<boolean> {
  if (!isOpfsSupported()) {
    console.warn("OPFS is not supported in this browser. Falling back to local storage sync.");
    return false;
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(OPFS_SQLITE_FILENAME, { create: true });
    // Write contents to OPFS file
    const writable = await (fileHandle as any).createWritable();
    await writable.write(binaryData);
    await writable.close();
    console.log(`[SQLite WASM] Successfully saved ${binaryData.byteLength} bytes to OPFS file: ${OPFS_SQLITE_FILENAME}`);
    return true;
  } catch (err) {
    console.error("Failed to write SQLite file to OPFS:", err);
    return false;
  }
}

/**
 * Load binary SQLite database file from OPFS (Origin Private File System)
 */
export async function loadSqliteFromOPFS(): Promise<Uint8Array | null> {
  if (!isOpfsSupported()) return null;

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(OPFS_SQLITE_FILENAME, { create: false });
    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();
    console.log(`[SQLite WASM] Successfully read ${arrayBuffer.byteLength} bytes from OPFS file: ${OPFS_SQLITE_FILENAME}`);
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    // File not found or first run
    console.log("No existing SQLite database file found in OPFS.");
    return null;
  }
}

/**
 * Delete SQLite database file from OPFS (e.g. on full reset)
 */
export async function clearSqliteFromOPFS(): Promise<boolean> {
  if (!isOpfsSupported()) return false;

  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_SQLITE_FILENAME);
    console.log("[SQLite WASM] Removed database file from OPFS.");
    return true;
  } catch (err) {
    return false;
  }
}
