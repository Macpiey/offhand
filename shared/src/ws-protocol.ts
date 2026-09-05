import { z } from 'zod';
import { RunEventSchema } from './run-events.js';

/**
 * M1 localhost WS protocol (no crypto — that's M3; no relay — that's M2).
 * The message shapes are chosen so that in M3 the `payload` half becomes the
 * encrypted envelope body while the routing fields stay cleartext.
 */

/** Client → daemon */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prompt'), prompt: z.string().min(1) }),
  z.object({ type: z.literal('cancel'), runId: z.string() }),
  z.object({
    type: z.literal('approval-response'),
    runId: z.string(),
    approvalId: z.string(),
    approve: z.boolean(),
  }),
  /** Resume: ask for everything after the last seq the client saw. */
  z.object({ type: z.literal('resume'), afterSeq: z.number().int().nonnegative() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Daemon → client */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    workspace: z.string(),
    runner: z.string(),
    runnerAvailable: z.boolean(),
    lastSeq: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('run-started'), runId: z.string(), seq: z.number().int() }),
  z.object({
    type: z.literal('run-event'),
    runId: z.string(),
    seq: z.number().int(),
    event: RunEventSchema,
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const parseClientMessage = (raw: string): ClientMessage =>
  ClientMessageSchema.parse(JSON.parse(raw));
export const parseServerMessage = (raw: string): ServerMessage =>
  ServerMessageSchema.parse(JSON.parse(raw));
