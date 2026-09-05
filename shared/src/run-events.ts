import { z } from 'zod';

/**
 * Normalised events emitted by any AgentRunner (02-architecture.md §Runner
 * interface). Every agent CLI's output is mapped into this shape — this is the
 * product's protocol, the CLIs are implementation details.
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), chunk: z.string() }),
  z.object({ type: z.literal('tool'), name: z.string(), summary: z.string() }),
  z.object({
    type: z.literal('approval'),
    id: z.string(),
    action: z.string(),
    detail: z.string(),
    risk: z.enum(['low', 'high']),
  }),
  /** Encrypted blob reference (M5): phone fetches + decrypts locally. */
  z.object({
    type: z.literal('artifact'),
    blobId: z.string(),
    contentHint: z.string(), // e.g. image/png — relay may see this, content never
    label: z.string(),
  }),
  /** Verdict echo: makes answered approvals resolve correctly on replay. */
  z.object({ type: z.literal('approval-result'), id: z.string(), approve: z.boolean() }),
  z.object({ type: z.literal('done'), summary: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

export const RunSpecSchema = z.object({
  runId: z.string(),
  prompt: z.string().min(1),
  /** Absolute path of the workspace the agent runs in. */
  workspace: z.string(),
});
export type RunSpec = z.infer<typeof RunSpecSchema>;
