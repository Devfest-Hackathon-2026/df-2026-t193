import { z } from 'zod';

const lines = z.array(z.string().min(1)).min(1);
const stage = z.number().int().nonnegative();

const targetSchema = z.object({
  row: z.number().int().min(1).max(3),
  col: z.number().int().min(1).max(3),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const guideStep = z.object({
  type: z.literal('guide'),
  stage,
  instruction: lines,
  reason: z.string().min(1),
  target: targetSchema,
  next: z.string().min(1),
});

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  next: z.string().min(1),
});

const choiceStep = z.object({
  type: z.literal('choice'),
  stage,
  question: lines,
  options: z.array(optionSchema).min(1),
});

const stopStep = z.object({
  type: z.literal('stop'),
  stage,
  reason: z.enum(['personal_info', 'payment']),
  resumable: z.boolean(),
  instruction: lines,
  note: lines.optional(),
  next: z.string().min(1).optional(),
});

const endStep = z.object({
  type: z.literal('end'),
  stage,
});

const stepSchema = z.discriminatedUnion('type', [guideStep, choiceStep, stopStep, endStep]);

export const flowSchema = z
  .object({
    schema_version: z.literal(1),
    version: z.string().min(1),
    flow_id: z.string().min(1),
    machine_id: z.string().min(1),
    source: z.enum(['mock', 'real']),
    collected_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reviewed: z.boolean(),
    stages: z.array(z.string().min(1)).min(1),
    screens: z
      .array(
        z.object({
          screen_id: z.string().min(1),
          description: z.string().min(1),
          first_step: z.string().min(1),
        }),
      )
      .min(1),
    steps: z.record(z.string(), stepSchema),
  })
  .superRefine((flow, ctx) => {
    const has = (id: string) => Object.hasOwn(flow.steps, id);
    const missing = (id: string, path: (string | number)[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown step: ${id}`, path });

    const screens = new Set<string>();
    flow.screens.forEach((screen, i) => {
      if (screens.has(screen.screen_id))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate screen ID', path: ['screens', i] });
      screens.add(screen.screen_id);
      if (!has(screen.first_step)) missing(screen.first_step, ['screens', i, 'first_step']);
    });

    for (const [id, step] of Object.entries(flow.steps)) {
      if (step.stage >= flow.stages.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Stage out of range',
          path: ['steps', id, 'stage'],
        });
      }
      if (step.type === 'guide' && !has(step.next)) missing(step.next, ['steps', id, 'next']);
      if (step.type === 'choice') {
        if (new Set(step.options.map((o) => o.id)).size !== step.options.length)
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate option ID', path: ['steps', id] });
        step.options.forEach((option, i) => {
          if (!has(option.next)) missing(option.next, ['steps', id, 'options', i, 'next']);
        });
      }
      if (step.type === 'stop' && step.resumable) {
        if (!step.next) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Resumable stop needs next',
            path: ['steps', id, 'next'],
          });
        } else if (!has(step.next)) {
          missing(step.next, ['steps', id, 'next']);
        }
      }
    }
  });

export type Flow = z.infer<typeof flowSchema>;
export type Step = z.infer<typeof stepSchema>;
export type GuideStep = z.infer<typeof guideStep>;
export type ChoiceStep = z.infer<typeof choiceStep>;
export type StopStep = z.infer<typeof stopStep>;
export type Target = z.infer<typeof targetSchema>;

/** Validates flow data. Unreviewed flows are never served to users. */
export function parseFlow(data: unknown): Flow {
  const flow = flowSchema.parse(data);
  if (!flow.reviewed) throw new Error(`Flow is not reviewed: ${flow.flow_id}`);
  return flow;
}
