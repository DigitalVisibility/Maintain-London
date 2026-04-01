/**
 * IndexedDB offline store + sync queue for Project Hub.
 * Uses the `idb` library for a cleaner promise-based API.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'project-hub';
const DB_VERSION = 1;

interface SyncQueueItem {
  id: string;
  type: 'entry' | 'photo';
  url: string;
  method: string;
  payload?: Record<string, unknown>;
  formData?: FormData;
  createdAt: string;
}

interface CachedEntry {
  id: string;
  projectId: string;
  data: Record<string, unknown>;
  cachedAt: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_entries')) {
          db.createObjectStore('cached_entries', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ── Sync Queue ──

/** Add a diary entry save to the offline queue */
export async function queueEntrySave(
  id: string,
  url: string,
  method: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  await db.put('sync_queue', {
    id,
    type: 'entry',
    url,
    method,
    payload,
    createdAt: new Date().toISOString(),
  } satisfies SyncQueueItem);
}

/** Add a photo upload to the offline queue */
export async function queuePhotoUpload(
  id: string,
  url: string,
  formData: FormData
): Promise<void> {
  const db = await getDB();
  // FormData can't be stored in IDB directly — serialize file details
  const file = formData.get('file') as File;
  const buffer = await file.arrayBuffer();

  await db.put('sync_queue', {
    id,
    type: 'photo',
    url,
    method: 'POST',
    payload: {
      fileName: file.name,
      fileType: file.type,
      fileBuffer: buffer,
      entryId: formData.get('entry_id'),
      fileCategory: formData.get('file_type'),
    },
    createdAt: new Date().toISOString(),
  });
}

/** Get all items in the sync queue */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAll('sync_queue');
}

/** Remove an item from the sync queue */
export async function removeSyncItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sync_queue', id);
}

/** Get count of pending sync items */
export async function getSyncQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count('sync_queue');
}

// ── Cached Entries (for offline viewing) ──

/** Cache an entry for offline viewing */
export async function cacheEntry(
  id: string,
  projectId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = await getDB();
  await db.put('cached_entries', {
    id,
    projectId,
    data,
    cachedAt: new Date().toISOString(),
  } satisfies CachedEntry);
}

/** Get a cached entry */
export async function getCachedEntry(id: string): Promise<CachedEntry | undefined> {
  const db = await getDB();
  return db.get('cached_entries', id);
}

/** Get all cached entries for a project */
export async function getCachedEntriesForProject(projectId: string): Promise<CachedEntry[]> {
  const db = await getDB();
  const all = await db.getAll('cached_entries');
  return all.filter((e) => e.projectId === projectId);
}

/** Clear all cached entries */
export async function clearCachedEntries(): Promise<void> {
  const db = await getDB();
  await db.clear('cached_entries');
}

// ── Background Sync Registration ──

/** Request a background sync for diary entries */
export async function requestEntrySync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await (reg as any).sync.register('sync-diary-entries');
  }
}

/** Request a background sync for photos */
export async function requestPhotoSync(): Promise<void> {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    await (reg as any).sync.register('sync-photos');
  }
}

/** Manually process the sync queue (fallback when Background Sync isn't supported) */
export async function processQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getSyncQueue();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      let res: Response;

      if (item.type === 'photo' && item.payload) {
        // Reconstruct FormData from stored data
        const p = item.payload as any;
        const formData = new FormData();
        const file = new File([p.fileBuffer], p.fileName, { type: p.fileType });
        formData.append('file', file);
        formData.append('entry_id', p.entryId);
        formData.append('file_type', p.fileCategory);

        res = await fetch(item.url, { method: 'POST', body: formData });
      } else {
        res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
      }

      if (res.ok) {
        await removeSyncItem(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
