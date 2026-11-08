# 프론트–백엔드 연결 계약 — 현재 클라이언트 기준

**프론트 클라이언트와 테스트에 구현된 계약이다. 실제 백엔드와의 합의·연결은 아직 검증하지 않았다.** 서버 담당자는 [연결 시작 안내](../../docs/backend-handoff.md)를 먼저 확인한다. 아래 계약이 서버 설계와 다르면 shared schema와 HTTP adapter를 함께 수정하고 계약 테스트를 갱신한다.

## 1. 프론트 내부 인터페이스

```ts
interface Gateway {
  createSession(signal: AbortSignal): Promise<Session>;
  identify(image: Blob, session: Session, signal: AbortSignal): Promise<IdentifyResult>;
  getFlow(id: string, version: string, session: Session, signal: AbortSignal): Promise<unknown>;
}
type Session = { token: string; expiresAt: string };
type IdentifyResult =
  | { status: 'ok'; flow_id: string; flow_version: string;
      machine_id: string; screen_id: string; step_id: string }
  | { status: 'unknown' }
  | { status: 'unsupported' }
  | { status: 'sensitive' };
```

`unknown`은 불확실, `unsupported`는 확인된 미지원 기기, `sensitive`는 민감 화면 감지다. 네 상태 모두 `packages/shared/src/identify.ts`의 런타임 스키마에 구현되어 있다. 실패 상태에는 추가 필드가 없어야 하며, 성공 상태에도 정의되지 않은 필드는 거절한다. 백엔드가 현재 ok/unknown만 제공하면 존재하지 않는 이유를 추정하지 않으며 unknown 복구만 적용한다. 민감 화면 거절은 서버 합의가 필요한 보호 경계다.

원시 응답은 먼저 runtime schema, 이후 flow와의 관계 검증을 통과해야 한다. 게이트웨이 대체로 화면 코드를 변경하지 않는 것을 목표로 한다. 브라우저에서 Gemini 키·서비스 계정·모델 API를 호출하지 않는다.

## 2. 구현된 HTTP 요청·응답

| 요청 | 현재 클라이언트 기대값 | 합의 필요 사항 |
|---|---|---|
| POST `/session` | JSON `{}` → `{token, expires_at: ISO8601}` | 세션 수명, origin 제한, 오류 body |
| POST `/identify` | Authorization Bearer + multipart `image` JPEG → 위 union | multipart/raw 형식, 이미지 한도, status enum, version 필드 |
| GET `/flows/:flow_id?version=...` | Authorization Bearer → 검수된 Flow | 인증 경유/정적 배포 선택, version 조회·보존 정책 |
| 음원/장면 | 앱에서 등록한 자산 키 → 동일 origin 또는 허용된 HTTPS 자산 | MIME, CORS, version, 일본어 검수, 실기 호환 형식 |

Flow는 `schema_version: 1`, `version: string`을 필수로 검증한다. shared schema와 `flows/hospital-recheck.json`에 반영되어 있다. 현재 지원 버전은 `hospital-recheck`의 문자열 `"1"`이며 대상은 `mock-hospital-v1` 하나다. 식별 응답의 flow_version과 반환 Flow.version이 다르면 중지한다. 최신 flow로 조용히 대체하지 않는다. 자산은 같은 버전에 묶는다.

식별 성공 예시:

```json
{"status":"ok","flow_id":"hospital-recheck","flow_version":"1",
 "machine_id":"mock-hospital-v1","screen_id":"start","step_id":"s1"}
```

검증 순서: 필수 타입/열거값 → 요청 유효성 → 검수된 Flow → flow_id/version/machine_id 일치 → screen_id 존재 → screen.first_step === step_id → step 존재 → 해당 버전 장면 지원. 하나라도 실패하면 안내 버튼·장면을 표시하지 않고 안전한 오류 상태로 간다. `step_id`를 임의 JSON 경로나 HTML로 사용하지 않는다.

## 3. 현재 등록된 화면과 재식별

| screen_id | first_step | 장면/의미 |
|---|---|---|
| start | s1 | 접수 시작, 오른쪽 아래 受付 |
| department | s2 | 진료과 메뉴. 재식별 시 다시 선택하고 확인 |
| confirmation | s5 | 민감정보가 노출되지 않는 모의 확정 화면만 등록 |
| finished | s6 | 모의 완료 화면. 안내 종료만 표시 |

입력 화면은 정상 촬영 대상으로 등록하지 않는다. 병원 실제 화면에 이름/번호가 나타나면 confirmation 등록안도 그대로 적용하지 않는다. 현재 모의 흐름 이외의 실제 기기는 해당 자료·허가·검수와 안전 계약이 준비되기 전 미지원이다.

시각 데이터는 검수된 로컬 `hospital-scenes.ts`에 `flowId/version/stepId`, 자산 키, SVG viewBox(400×450)의 target 중심 좌표을 연결한다. `s2`는 target 없음, s3-*는 부서별 목표, stop은 민감 화면 대신 안전 장면이다. 임의 외부 이미지 URL·오디오 URL을 모델 응답에서 그대로 사용하지 않는다.

## 4. 오류·재시도 정책

