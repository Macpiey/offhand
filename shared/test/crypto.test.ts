import { describe, it, expect, beforeAll } from 'vitest';
import {
  ready,
  generateKeyPair,
  deriveDaemonKeys,
  derivePhoneKeys,
  seal,
  open,
  sealBytes,
  openBytes,
  fingerprint,
  encodePairingCode,
  decodePairingCode,
  toB64u,
} from '../src/crypto.js';

beforeAll(async () => {
  await ready;
});

describe('E2E crypto helpers', () => {
  it('kx: daemon and phone derive mirrored session keys', async () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const d = deriveDaemonKeys(daemon, phone.publicKey);
    const p = derivePhoneKeys(phone, daemon.publicKey);
    expect(toB64u(d.tx)).toEqual(toB64u(p.rx));
    expect(toB64u(d.rx)).toEqual(toB64u(p.tx));
    expect(toB64u(d.tx)).not.toEqual(toB64u(d.rx));
  });

  it('seal/open round-trips arbitrary JSON', () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const d = deriveDaemonKeys(daemon, phone.publicKey);
    const p = derivePhoneKeys(phone, daemon.publicKey);
    const msg = { type: 'run-event', seq: 42, event: { type: 'text', chunk: 'héllo 👋\n' } };
    expect(open(seal(msg, d.tx), p.rx)).toEqual(msg);
    expect(open(seal(msg, p.tx), d.rx)).toEqual(msg);
  });

  it('envelope contains no plaintext', () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const d = deriveDaemonKeys(daemon, phone.publicKey);
    const env = seal({ secret: 'MARKER_dont_leak_9812' }, d.tx);
    expect(JSON.stringify(env)).not.toContain('MARKER_dont_leak_9812');
    expect(JSON.stringify(env)).not.toContain('secret');
  });

  it('open rejects tampered ciphertext', () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const d = deriveDaemonKeys(daemon, phone.publicKey);
    const p = derivePhoneKeys(phone, daemon.publicKey);
    const env = seal({ ok: true }, d.tx);
    const tampered = { ...env, c: env.c.slice(0, -2) + (env.c.endsWith('AA') ? 'BB' : 'AA') };
    expect(() => open(tampered, p.rx)).toThrow();
  });

  it('open rejects wrong key (different pairing)', () => {
    const daemonA = generateKeyPair();
    const phoneA = generateKeyPair();
    const daemonB = generateKeyPair();
    const phoneB = generateKeyPair();
    const a = deriveDaemonKeys(daemonA, phoneA.publicKey);
    const b = derivePhoneKeys(phoneB, daemonB.publicKey);
    expect(() => open(seal({ x: 1 }, a.tx), b.rx)).toThrow();
  });

  it('fingerprint is stable and shared across sides', () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const f1 = fingerprint(daemon.publicKey, phone.publicKey);
    const f2 = fingerprint(daemon.publicKey, phone.publicKey);
    expect(f1).toEqual(f2);
    expect(f1).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  });

  it('sealBytes/openBytes round-trips binary and rejects tampering', () => {
    const daemon = generateKeyPair();
    const phone = generateKeyPair();
    const d = deriveDaemonKeys(daemon, phone.publicKey);
    const p = derivePhoneKeys(phone, daemon.publicKey);
    const data = new Uint8Array(4096).map((_, i) => (i * 7 + 13) % 256);
    const blob = sealBytes(data, d.tx);
    expect(openBytes(blob, p.rx)).toEqual(data);
    const tampered = blob.slice();
    tampered[tampered.length - 1] = (tampered[tampered.length - 1]! ^ 0xff) & 0xff;
    expect(() => openBytes(tampered, p.rx)).toThrow();
    expect(() => openBytes(blob.slice(0, 10), p.rx)).toThrow();
  });

  it('pairing code round-trips', () => {
    const daemon = generateKeyPair();
    const code = encodePairingCode('483921', daemon.publicKey);
    const decoded = decodePairingCode(code);
    expect(decoded.token).toEqual('483921');
    expect(toB64u(decoded.daemonPublicKey)).toEqual(toB64u(daemon.publicKey));
  });
});
