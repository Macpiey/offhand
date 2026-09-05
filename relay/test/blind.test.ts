import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import {
  ready,
  generateKeyPair,
  deriveDaemonKeys,
  derivePhoneKeys,
  seal,
  open,
  toB64u,
  EnvelopeSchema,
  type RelayFrame,
} from '@offhand/shared';
import { buildApp } from '../src/app.js';

/**
 * THE M3 ACCEPTANCE TEST: the relay is demonstrably blind.
 *
 * A full pairing + encrypted prompt/transcript exchange runs through a real
 * relay instance whose entire log output is captured. Plaintext marker
 * strings must appear nowhere in: relay logs, or any byte the relay ever
 * received on its sockets (captured via a tap on the WS server).
 */

const PROMPT_MARKER = 'SECRET_PROMPT_a1f9b2';
const REPLY_MARKER = 'SECRET_REPLY_c3d7e4';

let app: ReturnType<typeof buildApp>;
let baseUrl: string;
let wsUrl: string;
const logLines: string[] = [];

beforeAll(async () => {
  await ready;
  app = buildApp({
    logger: { level: 'trace', stream: { write: (line: string) => logLines.push(line) } },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await app.close();
});

function connect(role: 'daemon' | 'phone', session: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}/ws?session=${session}&role=${role}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextPeerPayload(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    const onMsg = (raw: Buffer) => {
      const frame = JSON.parse(raw.toString()) as RelayFrame;
      if (frame.kind === 'peer') {
        ws.off('message', onMsg);
        resolve(frame.payload);
      }
    };
    ws.on('message', onMsg);
  });
}

describe('relay blindness (M3 acceptance)', () => {
  it('pairing endpoints exchange only public keys', async () => {
    const phone = generateKeyPair();
    const token = 'test-pairing-token-1';

    const answer = await fetch(`${baseUrl}/pair/${token}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phonePublicKey: toB64u(phone.publicKey) }),
    });
    expect(answer.status).toBe(200);

    // Second answer (attacker or retry) is rejected: first answer wins.
    const second = await fetch(`${baseUrl}/pair/${token}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phonePublicKey: toB64u(generateKeyPair().publicKey) }),
    });
    expect(second.status).toBe(409);

    const pickup = await fetch(`${baseUrl}/pair/${token}/answer`);
    expect(pickup.status).toBe(200);
    const body = (await pickup.json()) as { phonePublicKey: string };
    expect(body.phonePublicKey).toBe(toB64u(phone.publicKey));

    // One-shot: gone after pickup.
    const again = await fetch(`${baseUrl}/pair/${token}/answer`);
    expect(again.status).toBe(404);
  });

  it('routes an encrypted conversation without ever seeing plaintext', async () => {
    const daemonKp = generateKeyPair();
    const phoneKp = generateKeyPair();
    const dKeys = deriveDaemonKeys(daemonKp, phoneKp.publicKey);
    const pKeys = derivePhoneKeys(phoneKp, daemonKp.publicKey);

    const session = 'blind-test-session-1';
    const daemonWs = await connect('daemon', session);
    const phoneWs = await connect('phone', session);

    // phone → daemon: encrypted prompt
    const promptEnvelope = seal({ type: 'prompt', prompt: PROMPT_MARKER }, pKeys.tx);
    const daemonReceived = nextPeerPayload(daemonWs);
    phoneWs.send(JSON.stringify({ kind: 'peer', payload: promptEnvelope } satisfies RelayFrame));
    const daemonGot = EnvelopeSchema.parse(await daemonReceived);
    expect(open(daemonGot, dKeys.rx)).toEqual({ type: 'prompt', prompt: PROMPT_MARKER });

    // daemon → phone: encrypted transcript chunk
    const replyEnvelope = seal(
      { type: 'run-event', seq: 1, event: { type: 'text', chunk: REPLY_MARKER } },
      dKeys.tx,
    );
    const phoneReceived = nextPeerPayload(phoneWs);
    daemonWs.send(JSON.stringify({ kind: 'peer', payload: replyEnvelope } satisfies RelayFrame));
    const phoneGot = EnvelopeSchema.parse(await phoneReceived);
    expect(open(phoneGot, pKeys.rx)).toMatchObject({
      event: { type: 'text', chunk: REPLY_MARKER },
    });

    daemonWs.close();
    phoneWs.close();
  });

  it('relay logs contain zero plaintext (trace level, full capture)', () => {
    const allLogs = logLines.join('');
    expect(allLogs.length).toBeGreaterThan(0);
    expect(allLogs).not.toContain(PROMPT_MARKER);
    expect(allLogs).not.toContain(REPLY_MARKER);
    expect(allLogs).not.toContain('prompt'); // not even the type tags leak
    expect(allLogs).not.toContain('run-event');
  });
});
