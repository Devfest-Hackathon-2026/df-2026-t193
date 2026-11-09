# 실행 작업 목록

[스펙](spec.md) · [구현 계획](plan.md) · [계약 초안](contracts.md)

현재 구현·검증 근거는 [frontend-status](../../docs/frontend-status.md)에 있다. 완료 표시는 로컬 구현과 해당 자동검증 범위다. 실제 API·최종 음원·실폰 검증은 별도로 남긴다.

## 순서와 의존성

T001 → T002 → T003 → T004 → T005 → T006/T007 → T008 → T009 → T010. 실제 서버 연결 T011은 계약 합의에 의존하며, T012의 실기 점검은 프론트 카메라·음성부터 먼저 가능하다. 이 순서는 병렬 에이전트 실행 요청이 아니다.

- [x] **T001 [US7] 작업 기반 고정** — 제출 저장소 원격 HEAD/브랜치를 재확인하고 현재 작업 checkout/branch/HEAD·변경 파일을 기록한다. `기존 로컬 devfest 프로젝트`의 소스·lockfile·문서를 검토해 필요한 것만 편입한다. 원격 README/LICENSE 보존, private·dist·node_modules·비밀정보 제외. `docs/README.md`, `CLAUDE.md`, `docs/04-design-guidelines.md`에 승인 방향 및 이 스펙 위치 반영. **FR-016,001**: 편입 파일 목록과 기존 `npm test/typecheck/build` 기준 결과를 기록. 실패하면 원인 분류 후 관련 범위부터 해결.

- [x] **T002 [US1,US3,US5,US7] 데이터·계약 기반** — `packages/shared/src/flow.ts`, `identify.ts`, 해당 테스트, `flows/hospital-recheck.json`, `apps/web/src/content/hospital-scenes.ts`, `api/gateway.ts`, `api/demo.ts`. 먼저 malformed 응답·ID 관계 불일치·중복 ID·검수 false·버전 불일치·누락 장면 테스트 작성. 안전한 화면 등록과 대역 응답 추가. **FR-002,007,012–014**: 허용된 fixture만 안내에 진입하고 잘못된 fixture는 실패함.

- [x] **T003 [US1,US3,US4,US5] 상태 전이 강화** — `apps/web/src/state/machine.ts`, `machine.test.ts`. 선택/확정 분리, stop 확인, captureReturn, 요청 취소·늦은 결과·중복 이벤트 차단, 오류 분류. **FR-008–010,012,013**: 3개 진료과 완주, 두 번 탭·stop 닫기·취소 후 응답·재시작·invalid ID가 진행을 건너뛰지 않는 테스트 통과.

- [x] **T004 [US1,US4,US6] 승인 화면 React 이식** — `components/ui.tsx`, `components/KioskScene.tsx`, `screens/entry.tsx`, `screens/guidance.tsx`, `styles/tokens.css`, `styles/app.css`, `copy/ja.ts`, `App.tsx`, `public/assets/tonari/`. 제목·버튼 문구를 데이터에 분리하고 기존 SVG/로고를 사용한다. **FR-001–004,009,010,014**: 5개 승인 화면과 안전/직원/도움/로딩/오류를 2개 뷰포트에서 렌더 비교. 스냅샷을 새 디자인에 맞춰 무조건 갱신하지 않고 차이를 검토.

- [x] **T005 [US2,US3,US5] 실제 촬영과 자원 정리** — `hooks/useCamera.ts`, 훅 테스트, `screens/entry.tsx`, `App.tsx`, `e2e/camera.spec.ts`. 실제 프리뷰·JPEG·촬영 준비·취소·권한 오류·hidden·늦은 stream 획득 처리. **FR-005,006,008,012,013**: fake device/denied/no device/no response/cancel/hidden에서 기대 track 종료, 중복 업로드 없음, 이미지 방향·크기 검증. 실기 촬영은 T012에서 별도 기록.

- [x] **T006 [US1,US5] 안내 음성** — `hooks/useGuidanceAudio.ts`, 테스트, `content/hospital-scenes.ts`, `screens/guidance.tsx`, `copy/ja.ts`. 재생/중지/재시도·auto-play 거절·음원 누락·다음 단계/백그라운드 중지. **FR-010,011**: 오디오 중복 없음, 실패 시 터치 진행, 안전 단계 통과 신호와 분리. 최종 음원 미준비면 테스트 음원 결과와 구분.

- [x] **T007 [US1,US7] 모의 병원 접수기** — `mock/HospitalKiosk.tsx`, `App.tsx`, `e2e/kiosk.spec.ts`, 등록 장면 manifest. 실제 버튼으로만 단계 이동하고 모의 표시는 유지. 번호 입력 없이 가상 입력 완료 제공. **FR-002,015**: 3개 진료과, 안전 입력 단계, 확정, 초기화가 동작하고 폰 주 버튼이 기기를 자동 조작하지 않음. 장면/버튼 위치 대조.

