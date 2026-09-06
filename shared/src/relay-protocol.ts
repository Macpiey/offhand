import { z } from 'zod';

/**
 * M2 relay framing. The relay is a dumb pipe: it forwards `peer` frames
 * between the daemon and phone(s) of a session without inspecting `payload`.
 * In M3 `payload` becomes an encrypted envelope — the relay's code should not
 * need to change, which is why it must never peek inside payloads.
 *
 * `presence` frames are relay-originated (the one thing the relay is allowed
 * to say itself): honest device state, per 01-product-spec.md J3.
 */
export const RelayFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('peer'), payload: z.unknown() }),
  z.object({
    kind: z.literal('presence'),
    daemonOnline: z.boolean(),
    /** ms since epoch of the daemon's last connection activity, if known. */
    lastSeenMs: z.number().int().nonnegative().optional(),
  }),
  /**
   * daemon → relay: ask the relay to web-push the session's phones. Carries
   * ONLY an opaque approval id — never content (push bodies transit
   * Apple/Google; 02-architecture.md).
   */
  z.object({ kind: z.literal('notify'), notice: z.enum(['approval', 'drop']), id: z.string().optional() }),
  /** relay → daemon: verdict delivered via push-notification action button. */
  z.object({ kind: z.literal('verdict'), approvalId: z.string(), approve: z.boolean() }),
  z.object({ kind: z.literal('ping') }),
  z.object({ kind: z.literal('pong') }),
]);
export type RelayFrame = z.infer<typeof RelayFrameSchema>;

export const RelayRoleSchema = z.enum(['daemon', 'phone']);
export type RelayRole = z.infer<typeof RelayRoleSchema>;

/** Session ids are shared secrets in M2 (pairing key exchange arrives in M3). */
export const SESSION_ID_MIN_LENGTH = 12;

export const parseRelayFrame = (raw: string): RelayFrame =>
  RelayFrameSchema.parse(JSON.parse(raw));
