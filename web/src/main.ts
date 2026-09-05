import { parseServerMessage, type ServerMessage } from '@offhand/shared';

/**
 * M1 bare transcript page. Talks straight to the daemon's localhost WS.
 * Reconnects with backoff and resumes by sequence number — no gaps.
 */
const DAEMON_URL = 'ws://127.0.0.1:4317';

const statusEl = document.getElementById('status')!;
const transcriptEl = document.getElementById('transcript')!;
const form = document.getElementById('form') as HTMLFormElement;
const promptInput = document.getElementById('prompt') as HTMLInputElement;

let ws: WebSocket | null = null;
let lastSeq = 0;
let retryMs = 500;
let textSpan: HTMLElement | null = null; // current streaming text node

function connect(): void {
  ws = new WebSocket(DAEMON_URL);

  ws.onopen = () => {
    retryMs = 500;
    setStatus(`<span class="ok">●</span> connected to daemon`);
    if (lastSeq > 0) ws!.send(JSON.stringify({ type: 'resume', afterSeq: lastSeq }));
  };

  ws.onmessage = (e) => {
    let msg: ServerMessage;
    try {
      msg = parseServerMessage(String(e.data));
    } catch {
      return;
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
          (msg.runnerAvailable ? '<span class="ok">available</span>' : '<span class="bad">NOT FOUND</span>'),
      );
      if (lastSeq > 0 && ws) ws.send(JSON.stringify({ type: 'resume', afterSeq: lastSeq }));
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
          appendLine('tool', `🔐 approval requested: ${ev.action} — ${ev.detail} (M4 wires buttons)`);
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

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'prompt', prompt }));
  promptInput.value = '';
});

function appendLine(cls: string, text: string): void {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  transcriptEl.appendChild(div);
}

function setStatus(html: string): void {
  statusEl.innerHTML = html;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

connect();