- [x] **T008 [US5,US7] HTTP 경계와 계약 테스트** — `api/http.ts`, 테스트, `e2e/network.spec.ts`, `App.tsx`. contracts 합의 전에는 제안 fixture 기반임을 명시. AbortSignal·timeout·상태별 오류·토큰 메모리·strict response 검증. **FR-006–008,012,014,016**: session/identify/flow 요청 형식, 401/413/429/5xx/오프라인/malformed/version mismatch를 네트워크 대역으로 검증. 실패를 견본 성공으로 바꾸지 않음.

- [x] **T009 [US1–US7] 통합 브라우저·접근성 검증** — `e2e/flow.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/visual.spec.ts`, `playwright.config.ts`. 기존 안전 테스트 보존·승인 디자인 기준으로 레이아웃 assertion 갱신. **FR-001–016**: 3개 전체 경로, 실패/복구, 초점, 라디오, 다이얼로그,200%·dark·고대비·움직임 줄이기·가로 넘침. 기존 테스트/타입/빌드/E2E 통과와 캡처 검토 기록. 실사진 trace 금지.

- [x] **T010 [US7] 프론트 독립 완료 정리** — `README.md`, `docs/03-architecture.md`, `docs/05-roadmap.md`, 본 작업 목록 갱신. **FR-014,016**: 새 환경 설치→견본 실행→모의 접수기 실행→검증 명령이 재현됨. 실API·최종 음원·실기 미완료 항목을 명시하고 구현 완료와 분리.

- [x] **T011 [US5,US7] 실제 서버 연결** — 서버 계약 합의와 접속 환경 준비 후 `api/http.ts`의 필요한 매핑만 조정. **FR-007,012,014,016**: 실제 세션·JPEG 식별·정확한 버전 flow 조회·CORS/인증/오류 동작. 프론트에서 확인할 수 없는 서버 삭제·모델 품질은 별도 서버 증거 요구. 배포는 별도 작업 범위.

- [ ] **T012 [US1,US2,US5,US6] 실폰 판정** — HTTPS 테스트 환경에서 iPhone Safari·Android Chrome의 기종/OS/브라우저를 기록. **FR-001–006,010–013**: 실제 카메라 권한·거부 복구·회전·앱 전환·일본어 음성·VoiceOver/TalkBack·전체 흐름. fixture 사용과 실제 서버 사용 결과를 분리하고 못 한 항목은 NOT_RUN. 고령자 효과를 추정해 합격 처리하지 않음.

## 요구사항 추적표

| 요구사항 | 주 구현 작업 | 핵심 검증 |
|---|---|---|
| FR-001 | T001,T004 | T009,T012 |
| FR-002 | T002,T004,T007 | T007,T009 |
| FR-003 | T004 | T009,T012 |
| FR-004 | T004 | T009,T012 |
| FR-005 | T005 | T005,T012 |
| FR-006 | T005,T008 | T005,T008,T012 |
| FR-007 | T002,T008 | T002,T008,T011 |
| FR-008 | T003,T005 | T003,T009 |
| FR-009 | T003,T004 | T003,T009 |
| FR-010 | T003,T004,T006 | T003,T009,T012 |
| FR-011 | T006 | T006,T012 |
| FR-012 | T002,T003,T005,T008 | T008,T009,T011 |
| FR-013 | T002,T003,T005 | T003,T009,T012 |
| FR-014 | T002,T004,T008,T010 | T008,T009,T011 |
| FR-015 | T007 | T007,T009 |
| FR-016 | T001,T008,T010 | T001,T010,T011 |

## 문서 검토 결과

- 원격 저장소 현재 상태·기준 SHA·로컬 재사용 범위 명시: PASS (2026-11-08, 읽기 조사).
- 승인 디자인 원본·수치·파일 hash 대조: PASS (동일 날짜, 기존 파일 확인. 새 렌더 테스트 아님).
- FR-001~016의 작업/검증 매핑과 US1~7의 인수 조건: 문서 검토 완료.
- 계약의 확정/제안 구분과 서버·실기 검증 경계: 명시 완료. 백엔드 합의는 대기.
- 최초 스펙 작성 시에는 코드·검증 작업을 실행하지 않았다. 이후 구현 결과는 아래 현황과 frontend-status를 따른다.

## 구현 후 남은 항목 (2026-11-08)

- T006: 자동 음성 안내와 Cloud TTS 음원 연결 완료(2026-11-08). 실폰 청취·VoiceOver 겹침 확인은 T012로 남김.
- T011: 실제 서버 연결 완료(2026-11-08). 합성 화면 기준 `api:check` 11/11, 배포 주소 완주. 폰 사진 정확도는 T012와 함께 측정.
- T012: 브라우저 합성 카메라·오디오 검사와 시각 검증 완료. 실제 iPhone/Android·VoiceOver/TalkBack·소리 확인은 NOT_RUN.
- T001~T010의 완료된 로컬 검증은 frontend-status의 시간·대상·소스 hash를 참조. 과거 문서 검토 결과는 최초 스펙 단계 기록이다.
