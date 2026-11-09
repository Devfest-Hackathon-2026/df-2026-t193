# 백엔드 연결 시작 안내

서버(`apps/api`)와 웹(`apps/web`)은 main에 있고, 배포된 웹이 Cloud Run API를 호출한다. 이 문서는 현재 쓰는 연결 규격과 운영 방법을 정리한다. 실제 폰으로 찍은 사진의 식별 정확도는 아직 측정하지 않았다.

## 1. 먼저 실행

```sh
git switch main
git pull
npm ci
npm run dev      # 웹
npm run dev:api  # API. apps/api/.env.example 참고. 기본은 Gemini를 쓰지 않는 fake 식별
```

로컬 웹 주소는 기본 `http://127.0.0.1:5173`이다.

| 경로 | 용도 |
|---|---|
| `/demo` | 외부 API·카메라 없이 견본 흐름 확인. AI 성공 증거가 아님 |
| `/mock/hospital` | 독립적으로 눌러 진행하는 모의 병원 접수기. 개인정보 입력 없음 |
| `/` | 실제 카메라와 HTTP adapter를 사용하는 연결 경로 |

로컬 웹을 API에 붙이려면 `apps/web/.env.example`을 `apps/web/.env.local`로 복사하고 `VITE_API_BASE_URL`에 **API의 origin 또는 경로 prefix**를 지정한 뒤 Vite를 재시작한다. 예를 들어 API가 `http://127.0.0.1:8080/session`이면 base는 `http://127.0.0.1:8080`이다. 키·토큰을 이 변수에 넣지 않는다. HTTPS 프론트에서는 HTTPS API가 필요하다.

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

## 4. 서버 검사와 배포

### 계약 검사기

프론트가 실제로 쓰는 HTTP adapter와 검증 코드를 그대로 써서 서버를 검사한다. 토큰은 출력하지 않는다.

```sh
npm run api:check -- https://tonari-api-791151105038.asia-northeast1.run.app
```

| 검사 | 기대 |
|---|---|
| CORS preflight | 웹 origin 허용, `authorization` 헤더 허용 |
| `POST /session` | 미래 `expires_at`, `Retry-After` 노출 |
| 토큰 없는 `/identify` | 401 |
| 모의 접수기 start / department / confirmation / finished | `ok`와 정확한 screen/step, flow·장면 검증 통과 |
| 개인정보 입력 화면, 빈 화면 | `ok`가 아님 |
| 없는 flow 버전 | 거절 |

입력 사진은 `apps/web/e2e/fixtures/kiosk/*.jpg`다. 우리 모의 접수기(`/mock/hospital`)를 태블릿 세로 크기로 찍은 합성 화면이며 실제 기기·사람 사진이 아니다. 모의 접수기를 바꾸면 dev 서버를 켠 뒤 `npm run fixtures:kiosk -- http://127.0.0.1:5173`로 다시 만든다. 실제 폰 카메라 사진은 각도·반사가 있으므로 이 검사 통과가 실촬영 식별 성능을 뜻하지 않는다.

### 현재 배포 구성

프로젝트 `axial-sunup-488315-k1`. 웹은 Cloud Run 주소를 직접 호출하고(cross-origin), 서버의 CORS 허용 목록으로 제한한다. 서버 경로에 `/api` prefix가 없으므로 Firebase Hosting rewrite는 쓰지 않는다.

| 항목 | 값 |
|---|---|
| 웹 | Firebase Hosting, https://axial-sunup-488315-k1.web.app |
| API | Cloud Run `tonari-api`, `asia-northeast1`, https://tonari-api-791151105038.asia-northeast1.run.app |
| 인스턴스 | 최소 0, 최대 2, 동시 요청 20, 요청 제한 30초, 메모리 512Mi |
| 실행 계정 | `tonari-api@axial-sunup-488315-k1.iam.gserviceaccount.com` (`roles/aiplatform.user`) |
| 공개 범위 | `allUsers`에 `roles/run.invoker`. 브라우저에서 직접 호출하기 위해 필요 |
| 비밀값 | Secret Manager `tonari-jwt-secret` → `JWT_SECRET` |
| 환경 변수 | `NODE_ENV=production`, `IDENTIFIER=gemini`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=global`, `MODEL_FLASH=gemini-3.5-flash`, `ALLOWED_ORIGINS` |

`MODEL_FLASH`는 꼭 지정한다. 코드의 기본값 `gemini-3.8-flash`는 이 프로젝트에서 쓸 수 없다. `ALLOWED_ORIGINS`에는 web.app, firebaseapp.com, 로컬 개발 주소가 들어 있다.

API 다시 배포 (저장소 맨 위에서 실행. 위 설정은 서비스에 남아 있어 유지된다):

```sh
gcloud run deploy tonari-api --source . --region asia-northeast1 --project axial-sunup-488315-k1 \
  --set-build-env-vars "GOOGLE_ENTRYPOINT=npm run start -w @tonari/api,GOOGLE_NODE_RUN_SCRIPTS="
