# 남은 작업

현재 상세 상태는 `frontend-status.md`, 구현 항목은 `../specs/001-frontend-foundation/tasks.md`가 기준이다.

1. 서버 담당자와 session/identify/flow/version/error 계약 합의 후 실제 서버 연결.
2. 안내 음원은 Cloud TTS로 생성·연결됨(`npm run voice:generate`). 문구를 바꾸면 다시 생성한다. 실폰 청취 확인은 남음.
3. HTTPS 환경에서 실제 iPhone Safari/Android Chrome의 후면 카메라·거부 복구·소리·앱 전환·화면읽기 확인.
4. 모의 접수기를 태블릿에 띄우고 폰으로 찍는 실제 동선 검증. AI 식별 정확도는 별도 평가.
5. Firebase Hosting 배포 완료: https://axial-sunup-488315-k1.web.app (실 API 미연결).

조작음 자동 진행, Live 음성 대화, 맥도날드, PWA/Wake Lock은 후속 범위다. 고령자 사용성 효과는 아직 검증하지 않았다.
