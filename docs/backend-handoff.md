# 백엔드 연결 시작 안내

이 브랜치는 승인된 となりナビ 프론트엔드 구현이다. 견본 경로는 동작하지만 실제 AI/백엔드 연결은 아직 검증하지 않았다. **아래 규격은 현재 프론트가 실제로 보내고 받는 형태이며, 서버와 합의된 최종 규격은 아니다.**

## 1. 먼저 실행

```sh
git fetch origin
git switch --track origin/feat/frontend-foundation
npm ci
npm run dev
```

이미 이 브랜치를 가지고 있다면 `git switch feat/frontend-foundation`만 한다. 로컬 웹 주소는 기본 `http://127.0.0.1:5173`이다.

| 경로 | 용도 |
|---|---|
| `/demo` | 외부 API·카메라 없이 견본 흐름 확인. AI 성공 증거가 아님 |
| `/mock/hospital` | 독립적으로 눌러 진행하는 모의 병원 접수기. 개인정보 입력 없음 |
| `/` | 실제 카메라와 HTTP adapter를 사용하는 연결 경로 |

서버가 준비되면 `apps/web/.env.example`을 `apps/web/.env.local`로 복사하고 `VITE_API_BASE_URL`에 **API의 origin 또는 경로 prefix**를 지정한 뒤 Vite를 재시작한다. 예를 들어 API가 `http://127.0.0.1:8080/session`이면 base는 `http://127.0.0.1:8080`이다. 키·토큰을 이 변수에 넣지 않는다. HTTPS 프론트에서는 HTTPS API가 필요하다.

현재 Vite에는 API proxy 설정이 없다. `/api` 같은 상대 prefix를 쓰려면 호스팅 또는 개발 proxy가 실제로 그 경로를 서버에 전달해야 한다. E2E의 `/api`는 Playwright가 가로채는 테스트 경로다.

## 2. 연결 순서와 응답 예시

촬영 한 번마다 아래 순서로 호출한다. 세션 생성→식별→flow 조회가 모두 성공해야 안내로 들어간다.

### POST /session

요청: `Content-Type: application/json`, body `{}`. Authorization 없음.

```json
{"token":"<server-issued-token>","expires_at":"<future UTC ISO8601 timestamp>"}
```

`expires_at`은 실제 미래 시각으로 만든다. 프론트 내부에서는 `expiresAt`으로 변환한다. 쿠키는 보내지 않는다. 세션 재사용·자동 갱신은 현재 없다.

### POST /identify

요청: `Authorization: Bearer <token>`, `multipart/form-data`의 **image** 필드 하나. 파일명 `capture.jpg`, MIME `image/jpeg`. boundary는 브라우저가 정한다. 현재 프론트는 긴 변1280px, JPEG 품질0.85, 임시2MiB 한도로 생성한다.

등록된 첫 화면을 정확히 확인한 경우:

```json
{
  "status":"ok",
  "flow_id":"hospital-recheck",
  "flow_version":"1",
  "machine_id":"mock-hospital-v1",
  "screen_id":"start",
  "step_id":"s1"
}
```

그 외 성공 HTTP 응답의 허용 body는 다음 중 하나다.

```json
{"status":"unknown"}
```

```json
{"status":"unsupported"}
```

```json
{"status":"sensitive"}
```

**추가 필드(confidence, message, 모델 원문 등)는 현재 strict schema가 거절한다.** `unknown`은 처음 재촬영/두 번째 직원 화면, `unsupported`와 `sensitive`는 직원 화면으로 간다. 진료과를 추천하거나 임의 step ID를 만들지 않는다.

### GET /flows/hospital-recheck?version=1

요청: `Authorization: Bearer <token>`. 응답은 [flows/hospital-recheck.json](../flows/hospital-recheck.json)과 같은 **Flow 객체 자체**다. `{data: ...}`로 감싸지 않는다.

| 식별 screen_id | 반드시 대응하는 step_id |
|---|---|
| start | s1 |
| department | s2 |
| confirmation | s5 |
| finished | s6 |

`schema_version`은 숫자1, `version`은 문자열"1", `reviewed`는true, `source`는"mock"이다. 이름/번호가 보이는 실제 병원 화면을 이 등록 데이터로 처리하면 안 된다. 개인정보 단계 s4는 정상 촬영 대상으로 등록하지 않았다.

