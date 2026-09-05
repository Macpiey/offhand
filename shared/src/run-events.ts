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
