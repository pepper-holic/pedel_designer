---
name: pcb-to-netlist
description: 국내 DIY 이펙터 쇼핑몰 페달파츠(pedalparts.co.kr)의 키트 페이지에서 기판 레이아웃 이미지·부품표·배선도를 수집·분류하고, 부품(저항·캐패시터·팟·반도체·스위치·잭·케이스) 카탈로그를 만들며, 기판 트레이스 이미지와 부품표로 회로(넷리스트)를 역으로 뽑아 Pedal Designer 프리셋으로 옮길 때 쓴다. "페달파츠 수집", "키트 기판 사진 모아줘", "부품 라이브러리 갱신", "이 키트 회로 역설계", "PCB로 회로 뽑기", "PCB 설계 참고 기판" 같은 요청에 쓴다.
---

# 페달파츠 기판 수집 · 부품 라이브러리 · 회로 역설계

## 무엇이 어디에 있나

| 경로 | 내용 | git |
|---|---|---|
| `references/pcb-kits/<goodsNo>/` | 키트 페이지(`page.html`), 판매자 설명(`info.txt`), 이미지(`img_NN.*`), 이미지 출처(`images.tsv`) | 제외 (판매처 저작물) |
| `references/pcb-kits/index.json` | 상품별 이름·항목 종류(`item`)·추정 계열(`type`)·카테고리·판매자 설명 요약(`about`)·이미지 분류, 기판 단품/스티커는 같은 이름 키트로 `kitGoodsNo` 연결 | 커밋 |
| `references/pcb-kits/categories.tsv` | 카테고리 코드 → 상품 목록 | 커밋 |
| `references/parts/<goodsNo>/` | 부품 상품 페이지(이미지 없음) | 제외 |
| `references/parts/catalog.json` | 부품 카탈로그(종류·이름·선택 가능한 값·단가·품번·시뮬레이션 모델 유무) | 커밋 |

이미지와 페이지 원본은 판매처 저작물이라 로컬 참고용으로만 두고 커밋하지 않는다. 앱에 들어가는 것은
**직접 다시 그린 넷리스트와 부품값(기능적 사실)** 뿐이다 (`docs/plan-circuit-archive.md` §2 원칙과 같다).

## 스크립트 (`.claude/skills/pcb-to-netlist/scripts/`)

모두 `python -E -P`로 돌린다. Pillow가 사용자 site-packages에 있어 `-I`로는 import가 안 되고,
`-P`가 수집 폴더·현재 폴더를 import 경로에서 빼 준다.

```bash
# 카테고리 목록 (cateCd, goodsNo, 이름)
python -E -P .claude/skills/pcb-to-netlist/scripts/fetch_kit.py --list 036 065 > references/pcb-kits/categories.tsv
# 카테고리 전체 수집 (이미 받은 goodsNo는 건너뜀 - 끊겨도 다시 돌리면 이어서 받음)
python -E -P .claude/skills/pcb-to-netlist/scripts/fetch_kit.py --all references/pcb-kits 036 065
python -E -P .claude/skills/pcb-to-netlist/scripts/fetch_kit.py --all references/parts 058 040 --no-images
# 키트 하나만
python -E -P .claude/skills/pcb-to-netlist/scripts/fetch_kit.py 186788082 <out_dir>
# 색인 / 부품 카탈로그
python -E -P .claude/skills/pcb-to-netlist/scripts/build_index.py references/pcb-kits references/pcb-kits/categories.tsv
python -E -P .claude/skills/pcb-to-netlist/scripts/build_parts.py references/parts references/parts/categories.tsv apps/web/src/core/library/deviceModels.ts
# 분류 눈검사용 접촉 인화 (스크래치 폴더에)
python -E -P .claude/skills/pcb-to-netlist/scripts/contact_sheet.py references/pcb-kits board-trace <scratch>/trace 8 170 64
```

수집은 0.5초 간격으로 한 장씩 받는다. 병렬로 두드리지 않는다.

### 카테고리 코드 (2026-10 기준)
- 이펙터 키트: `036` 부품팩, `087` 부품팩(앵글 팟), `065` 전용기판 단품, 계열별 `086 088 089 090 091 093 095 100 101 110~126`
- 앰프·캐비닛: `061` 튜브앰프 파츠(앰프 PCB 포함), `072` 캐비닛 파츠, `078 079 080 084 094 098` 앰프 키트
- 부품: `058` 저항, `040` 캐패시터, `029` 팟, `042` 오피앰프, `041` 저마늄 다이오드, `118` 저hFE 실리콘 TR,
  `119` 저마늄 TR 세트, `016` 일렉트릭 파츠(반도체 전반), `048` LED, `009` 스위치, `012` 잭, `010` 노브,
  `001`/`099` 케이스, `067` 배선, `014` 악세사리
- 사이트 메뉴가 바뀌면 홈 페이지의 `cateCd=` 링크를 다시 뽑는다(`fetch_kit.py`의 `--list`로 확인).

