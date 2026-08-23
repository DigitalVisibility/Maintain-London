/** Project Dash Service Worker — offline caching + background sync */

const CACHE_VERSION = 'ph-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/project-hub/',
  '/manifest.json',
  '/favicon.svg',
  '/images/Icons/Stacked.png',
];

// ── Install: pre-cache shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('ph-') && key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for static ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and auth endpoints
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/auth')) return;

  // API requests (entries, weather) — network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Project Dash pages — network first, cache fallback
  if (url.pathname.startsWith('/project-hub/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets (_astro/*, images, fonts) — cache first
  if (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }
});

// ── Background Sync: process queued diary entries + photos ──
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-diary-entries') {
    event.waitUntil(syncDiaryEntries());
  }
  if (event.tag === 'sync-photos') {
    event.waitUntil(syncPhotos());
  }
});

async function syncDiaryEntries() {
  // Open IndexedDB and process sync queue
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const store = tx.objectStore('sync_queue');
  const items = await getAllFromStore(store);
  await tx.done;

  for (const item of items) {
    if (item.type !== 'entry') continue;

    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        // Remove from queue
        const delTx = db.transaction('sync_queue', 'readwrite');
        delTx.objectStore('sync_queue').delete(item.id);
        await delTx.done;

        // Notify clients
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE', id: item.id });
        });
      }
    } catch {
      // Will retry on next sync event
    }
  }
}

async function syncPhotos() {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const store = tx.objectStore('sync_queue');
  const items = await getAllFromStore(store);
  await tx.done;

  for (const item of items) {
    if (item.type !== 'photo') continue;

    try {
      const res = await fetch(item.url, {
        method: 'POST',
        body: item.formData,
      });

      if (res.ok) {
        const delTx = db.transaction('sync_queue', 'readwrite');
        delTx.objectStore('sync_queue').delete(item.id);
        await delTx.done;

        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE', id: item.id });
        });
      }
    } catch {
      // Will retry
    }
  }
}

// ── Minimal IndexedDB helper (no idb library in SW) ──
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('project-hub', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cached_entries')) {
        db.createObjectStore('cached_entries', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Web push: show notifications, and focus/open the app on click ──
self.addEventListener('push', (event) => {
  let data = { title: 'Project Dash', body: 'You have a new notification.', url: '/project-hub/' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/images/projectdash/mark.svg',
      badge: '/images/projectdash/mark.svg',
      tag: data.tag || undefined,
      data: { url: data.url || '/project-hub/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/project-hub/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { c.focus(); if ('navigate' in c) c.navigate(url).catch(() => {}); return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
