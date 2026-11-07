# 현재 프론트 아키텍처

React/TypeScript/Vite와 기존 Zod 절차 엔진을 사용한다. 자세한 설계와 제안 API는 `../specs/001-frontend-foundation/plan.md`, `contracts.md`에 있다.

- App: 라우트와 요청 조율. 요청 ID/AbortController로 취소한 요청의 결과를 버린다.
- reducer: 시작/촬영/식별/안내/직원, 임시 선택과 선택 확정, 안전 멈춤, 복귀 지점, 화면 revision 관리.
- shared: Flow/Identify 런타임 스키마, 참조·중복 ID·기기/버전/첫 단계 관계 검증.
- hospital-scenes: 등록된 그림과 목표 위치. 현 버전의 안전 단계/분기 그래프를 고정 검증.
- useCamera: 후면 카메라, JPEG 생성(긴 변1280px,품질.85,임시2MiB 한도), 취소·숨김·연결 해제·늦은 허용 정리. 마이크 없음.
- useGuidanceAudio: 한 개의 파일 재생기, 실패/중첩/취소 처리. 최종 파일 URL이 없는 현재는 기기 내 일본어 음성만 사용자 재생 버튼으로 사용한다. 음원 수급/검수 전 자동 음성 안내 제품 완료로 보지 않는다.
- HTTP gateway: 제안한 session/identify/flows 계약의 클라이언트. 실제 서버와 합의·통합 검증하지 않았다. 토큰/사진은 메모리, POST 자동 재시도 없음.
- /demo: 외부 API 없이 검수 fixture로 동작. 재촬영에서 견본 화면을 직접 선택한다. AI 기능이 아니다.
- /mock/hospital: 승인한 SVG의 동일 좌표계를 사용하는 실제 클릭 가능한 모의 접수기. 폰과 원격 동기화하지 않는다.

공개 백엔드 코드는 제공 저장소에서 확인되지 않았다. 서버의 사진 폐기·비용 제한·모델/인증 동작은 이 프론트 검사로 증명하지 않는다. 배포는 이번 작업에 포함하지 않는다.
