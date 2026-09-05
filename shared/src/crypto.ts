import sodium from 'libsodium-wrappers';
import { z } from 'zod';

/**
 * E2E crypto helpers (M3) — libsodium, per 02-architecture.md:
 *  - pairing = X25519 key exchange (crypto_kx); the pairing code carries the
 *    daemon's public key + a short-lived token, so the RELAY never controls
 *    identity — it only ever sees public keys and routing metadata
 *  - every payload is crypto_secretbox ciphertext in a minimal envelope
 *
 * Directional keys: daemon uses crypto_kx *server* keys, phone uses *client*
 * keys. tx of one side is rx of the other.
 */

export const ready: Promise<void> = sodium.ready;

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SessionKeys {
  rx: Uint8Array;
  tx: Uint8Array;
}

/** Envelope cleartext is ONLY version + nonce + ciphertext. */
export const EnvelopeSchema = z.object({
  v: z.literal(1),
  n: z.string(), // nonce, base64url
  c: z.string(), // secretbox ciphertext, base64url
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const toB64u = (bytes: Uint8Array): string =>
  sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
export const fromB64u = (s: string): Uint8Array =>
  sodium.from_base64(s, sodium.base64_variants.URLSAFE_NO_PADDING);

export function generateKeyPair(): KeyPair {
  const kp = sodium.crypto_kx_keypair();
  return { publicKey: kp.publicKey, secretKey: kp.privateKey };
}

/** Daemon side (server role in crypto_kx). */
export function deriveDaemonKeys(daemon: KeyPair, phonePublicKey: Uint8Array): SessionKeys {
  const { sharedRx, sharedTx } = sodium.crypto_kx_server_session_keys(
    daemon.publicKey,
    daemon.secretKey,
    phonePublicKey,
  );
  return { rx: sharedRx, tx: sharedTx };
}

/** Phone side (client role in crypto_kx). */
export function derivePhoneKeys(phone: KeyPair, daemonPublicKey: Uint8Array): SessionKeys {
  const { sharedRx, sharedTx } = sodium.crypto_kx_client_session_keys(
    phone.publicKey,
    phone.secretKey,
    daemonPublicKey,
  );
  return { rx: sharedRx, tx: sharedTx };
}

/** Encrypt any JSON-serialisable value into an envelope. */
export function seal(value: unknown, txKey: Uint8Array): Envelope {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = sodium.from_string(JSON.stringify(value));
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, txKey);
  return { v: 1, n: toB64u(nonce), c: toB64u(ciphertext) };
}

/** Decrypt an envelope. Throws on tampering or wrong key. */
export function open(envelope: Envelope, rxKey: Uint8Array): unknown {
  const parsed = EnvelopeSchema.parse(envelope);
  const plaintext = sodium.crypto_secretbox_open_easy(
    fromB64u(parsed.c),
    fromB64u(parsed.n),
    rxKey,
  );
  return JSON.parse(sodium.to_string(plaintext));
}

/**
 * Binary artifact encryption (M5): nonce (24 bytes) prepended to secretbox
 * ciphertext. Uploaded blobs are pure opaque bytes to the relay.
 */
export function sealBytes(data: Uint8Array, txKey: Uint8Array): Uint8Array {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(data, nonce, txKey);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce);
  out.set(ciphertext, nonce.length);
  return out;
}

/** Decrypt a sealBytes blob. Throws on tampering or wrong key. */
export function openBytes(blob: Uint8Array, rxKey: Uint8Array): Uint8Array {
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
  if (blob.length <= nonceLen) throw new Error('blob too short');
  return sodium.crypto_secretbox_open_easy(blob.slice(nonceLen), blob.slice(0, nonceLen), rxKey);
}

/**
 * Short authentication string both sides display after pairing; the human
 * compares them to rule out a middleman who answered the pairing token first.
 */
export function fingerprint(daemonPublicKey: Uint8Array, phonePublicKey: Uint8Array): string {
  const both = new Uint8Array(daemonPublicKey.length + phonePublicKey.length);
  both.set(daemonPublicKey);
  both.set(phonePublicKey, daemonPublicKey.length);
  const hash = sodium.crypto_generichash(8, both);
  const hex = sodium.to_hex(hash);
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/** Pairing code the user copies from daemon to phone: token + daemon pubkey. */
export function encodePairingCode(token: string, daemonPublicKey: Uint8Array): string {
  return `${token}.${toB64u(daemonPublicKey)}`;
}

export function decodePairingCode(code: string): { token: string; daemonPublicKey: Uint8Array } {
  const dot = code.indexOf('.');
  if (dot === -1) throw new Error('malformed pairing code');
  return { token: code.slice(0, dot), daemonPublicKey: fromB64u(code.slice(dot + 1)) };
}

/**
 * Routing session id, derived from the daemon's public key so both endpoints
 * compute it independently — nothing extra travels through the relay. It is
 * routing metadata (the relay sees it by design).
 */
export function sessionIdFromDaemonKey(daemonPublicKey: Uint8Array): string {
  return toB64u(sodium.crypto_generichash(12, daemonPublicKey));
}
