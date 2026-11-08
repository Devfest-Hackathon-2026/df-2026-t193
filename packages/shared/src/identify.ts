import { z } from 'zod';
import { parseFlow, type Flow } from './flow';
const id = z.string().min(1).max(128);
export const identifySchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('ok'),
      flow_id: id,
      flow_version: id,
      machine_id: id,
      screen_id: id,
      step_id: id,
    })
    .strict(),
  z.object({ status: z.literal('unknown') }).strict(),
  z.object({ status: z.literal('unsupported') }).strict(),
  z.object({ status: z.literal('sensitive') }).strict(),
]);
export type IdentifyResult = z.infer<typeof identifySchema>;
export type Identified = Extract<IdentifyResult, { status: 'ok' }>;
export function validateIdentification(result: Identified, data: unknown): Flow {
  const flow = parseFlow(data);
  if (
    flow.flow_id !== result.flow_id ||
    flow.machine_id !== result.machine_id ||
    flow.version !== result.flow_version ||
    !flow.screens.some((s) => s.screen_id === result.screen_id && s.first_step === result.step_id)
  ) {
    throw new Error('Identification does not match the registered flow');
  }
  return flow;
}
