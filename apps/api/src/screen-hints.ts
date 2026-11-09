// 등록 화면마다 "사진에서 보이는 단서". Gemini가 비슷한 화면끼리 헷갈리지 않게 프롬프트에 넣는다.
// 키: `${flow_id}:${screen_id}`. 모의 접수기(/mock/hospital) 화면을 보고 쓴 것.
// 모의 접수기 화면이 바뀌면 같이 고친다.
export const SCREEN_HINTS: Record<string, string> = {
  'hospital-recheck:start':
    '見出し「受付をはじめます」、「診察券をお手元にご用意ください」、右下に緑の大きな「受付」ボタン',
  'hospital-recheck:department':
    '見出し「診療科」、青い大きなボタン「内科」「外科」「整形外科」が横に並ぶ、「受診する診療科を選択してください」',
  'hospital-recheck:confirmation':
    '見出し「内容をご確認ください」、「右下の『確定』を押します」、右下に緑の大きな「確定」ボタン。入力を求める文言はない',
  'hospital-recheck:finished': '緑のチェックマーク、「ありがとうございました」。ボタンは「最初に戻る」だけ',
};

// 등록 기기임을 사진에서 확인하는 표시. 이 표시가 읽혀야만 등록 화면으로 판정한다.
export const MACHINE_MARKERS: Record<string, string> = {
  'mock-hospital-v1': 'デモ用の模擬端末',
};
