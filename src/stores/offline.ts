/**
 * Nano Stores for offline/sync state — shared across React islands.
 */

import { atom, computed } from 'nanostores';

/** Whether the browser is currently online */
export const $isOnline = atom<boolean>(
  typeof navigator !== 'undefined' ? navigator.onLine : true
);

/** Number of items waiting in the sync queue */
export const $pendingSyncCount = atom<number>(0);

/** Whether a sync is currently in progress */
export const $isSyncing = atom<boolean>(false);

/** Last successful sync timestamp (ISO string or null) */
export const $lastSyncAt = atom<string | null>(null);

/** Derived: whether there are items to sync */
export const $hasPendingSync = computed($pendingSyncCount, (count) => count > 0);

/** Derived: overall sync status label */
export const $syncStatus = computed(
  [$isOnline, $isSyncing, $pendingSyncCount],
  (online, syncing, pending) => {
    if (!online && pending > 0) return 'offline-pending' as const;
    if (!online) return 'offline' as const;
    if (syncing) return 'syncing' as const;
    if (pending > 0) return 'pending' as const;
    return 'synced' as const;
  }
);

// ── Init: listen for online/offline events ──

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => $isOnline.set(true));
  window.addEventListener('offline', () => $isOnline.set(false));
}
