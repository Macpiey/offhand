// offhand service worker (M4): approval push notifications with action
// buttons. Push payloads carry ONLY opaque ids — no prompt/code content ever
// reaches the push services.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
      // Constant tag: repeated approval pushes replace the previous
      // notification instead of stacking (founder friction 2026-09-05).
      tag: 'offhand-approval',
      renotify: true,
      requireInteraction: true,
      data,
      actions: [
        { action: 'approve', title: '✔ Approve' },
        { action: 'deny', title: '✖ Deny' },
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

  // Body tap: focus or open the app to review in context.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
