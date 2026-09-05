// offhand service worker: approval push notifications + SPA cache strategy.
// - navigations: network-first with cached-shell fallback (never a dead app)
// - hashed immutable assets: cache-first (fast, safe — content-addressed)
// Push payloads carry ONLY opaque ids — no content reaches push services.

const CACHE = 'offhand-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // App shell navigations: fresh HTML when online, cached shell when not.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Immutable hashed assets: cache-first.
  if (url.pathname.startsWith('/_app/immutable/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* ignore */
  }
  if (data.kind !== 'approval') return;
  event.waitUntil(
    self.registration.showNotification('offhand — approval waiting', {
      body: 'Your agent is paused on a permission request.',
      tag: 'offhand-approval',
      renotify: true,
      requireInteraction: true,
      data,
      actions: [
        { action: 'approve', title: 'Approve' },
        { action: 'deny', title: 'Deny' },
      ],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  if ((event.action === 'approve' || event.action === 'deny') && data.relayUrl) {
    event.waitUntil(
      fetch(`${data.relayUrl}/push/verdict`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session: data.session,
          approvalId: data.approvalId,
          approve: event.action === 'approve',
        }),
      }).catch(() => {}),
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
