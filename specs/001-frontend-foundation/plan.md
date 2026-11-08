# 프론트 구현 계획

[스펙](spec.md) · [연결 계약](contracts.md) · [작업 목록](tasks.md)

## 1. 조사 근거와 차이

조사 범위: 제공 GitHub 저장소 main/브랜치/열린 PR, `기존 로컬 devfest 프로젝트` 소스·테스트·문서, 승인 `outputs/tonari-reset` 파일. 최초 스펙 단계에는 앱 테스트를 실행하지 않았다. 이후 구현·검증 결과는 [frontend-status](../../docs/frontend-status.md)에 기록했다.

| 로컬 파일 | 현재 동작 | 구현 시 변경 |
|---|---|---|
| `apps/web/src/api/identify.ts` | 1.2초 뒤 고정 s1. 입력 이미지 없음 | 비동기 gateway + 런타임 응답 검증 + 명시적 견본 구현 |
| `apps/web/src/state/machine.ts` | 단순 screen/flow/step, SELECT 즉시 이동, ADVANCE의 화면 문맥 제한 부족 | 선택 초안/확정 분리, 요청·화면 revision 검증, 복귀 지점과 오류 분리 |
| `apps/web/src/App.tsx` | effect의 active flag로 결과 반영만 방지 | 네트워크 취소와 자원 정리까지 수행. effect 재실행에도 일관된 소유권 |
| `packages/shared/src/flow.ts` | 단계 참조·stage·검수 확인. IdentifyResult는 TS 타입만 존재 | 식별 런타임 스키마와 ID 관계, 중복 ID, version, 장면 연결 검증 |
| `flows/hospital-recheck.json` | screens에 start만 등록 | 메뉴·확정 등 재식별 가능한 비민감 화면 추가. 입력 화면에는 안전 분기 |
| `apps/web/e2e/flow.spec.ts` | 이전 UI 문구·88px 높이 등 가정 | 승인 디자인·동작 인수 기준으로 교체. 기존 실패/안전 커버리지는 유지 |
| `docs/04-design-guidelines.md`, `CLAUDE.md` | 버린 보드와 고정 타이포 지침 | 승인 screen-family로 갱신. 실제 단말/모의 표시/개인정보 규칙 유지 |

원격은 제출 템플릿뿐이다. 이번 문서는 로컬 재사용을 전제로 하되 다음 구현 첫 단계에서 원격 변경을 다시 확인하고 해당 checkout/HEAD를 기록한다. 현재 로컬 폴더를 무조건 통째로 push하지 않는다. 저장소에서 Actions·Pages 사용 불가이므로 CI 통과를 전제로 설계하지 않는다. 개발용 별도 저장소 신설은 이번 범위가 아니다.

## 2. 구조: 기존 React·순수 절차 엔진 유지

새 전역 상태 라이브러리나 디자인 프레임워크를 도입하지 않는다. reducer는 사용자 흐름을, 훅은 외부 자원 수명을, 화면은 렌더와 이벤트 전달을 책임진다. 시안의 imperative innerHTML 런타임을 React 안에 넣지 않는다.

예정 경로는 최종 구현 checkout 기준 상대 경로다.

| 경로 | 책임 |
|---|---|
| `apps/web/src/App.tsx` | 앱 조립, 견본/실연결 주입, `/mock/hospital` 분기 |
| `apps/web/src/state/machine.ts` | 단일 사용자 상태와 이벤트 가드. 카메라/오디오 객체는 넣지 않음 |
| `apps/web/src/screens/entry.tsx`, `screens/guidance.tsx` | 승인한 화면 군, 로딩·오류·직원 화면 |
| `apps/web/src/components/ui.tsx`, `components/KioskScene.tsx` | 로고/패널/버튼/시트, 등록된 장면/목표/확대 |
| `apps/web/src/styles/tokens.css`, `styles/app.css` | 승인 토큰·반응형·테마. 무분별한 화면별 덮어쓰기 금지 |
| `apps/web/src/hooks/useCamera.ts` | 권한·stream·video 준비·JPEG·track 정리 |
| `apps/web/src/hooks/useGuidanceAudio.ts` | audio 한 개, play 실패/취소/경쟁 처리 |
| `apps/web/src/api/gateway.ts`, `api/http.ts`, `api/demo.ts` | 동일 인터페이스의 HTTP/명시적 견본 구현 |
| `apps/web/src/content/hospital-scenes.ts` | flow version + step ID → 승인 장면, 목표 영역, 음원 자산 키 |
| `apps/web/src/mock/HospitalKiosk.tsx` | 실제로 눌러 진행하는 모의 접수기, 민감정보 미수집 |
| `apps/web/src/copy/ja.ts`, `flows/hospital-recheck.json` | UI 문구와 단계별 검수 문구. 화면용 짧은 문구/음성용 설명 분리 |
| `packages/shared/src/flow.ts`, `identify.ts` | 검증 가능한 데이터 계약. 비밀키·모델 호출 없음 |
| `apps/web/public/assets/tonari/` | 승인 SVG/로고. 실사진 없이 등록 장면 재사용 |

