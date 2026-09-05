/**
 * Web push subscription (M4, ported to W3). Push payloads carry only opaque
 * ids; verdicts return via the SW's action buttons where the platform shows
 * them (Android/desktop; iOS opens the app instead).
 */
export async function setupPush(relayUrl: string, session: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.register('/sw.js');

  if (Notification.permission !== 'granted') return; // UI offers a button elsewhere
  await subscribe(reg, relayUrl, session);
}

export async function requestPushPermission(relayUrl: string, session: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.register('/sw.js');
  await subscribe(reg, relayUrl, session);
  return true;
}

async function subscribe(reg: ServiceWorkerRegistration, relayUrl: string, session: string): Promise<void> {
  try {
    const { publicKey } = (await (await fetch(`${relayUrl}/push/vapid`)).json()) as { publicKey: string };
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
    await fetch(`${relayUrl}/push/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session, subscription: sub.toJSON() }),
    });
  } catch (e) {
    console.warn('push subscribe failed', e);
  }
}

export function pushGranted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
