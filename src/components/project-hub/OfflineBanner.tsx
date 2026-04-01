import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { $isOnline, $pendingSyncCount, $isSyncing, $syncStatus, $lastSyncAt } from '../../stores/offline';
import { getSyncQueueCount, processQueue } from '../../lib/offline';

export default function OfflineBanner() {
  const isOnline = useStore($isOnline);
  const pendingCount = useStore($pendingSyncCount);
  const isSyncing = useStore($isSyncing);
  const syncStatus = useStore($syncStatus);
  const lastSyncAt = useStore($lastSyncAt);

  // Poll sync queue count
  useEffect(() => {
    async function updateCount() {
      try {
        const count = await getSyncQueueCount();
        $pendingSyncCount.set(count);
      } catch {
        // IDB may not be available
      }
    }
    updateCount();
    const interval = setInterval(updateCount, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      handleSync();
    }
  }, [isOnline]);

  // Listen for SW sync-complete messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    function onMessage(event: MessageEvent) {
      if (event.data?.type === 'SYNC_COMPLETE') {
        $pendingSyncCount.set(Math.max(0, $pendingSyncCount.get() - 1));
        $lastSyncAt.set(new Date().toISOString());
      }
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  async function handleSync() {
    if (isSyncing || !isOnline) return;
    $isSyncing.set(true);

    try {
      // Always process queue directly for immediate feedback
      const result = await processQueue();
      if (result.synced > 0) {
        $lastSyncAt.set(new Date().toISOString());
      }

      const remaining = await getSyncQueueCount();
      $pendingSyncCount.set(remaining);
    } finally {
      $isSyncing.set(false);
    }
  }

  // Don't show anything when online and fully synced
  if (syncStatus === 'synced') return null;

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium ${
        syncStatus === 'offline' || syncStatus === 'offline-pending'
          ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
          : syncStatus === 'syncing'
            ? 'bg-blue-50 border-b border-blue-200 text-blue-800'
            : 'bg-amber-50 border-b border-amber-200 text-amber-800'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Status icon */}
        {syncStatus === 'offline' || syncStatus === 'offline-pending' ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l6.921 6.922c.05.062.105.118.168.167l6.91 6.911a1 1 0 001.415-1.414l-.675-.675a9.001 9.001 0 00-.668-.627l-2.28-2.28A7 7 0 003.736 7.26l-.03.002L3.707 2.293zM9.5 13a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" clipRule="evenodd" />
          </svg>
        ) : syncStatus === 'syncing' ? (
          <svg className="h-4 w-4 flex-shrink-0 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        )}

        {/* Status text */}
        <span>
          {syncStatus === 'offline' && 'You are offline'}
          {syncStatus === 'offline-pending' &&
            `You are offline — ${pendingCount} change${pendingCount !== 1 ? 's' : ''} queued`}
          {syncStatus === 'syncing' && 'Syncing changes...'}
          {syncStatus === 'pending' &&
            `${pendingCount} change${pendingCount !== 1 ? 's' : ''} waiting to sync`}
        </span>
      </div>

      {/* Sync button (only when online + pending) */}
      {syncStatus === 'pending' && (
        <button
          type="button"
          onClick={handleSync}
          className="px-3 py-1 text-xs font-semibold bg-amber-200 hover:bg-amber-300 text-amber-900 rounded transition-colors"
        >
          Sync now
        </button>
      )}
    </div>
  );
}
