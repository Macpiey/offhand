import {
  ready,
  generateKeyPair,
  derivePhoneKeys,
  decodePairingCode,
  sessionIdFromDaemonKey,
  fingerprint,
  seal,
  open,
  toB64u,
  fromB64u,
  EnvelopeSchema,
  parseServerMessage,
  parseRelayFrame,
  type ClientMessage,
  type ServerMessage,
  type SessionKeys,
} from '@offhand/shared';

/**
 * Bare transcript page (M1–M3). Modes:
 *  - relay (default once paired): E2E-encrypted envelopes through the relay.
 *    Pairing state (our keypair + daemon public key) lives in localStorage.
 *  - local (?local=1): plaintext to the daemon's localhost WS, for debugging.
 * Reconnects with backoff and resumes by sequence number — no gaps.
 */

interface StoredPairing {
  relayUrl: string;
  phonePublicKey: string;
  phoneSecretKey: string;
  daemonPublicKey: string;
}

const PAIRING_KEY = 'offhand.pairing';
const localMode = new URLSearchParams(location.search).has('local');

const statusEl = document.getElementById('status')!;
const transcriptEl = document.getElementById('transcript')!;
const pairingEl = document.getElementById('pairing')!;
const pairForm = document.getElementById('pair-form') as HTMLFormElement;
const pairRelayInput = document.getElementById('pair-relay') as HTMLInputElement;
const pairCodeInput = document.getElementById('pair-code') as HTMLInputElement;
const pairErrorEl = document.getElementById('pair-error')!;
const form = document.getElementById('form') as HTMLFormElement;
const promptInput = document.getElementById('prompt') as HTMLInputElement;

let ws: WebSocket | null = null;
let keys: SessionKeys | null = null;
let wsUrl = 'ws://127.0.0.1:4317';
let sas = '';
let lastSeq = 0;
let retryMs = 500;
let textSpan: HTMLElement | null = null; // current streaming text node

function loadPairing(): StoredPairing | null {
  const raw = localStorage.getItem(PAIRING_KEY);
  return raw ? (JSON.parse(raw) as StoredPairing) : null;
}

async function setupFromPairing(p: StoredPairing): Promise<void> {
  await ready;
  const phone = { publicKey: fromB64u(p.phonePublicKey), secretKey: fromB64u(p.phoneSecretKey) };
  const daemonPk = fromB64u(p.daemonPublicKey);
  keys = derivePhoneKeys(phone, daemonPk);
  sas = fingerprint(daemonPk, phone.publicKey);
  const session = sessionIdFromDaemonKey(daemonPk);
  const base = p.relayUrl.replace(/^http/, 'ws').replace(/\/$/, '');
  wsUrl = `${base}/ws?session=${encodeURIComponent(session)}&role=phone`;
  void setupPush(p.relayUrl, session);
}

/**
 * Web push (M4): register the SW and subscribe with the relay's VAPID key.
 * Push payloads carry only opaque ids; verdicts go back via the SW's action
 * buttons. Permission needs a user gesture, so we show a button until granted.
 */