프론트는 ID 일치, screen.first_step, 단계/선택지 참조, 검수 여부, 장면 버전과 **안전 멈춤을 포함한 등록 분기 그래프**를 검사한다. 새 버전/기기를 추가하면 서버 JSON뿐 아니라 프론트의 scene manifest도 함께 갱신해야 한다.

## 3. 네트워크와 오류

- HTTP 401: 세션 만료. 413: 이미지 한도. 429: 대기 후 재시도. 나머지 non-2xx: 서버 오류. 오류 body는 현재 사용하지 않는다.
- timeout: session/flows10초, identify20초. POST 자동 재시도 없음. 실패한 사진은 다시 보내지 않고 재촬영한다.
- 응답 redirect는 허용하지 않는다. endpoint에서 직접 JSON을 반환한다.
- cross-origin이면 실제 웹 origin을 허용하고 OPTIONS/GET/POST, Authorization/Content-Type 헤더를 처리한다. 429의 `Retry-After`를 읽을 수 있게 `Access-Control-Expose-Headers: Retry-After`를 설정한다.
- 사진·토큰·음성·전사문을 request 로그에 남기지 않는다. 서버의 작업 제한·취소·사진 폐기는 서버 담당자가 확인한다. 프론트 abort는 서버 처리 중단을 보장하지 않는다.

자세한 계약: [contracts.md](../specs/001-frontend-foundation/contracts.md).

## 4. 담당별 남은 작업

| 작업 | 담당 영역 | 완료 증거 |
|---|---|---|
| 실제 API origin/허용 web origin, 세션 수명·이미지 한도·상태값 합의 | 백엔드+프론트 | 위 계약과 차이 기록, fixture/adapter 테스트 갱신 |
| 세션 발급·인증, 등록 화면 식별, 검수 flow 제공 | 백엔드 | 실제 요청으로 각 응답과 오류 확인 |
| 원본 사진 폐기·로그 제외·요청/비용 제한·민감 화면 거절 | 백엔드 | 서버 구현 및 검증 결과 |
| 실제 API에 `/` 연결, CORS/만료/취소/재촬영 확인 | 공동 | 실서버에서 시작→3개 진료과→안전 멈춤→안내 종료 |
| 일본어 안내 음원 생성·검수·배포 위치 | 음원 준비 담당+프론트 | 음원 파일,step/version 매핑,실기 청취 |
| HTTPS 환경 iPhone/Android 촬영·음성·화면읽기 | 프론트+검증 담당 | 기종/OS/browser/URL별 기록 |
| 호스팅 배포 및 공개 URL 확인 | 공동 | 별도 배포/검증 기록. 이 PR 자체는 배포가 아님 |

음원은 `apps/web/src/content/voice-manifest.json`이 문장→파일을 매핑한다. `npm run voice:generate`(gcloud 로그인, Text-to-Speech API 필요)로 `flows/`와 `copy/ja.ts`의 문장을 Chirp 3 HD MP3로 다시 만든다. 파일이 없거나 실패하면 기기 내 일본어 음성으로 대체한다. 마이크/Live WebSocket/조작음 자동 진행은 이번 범위 밖이다.

## 5. 코드를 볼 순서와 확인 명령

1. [HTTP adapter](../apps/web/src/api/http.ts), [내부 인터페이스](../apps/web/src/api/gateway.ts)
2. [Identify 런타임 스키마](../packages/shared/src/identify.ts), [Flow 스키마](../packages/shared/src/flow.ts)
3. [등록된 병원 flow](../flows/hospital-recheck.json), [장면·버전 검증](../apps/web/src/content/hospital-scenes.ts)
4. [요청 조율 App](../apps/web/src/App.tsx), [상태 전이](../apps/web/src/state/machine.ts)
5. [HTTP 계약 테스트](../apps/web/src/api/http.test.ts), [촬영/연결 E2E](../apps/web/e2e/camera.spec.ts)

```sh
npm test
npm run typecheck
npm run build
npm run format:check
npm run test:e2e
```

E2E에는 Google Chrome이 필요하고5180포트를 사용한다. 실제 기기·서버 대신 합성 카메라/API/오디오 대역을 쓴다. 검증 당시52개 단위 테스트·31개 브라우저 테스트가 통과했으며 실제 서버/실폰은 미검증이다. 정확한 시각과 대상은 [검증 기록](frontend-status.md)을 확인한다. 제출 저장소에서 GitHub Actions/Pages는 사용할 수 없으므로 자동 CI나 배포가 있다고 가정하지 않는다.
