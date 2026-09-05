import webpush, { type PushSubscription } from 'web-push';

/**
 * Web push for approvals (M4). Push bodies transit Apple/Google, so payloads
 * carry ONLY opaque ids — the phone fetches and decrypts real content itself
 * (02-architecture.md). Subscriptions are in-memory for the POC: the client
 * re-subscribes on every connect, so a relay restart heals within seconds.
 */
export class PushService {
  /** session id → (endpoint → subscription) */
  private subs = new Map<string, Map<string, PushSubscription>>();
  readonly publicKey: string;

  constructor() {
    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      const pair = webpush.generateVAPIDKeys();
      publicKey = pair.publicKey;
      privateKey = pair.privateKey;
      console.warn('push: VAPID env keys missing — generated ephemeral keys (dev only)');
    }
    this.publicKey = publicKey;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:udbhav8@gmail.com',
      publicKey,
      privateKey,
    );
  }

  subscribe(sessionId: string, subscription: PushSubscription): void {
    let m = this.subs.get(sessionId);
    if (!m) {
      m = new Map();
      this.subs.set(sessionId, m);
    }
    m.set(subscription.endpoint, subscription);
  }

  /** Send an approval notification to every subscribed phone of a session. */
  async notifyApproval(sessionId: string, approvalId: string): Promise<number> {
    const m = this.subs.get(sessionId);
    if (!m) return 0;
    // RENDER_EXTERNAL_URL is set automatically on Render; the SW posts
    // verdicts back to this origin.
    const relayUrl = (process.env.RENDER_EXTERNAL_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
    const payload = JSON.stringify({ kind: 'approval', approvalId, session: sessionId, relayUrl });
    let sent = 0;
    for (const [endpoint, sub] of m) {
      try {
        await webpush.sendNotification(sub, payload, { TTL: 600, urgency: 'high' });
        sent++;
      } catch {
        m.delete(endpoint); // stale subscription — drop it
      }
    }
    return sent;
  }
}
