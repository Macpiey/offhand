/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// offhand service worker — versioned precache built from the ACTUAL deploy
// manifest ($service-worker). The entire app (shell + chunks + static files)
// is cached atomically at install, so the offline/cold-open fallback can
// never mix shell and chunks from different deploys ("500 Internal Error"
// class of bugs is impossible by construction).
//
// Push payloads carry ONLY opaque ids — no content reaches push services.

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `offhand-${version}`;
// The SPA fallback shell isn't part of the adapter manifest — precache it
// explicitly alongside the build so offline/cold opens always have a shell
// whose chunks are in the same cache.
const SHELL = '/index.html';
const ASSETS = new Set([...build, ...files, ...prerendered]);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([...ASSETS, SHELL]))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // App navigations: fresh HTML when the network answers, otherwise the
  // precached shell — whose chunks are guaranteed present in this cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const shell = (await caches.match(SHELL)) ?? (await caches.match('/'));
        return shell ?? Response.error();
      }),
    );
    return;
  }

  // Precached assets (hashed chunks + static files): cache-first.
  if (ASSETS.has(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            // Guard: never cache an HTML response under an asset path (a SPA
            // rewrite answering a missing file must not poison the cache).
            const type = res.headers.get('content-type') || '';
            if (res.ok && !type.includes('text/html')) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
  }
});

interface PushData {
  kind?: string;
  relayUrl?: string;
  session?: string;
  approvalId?: string;
}

sw.addEventListener('push', (event) => {
  let data: PushData = {};
  try {
    data = event.data ? (event.data.json() as PushData) : {};
  } catch {
    /* ignore */
  }
  if (data.kind !== 'approval') return;
  event.waitUntil(
    sw.registration.showNotification('offhand — approval waiting', {
      body: 'Your agent is paused on a permission request.',
      tag: 'offhand-approval',
      // @ts-expect-error renotify is valid in browsers even if lib.dom lags
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

sw.addEventListener('notificationclick', (event) => {
  const data = (event.notification.data || {}) as PushData;
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
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return sw.clients.openWindow('/');
    }),
  );
});
