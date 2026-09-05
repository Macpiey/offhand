import jsQR from 'jsqr';
import {
  ready,
  generateKeyPair,
  derivePhoneKeys,
  decodePairingCode,
  sessionIdFromDaemonKey,
  fingerprint,
  seal,
  open,
  openBytes,
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
const A2HS_DISMISSED_KEY = 'offhand.a2hs-dismissed';
const DEFAULT_RELAY_URL = 'https://offhand-relay.onrender.com';
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
const settingsEl = document.getElementById('settings')!;
const settingsInfoEl = document.getElementById('settings-info')!;
const a2hsHintEl = document.getElementById('a2hs-hint')!;

let ws: WebSocket | null = null;
let keys: SessionKeys | null = null;
let wsUrl = 'ws://127.0.0.1:4317';
let sas = '';
let relayHttpUrl = ''; // for artifact fetches (relay mode only)
let sessionIdForBlobs = '';
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
  relayHttpUrl = p.relayUrl.replace(/\/$/, '');
  sessionIdForBlobs = session;
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
        case 'artifact':
          textSpan = null;
          renderArtifact(ev.blobId, ev.contentHint, ev.label);
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

async function pairWithCode(code: string, relayOverride?: string): Promise<void> {
  await ready;
  const relayUrl = (relayOverride?.trim() || DEFAULT_RELAY_URL).replace(/\/$/, '');
  const { token, daemonPublicKey } = decodePairingCode(code.trim());
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
}

pairForm.addEventListener('submit', (e) => {
  e.preventDefault();
  void (async () => {
    pairErrorEl.textContent = '';
    try {
      await pairWithCode(pairCodeInput.value, pairRelayInput.value);
    } catch (err) {
      pairErrorEl.textContent = err instanceof Error ? err.message : String(err);
    }
  })();
});

// ---- in-app QR scanner ------------------------------------------------------
// iOS quirk: scanning with the Camera app opens Safari, whose storage is
// separate from the installed PWA — so the app scans QR codes itself.

const scannerEl = document.getElementById('scanner')!;
const scanVideo = document.getElementById('scan-video') as HTMLVideoElement;
let scanStream: MediaStream | null = null;
let scanning = false;

document.getElementById('scan-qr')!.addEventListener('click', () => {
  void (async () => {
    pairErrorEl.textContent = '';
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
    } catch {
      pairErrorEl.textContent = 'Camera access denied — paste the code manually instead.';
      return;
    }
    scannerEl.style.display = 'flex';
    scanVideo.srcObject = scanStream;
    await scanVideo.play();
    scanning = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      if (!scanning) return;
      if (scanVideo.readyState === scanVideo.HAVE_ENOUGH_DATA) {
        canvas.width = scanVideo.videoWidth;
        canvas.height = scanVideo.videoHeight;
        ctx.drawImage(scanVideo, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(image.data, image.width, image.height);
        if (hit?.data) {
          stopScanner();
          void handleScannedText(hit.data);
          return;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();
});

document.getElementById('scan-cancel')!.addEventListener('click', stopScanner);

function stopScanner(): void {
  scanning = false;
  scannerEl.style.display = 'none';
  scanStream?.getTracks().forEach((t) => t.stop());
  scanStream = null;
}

/** Accepts either the full pairing link (the daemon's QR) or a raw code. */
async function handleScannedText(text: string): Promise<void> {
  try {
    let code = text.trim();
    let relay: string | undefined;
    if (/^https?:\/\//i.test(code)) {
      const hash = new URL(code).hash.replace(/^#/, '');
      const params = new URLSearchParams(hash);
      code = params.get('pair') ?? '';
      relay = params.get('relay') ?? undefined;
      if (!code) throw new Error('QR does not contain a pairing code');
    }
    setStatus('pairing…');
    await pairWithCode(code, relay);
  } catch (err) {
    setStatus('not paired');
    pairingEl.style.display = 'block';
    pairErrorEl.textContent = err instanceof Error ? err.message : String(err);
  }
}

// ---- settings + A2HS -------------------------------------------------------

document.getElementById('settings-btn')!.addEventListener('click', () => {
  const showing = settingsEl.style.display !== 'none';
  settingsEl.style.display = showing ? 'none' : 'block';
  if (!showing) {
    const p = loadPairing();
    (document.getElementById('unpair') as HTMLButtonElement).style.display = p ? 'block' : 'none';
    settingsInfoEl.innerHTML = '';
    const rows: [string, string][] = p
      ? [
          ['E2E fingerprint (must match daemon)', sas || '—'],
          ['Session', sessionIdForBlobs || '—'],
          ['Relay', p.relayUrl],
          ['Installed as app', isStandalone() ? 'yes' : 'no — use Add to Home Screen for notifications'],
        ]
      : [['Pairing', 'not paired']];
    for (const [dt, dd] of rows) {
      const dtEl = document.createElement('dt');
      dtEl.textContent = dt;
      const ddEl = document.createElement('dd');
      ddEl.textContent = dd;
      settingsInfoEl.append(dtEl, ddEl);
    }
  }
});

document.getElementById('unpair')!.addEventListener('click', () => {
  if (!confirm('Unpair this device? You will need to re-scan a pairing code.')) return;
  localStorage.removeItem(PAIRING_KEY);
  location.href = location.pathname; // drop any #pair hash and reload
});

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function maybeShowA2HSHint(): void {
  if (!isIOS() || isStandalone() || localStorage.getItem(A2HS_DISMISSED_KEY)) return;
  a2hsHintEl.style.display = 'block';
  document.getElementById('a2hs-dismiss')!.addEventListener('click', () => {
    localStorage.setItem(A2HS_DISMISSED_KEY, '1');
    a2hsHintEl.style.display = 'none';
  });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || !ws || ws.readyState !== WebSocket.OPEN) return;
  sendToDaemon({ type: 'prompt', prompt });
  promptInput.value = '';
});

function renderArtifact(blobId: string, contentHint: string, label: string): void {
  if (!keys || !relayHttpUrl) {
    appendLine('tool', `📎 artifact: ${label} (relay mode required to view)`);
    return;
  }
  const holder = document.createElement('div');
  holder.className = 'artifact';
  holder.textContent = `📎 fetching ${label}…`;
  transcriptEl.appendChild(holder);
  void (async () => {
    try {
      const res = await fetch(`${relayHttpUrl}/artifacts/${encodeURIComponent(sessionIdForBlobs)}/${encodeURIComponent(blobId)}`);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const encrypted = new Uint8Array(await res.arrayBuffer());
      const data = openBytes(encrypted, keys!.rx); // decrypt locally — relay never sees pixels
      if (contentHint.startsWith('image/')) {
        const url = URL.createObjectURL(new Blob([data.slice().buffer], { type: contentHint }));
        holder.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = label;
        holder.appendChild(img);
      } else {
        holder.textContent = `📎 ${label} (${data.length} bytes, ${contentHint})`;
      }
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    } catch (e) {
      holder.textContent = `📎 ${label} — failed to load (${e instanceof Error ? e.message : e})`;
    }
  })();
}

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
  maybeShowA2HSHint();
  if (localMode) {
    connect();
    return;
  }

  // Scan-to-pair: the daemon's QR encodes /#pair=<code>&relay=<url>.
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const hashCode = hashParams.get('pair');
  if (hashCode) {
    history.replaceState(null, '', location.pathname); // never keep the code in history
    const hashRelay = hashParams.get('relay') ?? undefined;
    const existing = loadPairing();
    if (!existing || confirm('Already paired. Replace the existing pairing with the scanned one?')) {
      setStatus('pairing…');
      try {
        await pairWithCode(hashCode, hashRelay);
        return;
      } catch (err) {
        setStatus('not paired');
        pairingEl.style.display = 'block';
        pairErrorEl.textContent = err instanceof Error ? err.message : String(err);
        return;
      }
    }
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
