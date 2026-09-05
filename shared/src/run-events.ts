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
    /** Optional content preview (edit diff / command) shown in the approval sheet. */
    preview: z.string().optional(),
    /** AskUserQuestion payload: render the actual question with options. */
    question: z
      .object({
        text: z.string(),
        options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
        multiSelect: z.boolean().optional(),
      })
      .optional(),
  }),
  /** Encrypted blob reference (M5): phone fetches + decrypts locally. */
  z.object({
    type: z.literal('artifact'),
    blobId: z.string(),
    contentHint: z.string(), // e.g. image/png — relay may see this, content never
    label: z.string(),
  }),
  /** Verdict echo: makes answered approvals resolve correctly on replay. */
  z.object({
    type: z.literal('approval-result'),
    id: z.string(),
    approve: z.boolean(),
    /** The option the user picked when the approval was a question. */
    answer: z.string().optional(),
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
  /** Model override (CLI-specific id/alias); omit = CLI default. */
  model: z.string().optional(),
  /** Agent-side conversation id to resume (continuity across runs). */
  resumeConversationId: z.string().optional(),
});
export type RunSpec = z.infer<typeof RunSpecSchema>;

/** Callback surface for runner-internal metadata (not user events). */
export interface RunCallbacks {
  /** Fired when the agent CLI reveals its conversation/session id. */
  onConversationId?: (id: string) => void;
}
