// flows/ 폴더의 절차 지도 중 검수 완료(reviewed: true)된 것만 읽어 둔다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowSchema, type Flow } from '@tonari/shared';

export function loadReviewedFlows(dir: string): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    // 형식이 틀린 지도가 있으면 서버를 켜지 않는다 (잘못된 안내를 내보내지 않기 위해)
    const flow = flowSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    if (!flow.reviewed) continue;
    if (flows.has(flow.flow_id)) throw new Error(`Duplicate flow_id: ${flow.flow_id}`);
    flows.set(flow.flow_id, flow);
  }
  return flows;
}