```

웹 다시 배포. predeploy가 `npm run build:prod`로 API 주소를 넣어 빌드한다. 이 CLI는 predeploy 명령에 `=`가 있으면 실행하지 않으므로 환경 변수는 npm 스크립트에 둔다.

```sh
npx firebase-tools deploy --only hosting
```

### 운영

- **긴급 정지:** 모든 요청을 503으로 거절한다. 되돌릴 때는 `EMERGENCY_STOP=false`로 다시 실행한다.

  ```sh
  gcloud run services update tonari-api --region asia-northeast1 --project axial-sunup-488315-k1 --update-env-vars EMERGENCY_STOP=true
  ```

- **비용 제한:** 식별은 분당 30건, 인스턴스당 총 2000건이다. 카운터는 인스턴스 메모리에 있어 다시 켜지면 초기화된다.
- **예산 알림:** `Tonari hackathon (about USD 20)`, 28,000원, 50/90/100%, 크레딧 차감 전 금액 기준. 알림만 보내고 과금을 멈추지는 않는다.
- **콜드 스타트:** `/session` 2.5초 (2026-11-08, 1회 측정). 프론트 제한 시간은 10초다.
- **알려진 문제:** Gemini 요청이 가끔 멈춰 502가 난다. 완화 후 합성 측정 기준 약 1%이며 경과는 [안정성 보강 스펙](../specs/002-stability-hardening/spec.md)에 있다.
- **회귀 측정:** `npm run api:stress -- <API 주소>` (합성 이미지 56장, 약 3분)
- `/healthz`는 Cloud Run이 예약한 경로라 외부에서 404가 나온다.

## 5. 남은 확인

| 작업 | 상태 | 완료 증거 |
|---|---|---|
| 세션 발급·인증, 등록 화면 식별, 검수 flow 제공 | 완료 | `api:check` 11/11 (합성 화면) |
| 실제 API에 `/` 연결, CORS | 완료 | 배포 주소에서 안내 종료까지 완주 (합성 카메라) |
| 호스팅 배포 | 완료 | Firebase Hosting, Cloud Run |
| 일본어 안내 음원 | 생성·연결 완료, 실폰 청취 남음 | `voice-manifest.json` |
| 폰으로 찍은 사진의 식별 정확도 | 미실시 | `npm run eval:identify -w @tonari/api -- <사진 폴더>` 결과 |
| HTTPS 환경 iPhone/Android 촬영·음성·화면읽기 | 미실시 | 기종/OS/browser별 기록 |
| 사진 폐기 | 코드 확인 | 서버 코드는 사진을 저장·로그하지 않고 처리 후 메모리를 지운다. Vertex AI 쪽 처리 방침은 별도 확인 필요 |

음원은 `apps/web/src/content/voice-manifest.json`이 문장→파일을 매핑한다. `npm run voice:generate`(gcloud 로그인, Text-to-Speech API 필요)로 `flows/`와 `copy/ja.ts`의 문장을 Chirp 3 HD MP3로 다시 만든다. 파일이 없거나 실패하면 기기 내 일본어 음성으로 대체한다. 마이크/Live WebSocket/조작음 자동 진행은 이번 범위 밖이다.

## 6. 코드를 볼 순서와 확인 명령

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

E2E에는 Google Chrome이 필요하고5180포트를 사용한다. 실제 기기·서버 대신 합성 카메라/API/오디오 대역을 쓴다. 테스트 결과와 시각은 [검증 기록](frontend-status.md)을 확인한다. 제출 저장소에서 GitHub Actions/Pages는 사용할 수 없으므로 자동 CI나 배포가 있다고 가정하지 않는다.
