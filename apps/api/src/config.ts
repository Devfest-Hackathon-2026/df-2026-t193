// 서버 설정. 전부 환경 변수에서 읽는다. (값 예시는 apps/api/.env.example)
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export type IdentifierKind = 'gemini' | 'fake';

export interface Config {
  port: number;
  /** 브라우저에서 이 서버를 불러도 되는 웹 주소들 (CORS) */
  allowedOrigins: string[];
  /** 세션 토큰 서명 키. 운영에서는 Secret Manager에서 주입 */
  jwtSecret: Uint8Array;
  sessionMinutes: number;
  /** 사진 한 장의 최대 크기 (프론트 한도 2MiB와 같게) */
  maxImageBytes: number;
  /** 사진 식별 방식: gemini(실제) 또는 fake(항상 첫 화면이라고 답하는 연습용) */
  identifier: IdentifierKind;
  gcpProject: string | undefined;
  gcpLocation: string;
  modelFlash: string;
  /** 이 값보다 확신이 낮으면 unknown */
  confidenceMin: number;
  /** 비용 보호: 1분에 받을 식별 요청 수, 서버 1대가 켜져 있는 동안의 총 식별 수 */
  identifyPerMinute: number;
  identifyTotalCap: number;
  /** true면 모든 요청을 503으로 거절하는 긴급 정지 스위치 */
  emergencyStop: boolean;
  flowsDir: string;
}

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  if (production && !env.JWT_SECRET) throw new Error('JWT_SECRET is required in production');
  // 운영에서 연습용 fake가 조용히 켜지는 일이 없게, 식별 방식을 꼭 명시하게 한다
  if (production && env.IDENTIFIER !== 'gemini' && env.IDENTIFIER !== 'fake')
    throw new Error('IDENTIFIER must be set to gemini or fake in production');
  return {
    port: num(env.PORT, 8080),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // 개발 중 키가 없으면 켤 때마다 새 임의 키를 만든다 (서버를 다시 켜면 이전 토큰은 무효)
    jwtSecret: env.JWT_SECRET ? new TextEncoder().encode(env.JWT_SECRET) : randomBytes(32),
    sessionMinutes: num(env.SESSION_MINUTES, 30),
    maxImageBytes: num(env.MAX_IMAGE_BYTES, 2 * 1024 * 1024),
    identifier: env.IDENTIFIER === 'gemini' ? 'gemini' : 'fake',
    gcpProject: env.GOOGLE_CLOUD_PROJECT,
    gcpLocation: env.GOOGLE_CLOUD_LOCATION ?? 'global',
    modelFlash: env.MODEL_FLASH ?? 'gemini-3.8-flash',
    confidenceMin: num(env.IDENTIFY_CONFIDENCE_MIN, 0.7),
    identifyPerMinute: num(env.IDENTIFY_PER_MINUTE, 30),
    identifyTotalCap: num(env.IDENTIFY_TOTAL_CAP, 2000),
    emergencyStop: env.EMERGENCY_STOP === 'true',
    // 이 파일 기준 저장소 맨 위의 flows/ (fileURLToPath: 한글 폴더 이름도 올바르게 처리)
    flowsDir: env.FLOWS_DIR ?? fileURLToPath(new URL('../../../flows', import.meta.url)),
  };
}
