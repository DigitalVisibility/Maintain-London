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
  if (event.tag === 'sync-voice-notes') {
    event.waitUntil(syncVoiceNotes());
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
    if (item.type !== 'photo' || !item.payload) continue;

    try {
      // Rebuild the FormData from the queued parts. This used to post
      // `item.formData`, which queuePhotoUpload never stores — FormData cannot
      // be put in IndexedDB — so every background-sync photo upload posted an
      // empty body and silently failed. The manual processQueue() fallback in
      // src/lib/offline.ts did it correctly, which is why it went unnoticed.
      const p = item.payload;
      const formData = new FormData();
      formData.append('file', new File([p.fileBuffer], p.fileName, { type: p.fileType }));
      formData.append('entry_id', p.entryId);
      formData.append('file_type', p.fileCategory);

      const res = await fetch(item.url, { method: 'POST', body: formData });

      // 4xx will never succeed on a retry — drop it rather than replaying the
      // same rejected upload on every future sync event.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        const delTx = db.transaction('sync_queue', 'readwrite');
        delTx.objectStore('sync_queue').delete(item.id);
        await delTx.done;

        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE', id: item.id, ok: res.ok });
        });
      }
    } catch {
      // Will retry
    }
  }
}

async function syncVoiceNotes() {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const store = tx.objectStore('sync_queue');
  const items = await getAllFromStore(store);
  await tx.done;

  for (const item of items) {
    if (item.type !== 'voice' || !item.payload) continue;

    try {
      // FormData can't be stored in IDB, so it is rebuilt from the parts the
      // client queued (see queueVoiceNote in src/lib/offline.ts).
      // The queue item's own id is the id the UI optimistically showed when the
      // note was recorded. Sending it lets the server treat a replayed sync as
      // the same note rather than a second one.
      const p = item.payload;
      const formData = new FormData();
      formData.append('id', item.id);
      formData.append('audio', new File([p.fileBuffer], p.fileName, { type: p.fileType }));
      if (p.entry_id) formData.append('entry_id', p.entry_id);
      if (p.quote_id) formData.append('quote_id', p.quote_id);
      if (p.project_id) formData.append('project_id', p.project_id);
      if (p.file_id) formData.append('file_id', p.file_id);
      if (p.duration_s) formData.append('duration_s', String(p.duration_s));

      const res = await fetch(item.url, { method: 'POST', body: formData });

      // 4xx will never succeed on a retry, so drop it rather than replaying the
      // same rejected audio on every future sync event.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        const delTx = db.transaction('sync_queue', 'readwrite');
        delTx.objectStore('sync_queue').delete(item.id);
        await delTx.done;

        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE', id: item.id, ok: res.ok });
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
