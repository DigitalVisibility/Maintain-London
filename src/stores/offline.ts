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

/**
 * Confirm real connectivity by pinging the server. `navigator.onLine` is
 * unreliable (it reports false negatives on some networks/VPNs), so we trust an
 * actual request: if it succeeds we're online regardless of what the flag says.
 */
export async function verifyConnectivity(): Promise<boolean> {
  try {
    const res = await fetch('/api/ping', { method: 'GET', cache: 'no-store' });
    $isOnline.set(res.ok);
    return res.ok;
  } catch {
    $isOnline.set(false);
    return false;
  }
}

// ── Init: listen for online/offline events ──

if (typeof window !== 'undefined') {
  // Re-verify on both events rather than trusting the flag directly.
  window.addEventListener('online', () => { verifyConnectivity(); });
  window.addEventListener('offline', () => { verifyConnectivity(); });
  // Confirm actual connectivity on load (don't trust navigator.onLine alone).
  verifyConnectivity();
}
