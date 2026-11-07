import type { Flow, Step, Target } from './flow';

export function getStep(flow: Flow, stepId: string): Step {
  const step = flow.steps[stepId];
  if (!step) throw new Error(`Unknown step: ${stepId}`);
  return step;
}

/** The step after the user acts on a guide step or a resumable stop. */
export function nextStep(flow: Flow, stepId: string): string | null {
  const step = getStep(flow, stepId);
  if (step.type === 'guide') return step.next;
  if (step.type === 'stop' && step.resumable) return step.next ?? null;
  return null;
}

/** Returns null for an option that is not on this step, so a wrong answer can never move the flow. */
export function selectOption(flow: Flow, stepId: string, optionId: string): string | null {
  const step = getStep(flow, stepId);
  if (step.type !== 'choice') return null;
  return step.options.find((option) => option.id === optionId)?.next ?? null;
}

const DIRECTIONS = [
  ['north_west', 'north', 'north_east'],
  ['west', 'adjust', 'east'],
  ['south_west', 'south', 'south_east'],
] as const;

export type DirectionIcon = (typeof DIRECTIONS)[number][number];

export function directionIcon(target: Pick<Target, 'row' | 'col'>): DirectionIcon {
  const icon = DIRECTIONS[target.row - 1]?.[target.col - 1];
  if (!icon) throw new Error(`Target out of range: ${target.row},${target.col}`);
  return icon;
}