공통 버튼·패널을 먼저 확정한 후 화면을 붙인다. 새로운 컴포넌트는 책임이 분명할 때만 분리한다. approved CSS의 의미 없는 숫자 변경이나 예전 UI와의 혼합은 하지 않는다.

## 3. 상태 모델과 전이

사용자 상태는 `start | capture | identifying | active | staff | unavailable`로 구분한다. active의 화면은 검증된 flow의 `guide | choice | stop | end`에서 파생한다. 카메라 상태와 음성 상태는 각 훅의 독립 상태이며 사용자 단계를 바꾸지 않는다.

필요한 데이터: `flow/version`, `stepId`, `selectedOptionId`, `requestId`, `screenRevision`, `captureReturn`, `unknownCount`, `overlay`, 분류된 오류. 이미지/토큰은 URL이나 영속 저장소가 아닌 소유한 메모리 서비스에서 관리한다.

| 이벤트 | 허용 문맥 | 결과 |
|---|---|---|
| START | start | 새 세션 상태, capture |
| PHOTO_READY | 현재 capture revision, 유효 JPEG | 새 requestId, identifying |
| IDENTIFIED | 현재 요청·현재 identifying + 모든 데이터 검증 성공 | flow/step을 원자적으로 active로 설정 |
| IDENTIFY_UNKNOWN | 현재 요청 | 1회 capture, 2회 staff |
| REQUEST_ERROR | 현재 요청 | 원인별 오류. unknownCount 유지 |
| CHOOSE_OPTION | active choice + 허용 option | 선택만 변경 |
| CONFIRM_CHOICE | 같은 choice revision + 현재 선택 유효 | 선택된 next로 한 단계 이동 |
| PRESSED | active guide + 같은 step/revision | next로 한 단계 이동 |
| RESUME_STOP | active resumable stop + 명시적 확인 | 정의된 next로 이동 |
| RETAKE / CANCEL_CAPTURE | 안전한 active / capture 또는 identifying | 출발점을 보존 / 요청 취소 후 출발점 복원 |
| RESTART | 모든 화면 | 자원 종료, 요청 무효화, 전체 상태 초기화 |

빠른 연속 클릭은 reducer의 step/revision 검증만으로 충분하다고 가정하지 않는다. 첫 액션 직후 잠금, 새 화면에서 시작한 포인터·키 입력만 허용, 중복 동작 테스트를 함께 둔다. 임의의 긴 지연으로 노인 사용자의 조작을 답답하게 만들지 않는다.

브라우저 뒤로: 열린 시트가 있으면 닫기 → 촬영이면 취소 → 유효한 앱 진입점이면 해당 지점. 이미 키오스크에서 한 동작을 취소했다고 가정해 이전 물리 단계로 자동 역행하지 않는다. 앱 새로고침·재진입은 시작 화면. 프로토타입의 view/step 쿼리는 제품의 임의 단계 건너뛰기 경로로 옮기지 않는다.

## 4. 미디어·장면·개인정보

카메라는 후면 우선 `audio:false`, video 준비 전 셔터 비활성, 한 번 촬영 후 바로 track 종료. 권한 요청 중 취소 후 성공한 stream도 종료한다. hidden/pagehide/unmount에서 카메라·오디오를 정리한다. 복귀 시 자동 재전송·촬영 없이 사용자에게 재개 행동을 제공한다. secure context 및 권한 실패를 처리한다. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

카메라 가이드와 캡처 좌표를 동일 비율로 계산하고 CSS cover crop을 실제 전송 crop과 혼동하지 않는다. JPEG 긴 변 1280px, 품질 0.85를 **초기 구현값**으로 둔다. 최대 바이트는 contracts의 협의 항목이며 크기 초과는 안내 후 다시 촬영한다. 읽을 수 없는 축소가 생기면 고정 수치를 고집하지 않고 실제 등록 화면 검증으로 조정한다. 장치 메모리의 물리적 완전 삭제를 보장한다고 표현하지 않는다.

