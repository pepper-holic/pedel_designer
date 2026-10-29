# references

외부 DIY 자료를 로컬 참고용으로 모아 둔 곳. 수집·갱신 방법은 `.claude/skills/pcb-to-netlist/SKILL.md`.

- `pcb-kits/index.json` — 페달파츠(pedalparts.co.kr) 키트별 이름, 추정 계열, 판매자 한 줄 설명, 이미지 분류
  (`board-trace` 기판 레이아웃 렌더, `bom-table` 부품표, `diagram` 배선도/변형표, `board-render`, `photo`, `shared`).
- `pcb-kits/categories.tsv` — 쇼핑몰 카테고리 코드 → 상품 목록.
- `parts/catalog.json` — 부품 상품 카탈로그(종류, 선택 가능한 값, 단가, 반도체 품번과 앱 시뮬레이션 모델 유무).
- `parts/categories.tsv` — 부품 카테고리 코드 → 상품 목록.

키트 폴더(`pcb-kits/<goodsNo>/`, `parts/<goodsNo>/`)의 페이지 원본과 이미지는 판매처 저작물이라 커밋하지 않는다
(`.gitignore`). 다른 PC에서는 스킬의 수집 명령으로 다시 받는다. 앱에는 이 자료를 보고 직접 다시 작성한
넷리스트와 부품값만 들어간다.
