import { identifySchema, parseFlow, type IdentifyResult } from '@tonari/shared';
import hospital from '../../../../flows/hospital-recheck.json';
export const demoFlow = parseFlow(hospital);
export function demoIdentify(screenId: string, signal: AbortSignal): Promise<IdentifyResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      const screen = demoFlow.screens.find((s) => s.screen_id === screenId);
      resolve(
        identifySchema.parse(
          screen
            ? {
                status: 'ok',
                flow_id: demoFlow.flow_id,
                flow_version: demoFlow.version,
                machine_id: demoFlow.machine_id,
                screen_id: screen.screen_id,
                step_id: screen.first_step,
              }
            : { status: 'unknown' },
        ),
      );
    }, 400);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
