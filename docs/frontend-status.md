# 프론트 구현·검증 상태

2026-11-08 JST · 작업 checkout: `<local-checkout>/df-2026-t193`
구현 시작 기준은 `main`, 원격 기준 HEAD `e83f6c30d89aa066713e792c6d8bc640bc67d909`. 위 기록은 최초 로컬 검증 당시의 상태다. GitHub 공유 브랜치는 `feat/frontend-foundation`이며 공개 결과는 해당 PR의 commit과 파일로 확인한다. 배포는 하지 않았다. 원본 `기존 로컬 devfest 프로젝트`와 승인 시안은 변경하지 않았다.

## 구현된 범위

- 승인 5개 화면을 React로 이식. 별도 도움/직원/안전/로딩/오류 상태.
- 선택과 확인 분리, 단계/revision 가드, 재촬영 취소 복원, 중복 탭·늦은 응답 차단.
- 검수된 흐름·기기·화면·버전·등록 장면/분기 그래프 검증. 개인정보 멈춤 제거 시 거절.
- 실제 카메라 코드: 후면 우선, JPEG 축소, 권한/연결 해제/취소/백그라운드 자원 정리. 자동 촬영·마이크 없음.
- 파일 음성 재생기와 기기 내 일본어 음성 대체. 재생 실패 표시, 중복 재생·이전 단계 음성 정리.
- 제안 API 클라이언트와 명시적 `/demo`, 독립적으로 눌러 진행하는 `/mock/hospital`.

## 검증 기록

| 확인 | 결과 | 시간/대상/범위 |
|---|---|---|
| 기존 엔진·상태 기준 | PASS,24개 | 00:17 JST, 편입 직후 로컬 코드 |
| `npm test` | PASS,52개 | 00:31:55 JST, shared schema/engine·reducer·HTTP 경계 |
| `npm run typecheck` | PASS | 00:31–00:32 JST, web/shared |
| `npm run build` | PASS | 00:32 JST,Vite production build |
| `npm run format:check` | PASS | 00:32 JST, TS/TSX |
| `npm run test:e2e` | PASS,31개 | 00:32–00:34 JST,Chrome/합성 카메라·API 대역·오디오 대역 |
| 디자인 픽셀 비교 | PASS | 00:34 JST,360×640·390×844의 안내 화면에서 상단70px 제외 픽셀 차이0. 배지만 견본 표기로 변경 |
| 추가 시각 점검 | PASS | 00:35 JST,확대·모의 접수기 직접 캡처 확인. 고대비 음성행2px border, pageerror0 |
| 실제 API | NOT_RUN | 서버 주소·계약 합의 대기. API 대역 성공은 서버 성공이 아님 |
| 실제 카메라/소리/화면읽기 | NOT_RUN | iPhone/Android 실기·VoiceOver/TalkBack·실제 일본어 소리 확인 필요 |
| 고령자 사용성 | NOT_RUN | 효과 검증을 주장하지 않음 |
| 배포 | NOT_RUN | GitHub 코드 공유와 별개 |

검증 대상 소스 집합 SHA-256: `30d97e7d95e0eb2e10c00b0b0cf9b9c2278b2468de446f23392b7aadd87c5bc0`. 집합은 web src/e2e, shared src, flows, root package/lock, web Playwright/Vite config/index.html이다. CSS·후속 공통 자산을 포함한 최종 배포 후보를 의미하지 않는다(배포 후보는 아직 없음). web src에는 CSS가 포함된다.

처음 브라우저 실행은 테스트 실행기의 JSON import 문제로 실패하여 파일 읽기로 수정했다. 두 번째 실행은 native dialog의 Tab 순환 실패1건을 발견하여 명시적 초점 순환을 추가했다. 이후30개 통과, 카메라 연결 해제 추가 후 최종31개 통과. 실패를 삭제하거나 기대값을 낮춰 통과시킨 것이 아니다.

## 디자인 변경 경계

기존 screen.css는 그대로 유지했다. 견본 표시를 명확히 했으며 라디오 미선택 외곽만#78858D로 변경했다(흰 배경 대비3.79:1). 문구/오류 상태는 실제 동작에 필요한 만큼 추가했다. 주요 텍스트 대비: 본문15.52:1, 보조6.13:1, 지시6.53:1, 주 버튼6.39:1; dark 보조10.34:1, 지시8.72:1, 버튼6.84:1. 이는 지정 색상 조합 계산이며 전체 접근성 인증이 아니다.

## 남은 경계

1. API 계약 합의 및 실제 서버 왕복/CORS/인증/사진 폐기 증거.
2. 최종 일본어 음원 준비·검수·자산 URL 연결. 현재는 기기 내 음성을 사용자 재생 버튼으로 사용하며 음성이 없으면 터치 안내로 진행한다. 자동 음성 안내가 완성됐다고 보고하지 않는다.
3. 실제 HTTPS iPhone/Android의 카메라·회전·음성·화면읽기·태블릿 촬영 동선 확인.
4. 배포와 공개 URL 검증은 별도 작업.

## 로컬 확인

`npm ci` 후 `npm run dev`. `/demo`는 서버 없이 동작, `/mock/hospital`은 모의 접수기, `/`는 실제 촬영/API 경로다. `apps/web/.env.example`에 연결 주소 변수만 설명했다. 기본값은 실연결 미설정이며 견본으로 자동 전환하지 않는다.