async function setupPush(relayUrl: string, session: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.register('/sw.js');

  const subscribe = async () => {
    try {
      const { publicKey } = (await (await fetch(`${relayUrl}/push/vapid`)).json()) as {
        publicKey: string;
      };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      await fetch(`${relayUrl}/push/subscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session, subscription: sub.toJSON() }),
      });
      document.getElementById('enable-push')?.remove();
    } catch (e) {
      console.warn('push subscribe failed', e);
    }
  };

  if (Notification.permission === 'granted') {
    void subscribe();
    return;
  }
  if (Notification.permission === 'denied') return;

  const btn = document.createElement('button');
  btn.id = 'enable-push';
  btn.textContent = '🔔 Enable approval notifications';
  btn.onclick = () => {
    void Notification.requestPermission().then((perm) => {
      if (perm === 'granted') void subscribe();
      else btn.remove();
    });
  };
  statusEl.after(btn);
}

function sendToDaemon(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (keys) {
    ws.send(JSON.stringify({ kind: 'peer', payload: seal(msg, keys.tx) }));
  } else {
    ws.send(JSON.stringify(msg)); // local plaintext mode
  }
}

function connect(): void {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    retryMs = 500;
    setStatus(`<span class="ok">●</span> connected ${keys ? `· E2E 🔒 ${sas}` : 'to daemon (local)'}`);
    sendToDaemon({ type: 'resume', afterSeq: lastSeq });
  };

  ws.onmessage = (e) => {
    const raw = String(e.data);
    let msg: ServerMessage;
    try {
      if (keys) {
        const frame = parseRelayFrame(raw);
        if (frame.kind === 'presence') {
          const note = frame.daemonOnline
            ? ''
            : ` · <span class="bad">daemon offline</span>${
                frame.lastSeenMs ? ` (last seen ${new Date(frame.lastSeenMs).toLocaleTimeString()})` : ''
              }`;
          setStatus(`<span class="ok">●</span> connected · E2E 🔒 ${sas}${note}`);
          if (frame.daemonOnline) sendToDaemon({ type: 'resume', afterSeq: lastSeq });
          return;
        }
        if (frame.kind !== 'peer') return;
        const decrypted = open(EnvelopeSchema.parse(frame.payload), keys.rx);
        msg = parseServerMessage(JSON.stringify(decrypted));
      } else {
        msg = parseServerMessage(raw);
      }
    } catch {
      return; // undecryptable or malformed — dropped, never fatal
    }
    handle(msg);
  };

  ws.onclose = () => {
    setStatus(`<span class="bad">●</span> disconnected — retrying in ${retryMs}ms`);
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 10_000);
  };
}

function handle(msg: ServerMessage): void {
  switch (msg.type) {
    case 'hello':
      setStatus(
        `<span class="ok">●</span> ${escapeHtml(msg.workspace)} · runner: ${msg.runner} ` +
          (msg.runnerAvailable ? '<span class="ok">available</span>' : '<span class="bad">NOT FOUND</span>') +
          (keys ? ` · E2E 🔒 ${sas}` : ''),
      );
      if (lastSeq > 0) sendToDaemon({ type: 'resume', afterSeq: lastSeq });
      return;
    case 'run-started':
      if (msg.seq <= lastSeq) return;
      lastSeq = msg.seq;
      textSpan = null;
      appendLine('run', `▶ run ${msg.runId.slice(0, 8)}`);
      return;
    case 'run-event': {
      if (msg.seq <= lastSeq) return; // replay dedupe
      lastSeq = msg.seq;
      const ev = msg.event;
      switch (ev.type) {
        case 'text':
          if (!textSpan) {
            textSpan = document.createElement('div');
            transcriptEl.appendChild(textSpan);
          }
          textSpan.textContent += ev.chunk;
          break;
        case 'tool':
          textSpan = null;
          appendLine('tool', `⚙ ${ev.summary}`);
          break;
        case 'approval':
          textSpan = null;
          renderApproval(msg.runId, ev.id, ev.action, ev.detail, ev.risk);
          break;
        case 'done':
          textSpan = null;
          appendLine('done', `✔ done${ev.summary ? ` — ${ev.summary}` : ''}`);
          break;
        case 'error':
          textSpan = null;
          appendLine('err', `✖ ${ev.message}`);
          break;
      }
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
  }
}

// ---- pairing UI -----------------------------------------------------------

pairForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    pairErrorEl.textContent = '';
    try {
      await ready;
      const relayUrl = pairRelayInput.value.trim().replace(/\/$/, '');
      const { token, daemonPublicKey } = decodePairingCode(pairCodeInput.value.trim());
      const phone = generateKeyPair();
      const res = await fetch(`${relayUrl}/pair/${encodeURIComponent(token)}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phonePublicKey: toB64u(phone.publicKey) }),
      });
      if (!res.ok) throw new Error(`relay said ${res.status} — is the daemon waiting to pair?`);
      const pairing: StoredPairing = {
        relayUrl,
        phonePublicKey: toB64u(phone.publicKey),
        phoneSecretKey: toB64u(phone.secretKey),
        daemonPublicKey: toB64u(daemonPublicKey),
      };
      localStorage.setItem(PAIRING_KEY, JSON.stringify(pairing));
      pairingEl.style.display = 'none';
      await setupFromPairing(pairing);
      connect();
    } catch (err) {
      pairErrorEl.textContent = err instanceof Error ? err.message : String(err);
    }
  })();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || !ws || ws.readyState !== WebSocket.OPEN) return;
  sendToDaemon({ type: 'prompt', prompt });
  promptInput.value = '';
});

function appendLine(cls: string, text: string): void {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  transcriptEl.appendChild(div);
}

function renderApproval(runId: string, approvalId: string, action: string, detail: string, risk: 'low' | 'high'): void {
  const box = document.createElement('div');
  box.className = 'approval' + (risk === 'high' ? ' high' : '');
  const label = document.createElement('div');
  label.textContent = `🔐 ${risk === 'high' ? '⚠ HIGH RISK — ' : ''}${action}: ${detail}`;
  const buttons = document.createElement('div');
  buttons.className = 'approval-buttons';
  const mk = (text: string, cls: string, approve: boolean) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.className = cls;
    b.onclick = () => {
      sendToDaemon({ type: 'approval-response', runId, approvalId, approve });
      label.textContent += approve ? ' — ✔ approved' : ' — ✖ denied';
      buttons.remove();
    };
    return b;
  };
  buttons.append(mk('Approve', 'approve', true), mk('Deny', 'deny', false));
  box.append(label, buttons);
  transcriptEl.appendChild(box);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function setStatus(html: string): void {
  statusEl.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---- boot -----------------------------------------------------------------

void (async () => {
  if (localMode) {
    connect();
    return;
  }
  const stored = loadPairing();
  if (stored) {
    await setupFromPairing(stored);
    connect();
  } else {
    setStatus('not paired');
    pairingEl.style.display = 'block';
  }
})();
