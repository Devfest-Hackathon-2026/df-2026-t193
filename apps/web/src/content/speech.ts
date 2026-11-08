import type { Flow } from '@tonari/shared';
import { ja } from '../copy/ja';
type Step = Flow['steps'][string];
const sentence = (parts: string[]) => {
  const text = parts.join('');
  return /[。？！]$/.test(text) ? text : `${text}。`;
};
/**
 * Spoken guidance for one reviewed step. The screen keeps only the action;
 * position and reason move to the voice (design rule). Built only from the
 * validated flow and fixed copy, never from model text.
 */
export function guidanceSpeech(step: Step, { first = false } = {}) {
  switch (step.type) {
    case 'guide':
      return sentence(step.instruction) + sentence([step.reason]) + (first ? ja.speech.pressHint : '');
    case 'choice':
      return sentence(step.question) + ja.speech.choose(step.options.map((o) => o.label).join('、'));
    case 'stop':
      return sentence(step.instruction) + (step.reason === 'payment' ? ja.paymentStop : ja.safeCopy);
    case 'end':
      return ja.speech.done;
  }
}
/** Every sentence a registered flow can speak; prerecorded voice files are generated from this list. */
export function speechVariants(flow: Flow) {
  return Object.entries(flow.steps).flatMap(([stepId, step]) => [
    { stepId, file: stepId, text: guidanceSpeech(step) },
    ...(step.type === 'guide'
      ? [{ stepId, file: `${stepId}-first`, text: guidanceSpeech(step, { first: true }) }]
      : []),
  ]);
}