| 종류 | 사용자 동작 | 내부 처리 |
|---|---|---|
| unknown | 한 번 재촬영, 연속 두 번째는 직원에게 보여주기 | 성공/새 시작에서 unknownCount 초기화 |
| unsupported/sensitive | 직원 도움 또는 안전한 안내 종료 | 자동 재전송 없음, 민감 데이터 표시 없음 |
| 카메라 거부/없음/사용 중 | 권한 설명·다시 시도·직원 도움 | unknownCount 변경 없음 |
| offline/timeout/5xx | 연결 확인 후 사용자 재시도 | POST 자동 재시도 없음. 사진 폐기 후 새 촬영 |
| 401/세션 만료 | 안내를 멈추고 세션 재시작·재촬영 | 토큰·사진 폐기. 백그라운드 자동 갱신·재전송 없음 |
| 413 | 다시 촬영 | 한도에 맞는 JPEG 생성 확인; 원본 보존 없음 |
| 429 | 기다린 뒤 다시 시도·직원 도움 | 유효한 Retry-After 존중. 무한 polling 없음 |
| JSON/ID/version/flow 오류 | 현재 화면을 확인할 수 없음·직원 도움 | raw 응답을 출력하지 않고 protocol 오류로 분류 |
| 사용자 취소 | 이전 안전한 상태 | AbortController + requestId 무효화. 에러 팝업 없음 |
| 음원 실패/차단 | 눌러 다시 듣기, 터치 진행 | 재생 성공 표시 금지, 이전 음성 중지 |

현재 요청 timeout은 session/flow 10초, identify 20초다. 서버와 합의 후 조정할 수 있다. 시간 초과는 모델 판단 실패가 아니다. 클라이언트 abort는 서버 처리가 멈췄다는 보장이 아니며 서버 요청 제한·취소·폐기는 서버에서 검증한다.

## 5. 개인정보·연결 설정

- 토큰은 메모리에만 두고 URL/localStorage/log에 넣지 않는다. 이미지·오디오·전사문을 저장하지 않는다. 이번 단계는 마이크를 열지 않는다.
- `VITE_API_BASE_URL`은 공개 연결 주소만 포함. 비밀키를 VITE 환경 변수에 넣지 않는다. API 주소가 없으면 실연결 준비 안 됨 상태이며 견본으로 자동 전환하지 않는다.
- 이미지 전송은 사용자 촬영 행동에 연결하고 카메라 화면에 전송 목적을 짧게 알린다. 서버 보관/삭제 정책이 실제로 확인되기 전 end-to-end 무저장을 보증하지 않는다.
- JSON/상태/경과시간 등 비민감 오류 정보만 로컬 진단에 사용한다. 원본 사진·Authorization·응답 전체·사용자 말은 수집하지 않는다.
- `/demo`는 고정 fixture임을 상시 표시하고 `/mock/hospital`은 모의 기기임을 표시한다. 기본 `/`는 real 경로다. 테스트 전용 실패 스위치는 배포 제품의 사용자 제어로 노출하지 않는다.

## 6. 백엔드에 확인할 4개 묶음

1. 실제 개발 코드/배포 주소/허용 origin, session 인증·만료 형식.
2. 식별 이미지 형식·최대 크기, ok/unknown/미지원/민감화면 상태, error body·재시도 제한.
3. flow version·screen/step 대응과 검수된 흐름 제공 방식. 현재 첫 화면 외 재식별 가능한 화면 목록.
4. 일본어 음원·장면 제공 경로/버전, 사진·로그 보관 정책.

UI·카메라·상태·오류·모의 접수기·대역 테스트는 현재 구현되어 있다. 실제 HTTP 계약 확정과 서버 통합 합격은 이 답을 기다린다.

## 7. 연결할 때 유의할 실제 동작

- `expires_at`은 미래 UTC ISO8601 문자열(예: `2026-11-08T01:00:00Z`)이어야 한다. 예시 시각을 그대로 반환하지 말고 요청 시점 기준으로 만든다. 토큰은 비어 있으면 안 된다.
- 요청당 이미지 하나, `image` 필드의 `capture.jpg`, MIME `image/jpeg`. 현재 긴 변1280px·품질0.85,클라이언트 임시 한도2MiB다. 서버 제한은 multipart 오버헤드까지 고려해 합의해야 한다.
- 쿠키 인증은 사용하지 않는다(`credentials: omit`). HTTP redirect도 거절한다. 실제 endpoint가 직접 JSON을 반환해야 한다. 성공은 JSON envelope 없이 본문 객체를 반환한다.
- HTTP 오류 body는 현재 파싱하지 않는다. 401/413/429는 전용 처리,그 외 non-2xx는 server 오류다. 429의 Retry-After를 사용하며 cross-origin에서는 해당 헤더를 노출해야 한다.
- 현재 App은 **촬영마다** `/session`을 새로 호출한 뒤 `/identify`→`/flows`를 요청한다. 세션 재사용·자동 갱신은 구현하지 않았다.
- CORS는 실제 웹 origin에 대해 OPTIONS와 GET/POST, Content-Type/Authorization을 허용한다. 이미지·응답 본문·Authorization을 서버 로그에 남기지 않는다.
- 현재 등록 버전의 단계 종류/분기/안전 멈춤 그래프까지 프론트에서 확인한다. 새로운 기기·버전·분기를 추가하려면 `hospital-scenes.ts`와 검수된 fixture를 함께 갱신한다. 임의 flow JSON을 내려주면 동작하는 구조가 아니다.
- 개인정보 단계 s4 자체는 정상 식별 화면으로 등록하지 않는다. 재식별 `department`는 s2로 돌아가 사용자가 진료과를 다시 고르게 한다.
- 세션 생성 실패 때 사진이 전송된 것은 아니다. 클라이언트 취소는 서버 작업 취소/삭제의 증거가 아니다.