### 항목 종류와 계열 (`index.json`의 `item`, `type`)
- `item`: `kit`(부품팩·풀키트·앰프팩), `pcb`(기판 단품), `sticker`(Ⓢ 표기 케이스 스티커), `hardware`(그 밖의 잭·스위치·앰프 부품).
- `type`: overdrive, distortion, fuzz, buffer-boost, preamp, amp(튜브앰프 키트), eq, compressor, noise-gate, filter,
  modulation, delay, reverb, pitch, utility, cabinet, unknown. 이름과 판매자 설명의 키워드로 추정한 값이라 틀릴 수 있다
  (앰프 이름을 딴 페달이 다른 계열로 가는 식). 규칙은 `kit_types.py`, 고칠 때는 영문 키워드가 단어 경계로만 맞는 점에 주의.

### 이미지 분류 (`index.json`의 `kind`)
- `board-trace` — 흰 바탕, 자홍 패드, 연두/노랑·하늘색 트레이스의 레이아웃 렌더. **역설계의 주 자료.**
- `bom-table` — 세로로 긴 부품표(노랑·빨강 강조 행이 있을 수 있음).
- `diagram` — 가로형 흰 바탕 그림: 잭·풋스위치·DC 배선도, 또는 한 기판으로 만드는 변형별 값 차이표.
- `board-render` — 녹색/보라 기판 렌더(배선이 겹쳐 그려진 경우가 많음).
- `shared` — 여러 키트 페이지에 똑같이 붙은 공통 이미지(캡 읽는 법, 팟 탭 자르기 등).
- `photo` — 완성품·부품 사진.
분류는 픽셀 통계 기반 추정이다. 바꿨으면 접촉 인화로 한 번 훑어본다.

## 회로 역설계 절차 (board-trace → 넷리스트)

1. `index.json`에서 키트를 고르고 `board-trace`와 `bom-table` 이미지를 Read로 연다. 판매자 설명
   첫 줄(`about`)에 원본 페달이 적혀 있는 경우가 많다("칼라사운드 오버드라이브 페달입니다.").
2. **층을 구분해서 읽는다.** 연두/노랑 트레이스와 하늘색 트레이스는 서로 다른 층이다. 두 색이 교차하는
   지점은 연결이 아니다. 같은 색끼리 만나거나, 트레이스가 자홍 패드·비아(작은 자홍 원)에 닿을 때만 연결이다.
3. 실크 표기를 읽는다: 부품 값은 몸통 위 글자(`4.7K`, `10n`, `22uF`), 극성은 `+`, 트랜지스터는
   `E B C` 핀 이름과 품번, IC는 반달 홈 쪽이 1번 핀. 팟은 기판 가장자리 3핀 패드열에 이름과 값(`GAIN B100K`)
   과 `1`(1번 다리) 표시가 있다. `IN`, `OUT`, `9V`, `GND`, `LED` 패드가 외부 배선 지점이다.
4. 패드마다 넷 번호를 붙인다(같은 층 트레이스로 이어진 패드끼리 같은 넷). 큰 이미지는 영역을 잘라
   2~3배로 확대해서 본다(`PIL`의 crop/resize로 스크래치 폴더에 저장 후 Read).
5. 부품표와 대조한다: 기판에서 읽은 부품 수·값이 `bom-table`과 일치해야 한다. 안 맞으면 판독을 다시 본다.
   변형 차이표(`diagram`)가 있으면 기본 변형 하나를 고르고 나머지는 `variants`로 둔다.
6. 넷리스트를 `apps/web/src/core/library/presets/archive/` 패턴대로 작성한다(블록·노브·`archive.sourceRefs`에
   키트 URL과 원본 페달 분석 자료). 바이어스 점과 클리핑 동작 테스트를 붙이고, 새 프리셋의 솔버 기준 샘플을
   `tests/fixtures/transient-reference.json`에 추가한다(기존 항목은 건드리지 않는다).

## PCB 설계 참고로 쓸 때
`board-trace` 이미지들은 이 앱의 PCB 자동 배치(`apps/web/src/editor/pcb/`)를 손볼 때 실제 DIY 기판의
관례를 보는 자료다: 팟을 기판 한쪽 가장자리에 일렬로(앵글 팟이면 기판에 직접), `IN/OUT/9V/GND` 패드를
반대쪽에, 1590B 기준 크기, 2층 배선과 비아 사용 빈도. 계열(`type`)로 거르면 같은 크기의 기판끼리 비교할 수 있다.

## 부품 카탈로그를 쓸 때
`catalog.json`의 `hasSimModel: false`인 반도체는 앱의 `deviceModels.ts`에 모델이 없는 품번이다. 새 프리셋이
그 품번을 쓰면 데이터시트 값으로 모델을 먼저 추가한다. 저항·캐패시터·팟의 `options`는 실제로 구할 수 있는
값 목록이라, 부품값을 고르거나 BOM을 만들 때 표준값 확인에 쓴다.
