// 사진 한 장 → 어떤 등록 화면인지 판단.
// 모델이 무엇을 답하든, 최종 결과는 등록된 화면 ID나 unknown/unsupported/sensitive 중 하나로만 나간다.
import { GoogleGenAI } from '@google/genai';
import type { Flow, IdentifyResult } from '@tonari/shared';
import type { Config } from './config';
import { SCREEN_HINTS } from './screen-hints';

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

export function createGeminiIdentifier(config: Config, flows: Map<string, Flow>): Identifier {
  const candidates = candidatesOf(flows);
  // Cloud Run 서비스 계정(로컬에서는 gcloud 로그인)으로 인증. API 키는 쓰지 않는다.
  const ai = new GoogleGenAI({ vertexai: true, project: config.gcpProject, location: config.gcpLocation });
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
    'それ以外:',
    '- sensitive: 暗証番号・パスワード、カード番号、口座、ATMや送金、氏名・生年月日・保険証番号などの個人情報が入力・表示されている画面。' +
      'また、本人に入力をうながす画面（「ご自分で入力」「入力してください」「入力を終える」など）は、入力欄や個人情報が写っていなくても必ず sensitive',
    '- unsupported: キオスク端末なのははっきり分かるが、登録済みの画面のどれでもない',
    '- unknown: ぼやけている、画面が写っていない、判断に自信がない',
    '',
    '迷ったら unknown を選んでください。confidence は 0〜1 で答えてください。',
  ].join('\n');

  return async (jpeg, signal) => {
    const response = await ai.models.generateContent({
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
        abortSignal: signal,
        temperature: 0,
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
    });
    let answer: { label?: unknown; confidence?: unknown } = {};
    try {
      answer = JSON.parse(response.text ?? '{}');
    } catch {
      // 모델 답이 JSON이 아니면 unknown
    }
    return decide(answer, candidates, config.confidenceMin);
  };
}
