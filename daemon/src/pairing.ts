import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import {
  ready,
  generateKeyPair,
  deriveDaemonKeys,
  encodePairingCode,
  sessionIdFromDaemonKey,
  fingerprint,
  toB64u,
  fromB64u,
  type SessionKeys,
} from '@offhand/shared';

/**
 * Daemon pairing (M3). State lives in ~/.offhand/pairing.json — the daemon's
 * keypair and the paired phone's PUBLIC key. Secret keys never leave this
 * machine; the relay only ever transports the phone's public key.
 *
 * Unpaired flow: print a pairing code (token + daemon pubkey), poll the relay
 * until the phone answers with its public key, then persist. Re-pairing =
 * delete the file (or `--repair`).
 */

interface PairingFile {
  daemonPublicKey: string;
  daemonSecretKey: string;
  phonePublicKey: string;
}

const PAIRING_DIR = join(homedir(), '.offhand');
const PAIRING_PATH = join(PAIRING_DIR, 'pairing.json');
const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export interface PairingResult {
  keys: SessionKeys;
  sessionId: string;
  sas: string;
}

export async function ensurePairing(relayUrl: string, forceNew = false): Promise<PairingResult> {
  await ready;

  if (!forceNew && existsSync(PAIRING_PATH)) {
    const f = JSON.parse(readFileSync(PAIRING_PATH, 'utf8')) as PairingFile;
    const kp = { publicKey: fromB64u(f.daemonPublicKey), secretKey: fromB64u(f.daemonSecretKey) };
    const phonePk = fromB64u(f.phonePublicKey);
    return {
      keys: deriveDaemonKeys(kp, phonePk),
      sessionId: sessionIdFromDaemonKey(kp.publicKey),
      sas: fingerprint(kp.publicKey, phonePk),
    };
  }

  const kp = generateKeyPair();
  const token = String(randomInt(100000, 999999));
  const code = encodePairingCode(token, kp.publicKey);

  console.log('');
  console.log('  ── PAIRING ──────────────────────────────────────────────');
  console.log('  On your phone, open the web client and enter this code:');
  console.log('');
  console.log(`      ${code}`);
  console.log('');
  console.log('  Waiting for the phone to answer…');

  const base = relayUrl.replace(/\/$/, '');
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('pairing timed out — restart the daemon to retry');
    await new Promise((r) => setTimeout(r, POLL_MS));
    let res: Response;
    try {
      res = await fetch(`${base}/pair/${token}/answer`);
    } catch {
      continue; // relay unreachable; keep trying
    }
    if (res.status !== 200) continue;
    const body = (await res.json()) as { phonePublicKey: string };
    const phonePk = fromB64u(body.phonePublicKey);

    mkdirSync(PAIRING_DIR, { recursive: true });
    writeFileSync(
      PAIRING_PATH,
      JSON.stringify(
        {
          daemonPublicKey: toB64u(kp.publicKey),
          daemonSecretKey: toB64u(kp.secretKey),
          phonePublicKey: toB64u(phonePk),
        } satisfies PairingFile,
        null,
        2,
      ),
    );

    const sas = fingerprint(kp.publicKey, phonePk);
    console.log(`  Paired. Verify this fingerprint matches the phone: ${sas}`);
    console.log('  ─────────────────────────────────────────────────────────');
    return { keys: deriveDaemonKeys(kp, phonePk), sessionId: sessionIdFromDaemonKey(kp.publicKey), sas };
  }
}