장면의 3×3 row/col은 음성 위치 설명용으로만 사용한다. 시각 목표는 등록된 SVG의 명시적 영역과 자산 버전으로 지정한다. 동일 콘텐츠 좌표계에서 장면·노란 표시·확대를 계산한다. 모의 접수기의 버튼과 대조한다. 캡처 사진은 인식용이며 사용자 개인정보가 등장한 다음 화면의 배경 자산으로 쓰지 않는다.

음성은 HTMLAudioElement 한 개로 현재 단계의 검수된 파일을 재생한다. 시안의 speechSynthesis는 일본어 local voice가 확인될 때에만 명시적 대체 수단으로 유지 가능하며, 실제 음원 준비를 대신 완료 처리하지 않는다. `はじめる` 한 번으로 모든 후속 자동재생이 보장된다고 가정하지 않고 매 play Promise의 실패를 처리한다. 음원 없음·재생 차단에서는 재생 버튼과 짧은 상태 메시지를 제공한다. [MDN play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)

도움·확대·안전 시트는 native dialog를 우선하고 focus trap/복귀, ESC, 배경 inert, 이름 읽기를 검사한다. 안전 시트를 닫아도 stop 통과로 기록하지 않는다. [MDN dialog 접근성](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/dialog_role)

## 5. 디자인 기준 자산과 변경 검토

기준 폴더: `docs/design-baseline` (저장소 루트 기준). 이전 tonari-redesign이나 docs/design/board는 사용하지 않는다.

| 자산 | 2026-11-08에 재확인한 SHA-256 |
|---|---|
| screen.css | `1b463cbd3023f2f29f7441686c26caf3659707b48b3cbb4c664776b86a0fbb09` |
| screens-extra.css | `69ac8ea284298dfbfbf9d1d8d66fed4f8120d131866c801857e2d189e1a9b507` |
| screen.js | `981532f1effd45d1d3c6a9799830fab8e716a91e91dbf81a2f003d18bb17b5d2` |
| assets/terminal.svg | `4ac83d21be81e2a6e7b1299bd38f2fe22271d9ef8582b9380bafc69349863e98` |
| screens/guide-360.png | `bc5582adab6639484257a175c4c2425c36ce70258b3a6b5d6e4e829099d60642` |
| screens/guide-390.png | `a845dbd53464b9857ad0157f503dbd259496d0543257d45a5facbe8445a6c9fd` |

원본 기록에 제목 32px가 남아 있지만 실제 승인 CSS는 30px다. 실제 CSS/스크린샷을 따른다. React 이식 후 동일 OS/브라우저·폰트·테마에서 비교하며 목표 영역·제목 줄바꿈·패널 위치·버튼 크기의 변경은 근거와 새 캡처를 남긴다. 새 카메라·오류 상태는 기능상 필요한 차이로 분리해 검토한다. 전체 픽셀 허용 오차를 임의로 높여 통과시키지 않는다.

## 6. 검증과 완료 구분

| 범위 | 자동 검증 | 직접 확인 |
|---|---|---|
| 엔진·계약 | ID 관계, 중복 ID, 검수 false, 깨진 next, 지원하지 않는 version, malformed JSON | 검수된 장면/음성과 텍스트 일치 |
| 상태 | 3개 분기, 이중 탭, 늦은 응답, 취소, 재시작, 잘못된 이벤트, stop 우회 불가 | 뒤로/취소가 이해되는지 |
| 카메라 | fake stream, 준비 전 셔터, 거부·무응답·늦은 허용·해제, 전송 바이트와 방향 | iPhone/Android 후면/회전/앱 전환 |
| 네트워크 | 대역으로401/413/429/5xx/timeout/offline, 합의 계약 fixture | 실제 서버 CORS/인증/왕복 |
| 음성 | play reject·404·중첩·단계 변경·hidden 처리 | 실제 일본어 발음·음량·자동재생 차단 복구 |
| UI | 5화면+안전/직원/오류,390×844·360×640·200%·dark, 레이아웃·초점·가로 넘침 | VoiceOver/TalkBack, 가로 방향, 실폰 브라우저 바 |
| 기기 연결 | mock route와 안내 장면 좌표·명칭 대조 | 태블릿을 직접 누르고 폰으로 촬영하는 전체 동선 |

실행 명령은 기존 `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`를 유지한다. 추가 테스트는 의미 있는 실패·경계 중심이다. 카메라·오디오·사진을 가진 실연결 세션에는 Playwright trace/video/네트워크 본문 수집을 켜지 않는다. 합성 fixture만 캡처한다.

배포·성능 수치·식별 정확도는 이번 문서 작성에서 NOT_RUN. 구현 후 변경된 범위의 증거만 갱신한다. 운영 배포는 별도 단계이며 이 저장소에 GitHub Actions를 추가하는 계획은 세우지 않는다.
