// 사진 한 장 → 어떤 등록 화면인지 판단.
// 모델이 무엇을 답하든, 최종 결과는 등록된 화면 ID나 unknown/unsupported/sensitive 중 하나로만 나간다.
import { GoogleGenAI, MediaResolution, ThinkingLevel } from '@google/genai';
import type { Flow, IdentifyResult } from '@tonari/shared';
import type { Config } from './config';
import { MACHINE_MARKERS, SCREEN_HINTS } from './screen-hints';

export type Identifier = (jpeg: Uint8Array, signal: AbortSignal) => Promise<IdentifyResult>;

interface Candidate {
  key: string;
  flow: Flow;
  screen: Flow['screens'][number];
}

export function candidatesOf(flows: Map<string, Flow>): Candidate[] {
  return [...flows.values()].flatMap((flow) =>
    flow.screens.map((screen) => ({ key: `${flow.flow_id}:${screen.screen_id}`, flow, screen })),
  );
}

export function okResult(c: Candidate): IdentifyResult {
  return {
    status: 'ok',
    flow_id: c.flow.flow_id,
    flow_version: c.flow.version,
    machine_id: c.flow.machine_id,
    screen_id: c.screen.screen_id,
    step_id: c.screen.first_step,
  };
}

/** 연습용: Gemini 없이 항상 첫 번째 등록 화면(병원 접수 시작)이라고 답한다. */
export function createFakeIdentifier(flows: Map<string, Flow>): Identifier {
  const first = candidatesOf(flows)[0];
  return async () => (first ? okResult(first) : { status: 'unknown' });
}

/** 모델 답(label, confidence)을 안전한 결과로 바꾼다. 테스트하기 쉽게 따로 분리. */
export function decide(
  answer: { label?: unknown; confidence?: unknown },
  candidates: Candidate[],
  confidenceMin: number,
): IdentifyResult {
  const label = typeof answer.label === 'string' ? answer.label : 'unknown';
  const confidence = typeof answer.confidence === 'number' ? answer.confidence : 0;
  // 민감 화면은 확신이 낮아도 안내하지 않는 쪽이 안전하다
  if (label === 'sensitive') return { status: 'sensitive' };
  if (confidence < confidenceMin) return { status: 'unknown' };
  if (label === 'unsupported') return { status: 'unsupported' };
  const hit = candidates.find((c) => c.key === label);
  return hit ? okResult(hit) : { status: 'unknown' };
}

const HEDGE_AFTER_MS = 6_000;

function isTransient(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && (status === 408 || status === 429 || status >= 500);
}

/**
 * 요청이 가끔 멈추므로, 일정 시간 답이 없으면 두 번째 요청을 함께 보내 먼저 끝난 쪽을 쓴다.
 * 첫 요청이 일시 오류로 실패하면 바로 두 번째를 보낸다. 요청은 최대 두 번이다.
 */
export function withHedge<T>(
  signal: AbortSignal,
  call: (signal: AbortSignal) => Promise<T>,
  hedgeAfterMs = HEDGE_AFTER_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const controllers: AbortController[] = [];
    let running = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
      controllers.forEach((controller) => controller.abort());
      settle();
    };
    const cancelled = () => finish(() => reject(signal.reason));
    const start = () => {
      if (settled || controllers.length >= 2) return;
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      call(AbortSignal.any([signal, controller.signal])).then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => {
          running--;
          if (settled) return;
          if (!isTransient(error)) finish(() => reject(error));
          else if (controllers.length < 2) {
            clearTimeout(timer);
            start();
          } else if (running === 0) finish(() => reject(error));
        },
      );
    };
    signal.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(start, hedgeAfterMs);
    start();
  });
}

export function createGeminiIdentifier(config: Config, flows: Map<string, Flow>): Identifier {
  const candidates = candidatesOf(flows);
  // Cloud Run 서비스 계정(로컬에서는 gcloud 로그인)으로 인증. API 키는 쓰지 않는다.
  const ai = new GoogleGenAI({
    vertexai: true,
    project: config.gcpProject,
    location: config.gcpLocation,
    // Cloud Run에서 재사용한 연결이 응답 없이 멈추는 현상이 있어 요청마다 새 연결을 쓴다.
    httpOptions: { headers: { Connection: 'close' } },
  });
  const labels = [...candidates.map((c) => c.key), 'sensitive', 'unsupported', 'unknown'];
  const prompt = [
    'あなたは、高齢者がキオスク端末の画面を撮った写真を分類します。写真の画面が次のどれに当たるか、label を一つ選んでください。',
    '',
    '登録済みの画面:',
    ...candidates.map((c) => {
      const hint = SCREEN_HINTS[c.key];
      return `- ${c.key}: 端末 ${c.flow.machine_id} の「${c.screen.description}」${hint ? `。見分け方: ${hint}` : ''}`;
    }),
    '',
    ...[...new Set(candidates.map((c) => MACHINE_MARKERS[c.flow.machine_id]))].map(
      (marker) =>
        `登録済みの画面を選べるのは、写真の中に端末の表示「${marker}」が読めるときだけです。文言や配置が同じでも、この表示がなければ登録済みの画面を選ばず、キオスク端末なら unsupported、判断できなければ unknown にしてください。`,
    ),
    '',
    'それ以外:',
    '- sensitive: 暗証番号・パスワード、カード番号、口座、ATMや送金、氏名・生年月日・保険証番号などの個人情報が入力・表示されている画面。' +
      'また、本人に入力をうながす画面（「ご自分で入力」「入力してください」「入力を終える」など）は、入力欄や個人情報が写っていなくても必ず sensitive',
    '- unsupported: キオスク端末なのははっきり分かるが、登録済みの画面のどれでもない',
    '- unknown: ぼやけている、画面が写っていない、判断に自信がない',
    '',
    '迷ったら unknown を選んでください。confidence は 0〜1 で答えてください。',
  ].join('\n');

  return async (jpeg, signal) => {
    const response = await withHedge(signal, (abortSignal) =>
      ai.models.generateContent({
        model: config.modelFlash,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: Buffer.from(jpeg).toString('base64') } },
              { text: prompt },
            ],
          },
        ],
        config: {
          abortSignal,
          temperature: 0,
          // 기본 설정은 가끔 12초 이상 걸린다. 화면 분류에는 낮은 사고 수준으로 충분하다.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          // 기본 해상도에서는 일부 사진이 10~19초 걸렸다. MEDIUM은 같은 사진이 4초 안에 끝났다.
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              label: { type: 'string', enum: labels },
              confidence: { type: 'number' },
            },
            required: ['label', 'confidence'],
          },
        },
      }),
    );
    let answer: { label?: unknown; confidence?: unknown } = {};
    try {
      answer = JSON.parse(response.text ?? '{}');
    } catch {
      // 모델 답이 JSON이 아니면 unknown
    }
    return decide(answer, candidates, config.confidenceMin);
  };
}
