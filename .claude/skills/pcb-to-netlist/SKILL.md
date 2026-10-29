---
name: pcb-to-netlist
description: DIY 이펙터 키트의 기판 레이아웃 이미지(페달파츠 pedalparts.co.kr 키트 페이지의 패드·트레이스 렌더)에서 회로를 역으로 뽑아 Pedal Designer의 회로도(키트 회로 프리셋)로 올리고, 부품표·실크 역투영·원본 회로 대조·동작점으로 검증한다. "이 키트 회로 뽑아줘", "PCB에서 회로도로", "기판 역설계", "키트 회로 추가", "페달파츠 키트 올려줘" 같은 요청에 쓴다. 키트 페이지·부품 카탈로그 수집도 여기 스크립트로 한다.
---

# 기판(PCB) → 회로도

한 키트를 올리는 흐름: **기판 이미지 → 패드·넷 자동 추출 → 부품 대응표 작성 → 넷리스트 JSON → 검증 → 앱에서 확인**.
앱에 들어가는 것은 직접 다시 쓴 넷리스트와 부품값(기능적 사실)뿐이고, 판매처의 이미지·페이지 원본은
`references/` 아래 로컬에만 둔다(gitignore).

모든 Python 스크립트는 `python -E -P`로 돌린다(Pillow가 사용자 site-packages에 있어 `-I`면 import 실패,
`-P`가 데이터 폴더를 import 경로에서 뺀다). 스크립트 위치: `.claude/skills/pcb-to-netlist/scripts/`.

## 도구와 판단(LLM)의 분담

| 단계 | 도구만으로 | 판단이 필요한 부분 |
|---|---|---|
| 수집·분류·부품 카탈로그 | 전부 (`fetch_kit`, `build_index`, `build_parts`) | 분류 규칙이 틀린 몇 건 손보기 |
| 패드·넷 추출 | 전부 (`extract_nets`) | 한 패드뿐인 넷이 남으면 그 자리 확대해 끊김인지 판단 |
| 부품 대응(패드쌍 → 부품·값·핀) | - | **실크 글자 읽기**(값, C/B/E, 팟 "1", 극성, IC 홈) |
| 부품표(BOM) | 개수·값 대조 (`kit_netlist` BOM) | **부품표 이미지 전사**, 키트 페이지의 품번·등급 |
| 팟 방향 | - | 실크 "1" + 회로 논리(볼륨·게인 방향) |
| 넷리스트 생성·검사 | 전부 (`kit_netlist`: 미사용 패드, 단독 넷, BOM) | `check:` 줄의 원인 판단 |
| 역투영 | 이미지 생성 (`verify_overlay`) | 라벨이 실크와 맞는지 눈검사 |
| 원본 대조 | PDF 텍스트·이미지 추출 (`pymupdf`) | **원본 페달 식별, 공개 회로 찾기, 연결 비교** |
| 단계(STAGE) | - | **기능 단계 나누기**(입력/버퍼/게인/피드백/톤/클리퍼/출력) |
| 배치 | 초안 (`suggest_layout`), 캡처 (`capture_schematic`) | 초안 보고 엉킨 곳 손 배치 |
| 시뮬레이션 | DC·신호·노브·배치 테스트, 오디오 렌더 | 이상 동작이 변환 오류인지 회로 특성인지 진단 |
| 미지원 부품 | 자동 분리 (`unsupportedKits`) | 새 소자 모델 추가 여부 |

## 빠른 흐름 (키트 하나)

```bash
S=.claude/skills/pcb-to-netlist/scripts
python -E -P $S/batch_prepare.py references/pcb-kits          # 전 키트 패드·넷 추출 + triage.json (A/B/C 등급)
python -E -P $S/pilot_bundle.py references/pcb-kits <goodsNo> <작업폴더>   # 오버레이·렌더·부품표·map.txt 뼈대
#   (판단) board0_nets.png와 부품표를 보고 map.txt의 부품 줄·STAGE·BOM·io·JUMP를 쓴다
bash $S/finish_kit.sh <작업폴더> <goodsNo> --layout           # 넷리스트 생성·검사, 배치 초안, 역투영, maps/ 복사, 테스트
python -E -P $S/selftest.py                                   # extract_nets.py를 고쳤으면 반드시
```

`finish_kit.sh`의 `check:` 줄이 0개, 역투영(verify.png)의 라벨이 모두 같은 값의 실크 위, 키트 테스트 통과가 완료 조건.

추출기 교훈(2026-10 파일럿): 실크 밑으로 사라진 트레이스를 이어 붙이는 규칙(몸통 터널, 긴 실크 다리, 실크 플러드)은
모두 엉뚱한 넷을 합쳐서 뺐다. **잘못 합친 넷은 숨고, 끊긴 패드는 드러난다** - 끊긴 곳은 판독자가 렌더를 보고
`JUMP a b`로 잇는다. 접지 패드는 "연보라 + 가운데 '+' 실크"인데, 작은 렌더는 모든 패드가 연보라라 '+' 십자만으로 판정한다.

## 0. 재료 찾기

`references/pcb-kits/index.json`에서 키트를 고른다(`item: "kit"`, `type`, `about`에 원본 페달). 이미지 `kind`:
`board-trace`(자홍 패드·연두/하늘색 트레이스 렌더, **주 자료**), `bom-table`(부품표), `diagram`(외부 배선도/변형표).
폴더가 없으면 수집부터 한다(아래 "수집"). 시뮬레이션 모델이 없는 부품(PT2399, BBD, OTA, MOSFET, 차지펌프 IC)이
있는 키트는 기록은 되지만 앱에서 `unsupportedKits`로 빠진다 - 드라이브·퍼즈·부스트·프리앰프부터 한다.

## 1. 패드와 넷 추출

```bash
python -E -P scripts/extract_nets.py <board.jpg> <scratch>/<kit> 3
```
`<kit>.json`(패드 id·좌표·넷)과 `<kit>.png`(패드마다 "id/n넷" 번호를 찍은 확대 이미지)가 나온다. PNG를 Read로 연다.

색 규칙(검증된 것): 자홍 고리 = 패드, **연보라 고리 + 회색 "+"** = 그려지지 않은 접지면에 붙은 GND 패드,
올리브/연두 = 윗면 동박, 하늘색 = 아랫면 동박(두 층은 패드·비아에서만 연결), 회색·검정·초록 = 실크(연결 아님).
실크 외곽선·글자가 동박 위에 찍혀 트레이스를 끊는 것은 스크립트가 짧은 실크 구간을 이어 붙여 처리한다.
한 패드만 있는 넷이 남으면 그 자리를 잘라 확대해 보고, 실제 연결이면 대응표에 `JUMP`로 잇는다.

## 2. 부품 대응표 작성 (`references/pcb-kits/maps/<goodsNo>.txt`, 커밋)

형식은 `scripts/kit_netlist.py` 맨 위 설명. 요점:
- 머리: `id pp-<slug>`, `goods`, `name`, `motif`(원본 페달), `type`, `desc`(한 줄 한국어 토폴로지 요약),
  `io IN= OUT= V9= GND=`, `BOM`(키트 부품표 이미지를 그대로 옮김, `값xN`).
- 부품: `R/C/L 값 패드 패드`, `D 품번 a= k=`, `Q 품번 b= c= e= Q1`(JFET은 `g= d= s=`), `POT B100K 이름 1번 와이퍼 3번`,
  `IC TL072 1=.. 8=..`, 오프보드/표시용 패드는 `NC`(상태 LED와 그 저항은 오디오 경로가 아니라 뺀다).
- `STAGE <id> <category> <라벨>`로 부품을 신호 순서의 기능 단계로 묶는다: 입력 → 버퍼 → 프리앰프/게인 →
  피드백·바이어스(custom) → 컨트롤(custom) → 클리퍼/퍼즈 → 톤 → 복원단 → 출력, 전원(power). 앱이 이 순서대로
  블록을 좌→우로 배치하므로 바둑판이 아니라 사람이 읽는 회로도가 된다.

기판 밖 연결: 팟 와이퍼가 패드 없이 바로 잭으로 가면 패드 번호 대신 `OUT`/`IN`/`V9`/`GND`를 쓴다
(`POT A100K LEVEL 12 OUT 11` - io의 OUT은 생략 가능).

판독 규칙:
- 트랜지스터에 E/B/C 실크가 없으면 넷으로 정한다: 2.2M·컬렉터 저항·출력 캡이 모인 쪽이 C, 입력 캡이 오는 쪽이 B,
  이미터 저항·바이어스 팟으로 가는 쪽이 E. 짐작으로 e-b-c 순서를 쓰지 않는다(Green Giant는 C-B-E였다).
- 같은 모양 부품이 나란히 있으면(세로 캡 두 개) 패드 쌍을 위아래로 짝지었는지 역투영에서 꼭 본다.
- 값은 몸통 실크 글자, 트랜지스터 핀은 실크 `C B E`, 전해 캐패시터는 사각 패드가 +, 다이오드는 띠 쪽이 캐소드,
  IC는 반달 홈 쪽이 1번 핀. 품번 등급까지 적는다(BC183 vs BC183C - hFE가 다르다). 키트 페이지 텍스트에
  트랜지스터 품번이 따로 적혀 있으면 그것을 따른다.
- **팟 1번 다리는 실크의 "1" 표시 쪽**. 반드시 회로 논리로 확인한다: 볼륨은 1번=GND·와이퍼=출력, 게인/퍼즈
  바이패스는 시계방향이 게인 증가가 되는 쪽. 와이퍼가 한쪽 다리와 묶인 팟은 앱에서 가변저항 노브로 변환된다.

## 3. 넷리스트 JSON 생성

```bash
python -E -P scripts/kit_netlist.py references/pcb-kits/maps/<goodsNo>.txt <scratch>/<kit>.json apps/web/src/core/library/kits/circuits/<id>.json
```
출력의 `check:` 줄을 0개로 만든다: 쓰지 않은 패드, 리드가 하나뿐인 넷, 단계에 안 속한 부품, **부품표와 개수·값이
다른 항목**. JSON이 `circuits/`에 있으면 앱의 라이브러리 "키트 기판 회로" 묶음에 자동으로 뜬다
(`src/core/library/kits/` - 값 파서, 품번→모델 표 `partModels.ts`, 변환기 `kitToPreset.ts`, 단계→블록 `stageBlocks.ts`).
새 품번이 나오면 `partModels.ts`에 넣는다(실리콘 BJT는 hFE만 다르게, 듀얼/싱글 오피앰프 핀배치 표 사용).

## 3-1. 회로도 배치 (사람이 읽는 회로도로)

STAGE만 있으면 앱이 블록 단위 자동 배치를 하는데, 트랜지스터 2~3석 + 톤 스택 정도만 돼도 선이 엉킨다.
그래서 키트마다 교과서식 배치를 대응표의 `AT` 줄로 고정한다(앱은 그 자리·방향에 부품을 고정하고 접지 기호
매달기와 배선만 자동으로 한다).

1. 초안: `python -E -P scripts/suggest_layout.py apps/web/src/core/library/kits/circuits/<id>.json >> <map>`
   (신호 척추는 가운데 줄 y=400, 9V 레일 y=160, 접지 소자는 노드 아래, 레일 소자는 노드 위, 두 노드가 이미
   놓인 피드백·바이어스 소자는 아래 차선, 나머지는 놓인 노드에서 가지로).
2. 다시 생성하고 캡처해서(`capture_schematic.mjs`) 본다. 퍼즈페이스 같은 단순 회로는 초안 그대로 쓸 만하다.
3. 읽기 나쁜 곳만 손으로 옮긴다. 원칙:
   - 레일 위, 접지 아래, 신호 왼→오. 직결 단(Q1 C→Q2 B)은 계단으로 한 칸 올린다.
   - 컬렉터 저항은 컬렉터 바로 위, 이미터 저항·바이패스 캡은 이미터 바로 아래에 나란히.
   - 단 사이를 되돌아가는 피드백(이미터→앞단 베이스, 출력→앞단 이미터)은 트랜지스터 아래 차선에 가로로.
   - 톤 스택은 원본 회로도 모양대로: 박산달은 위 줄 베이스(R–팟–R), 아래 줄 트레블(C–팟–C), 가운데 혼합점에서
     다음 단으로, 오른쪽 끝 노드에서 복원단 피드백 캡. TS/빅머프 톤은 신호 줄 위 직렬 + 아래 션트.
   - 같은 STAGE 부품은 공간적으로 모은다(단계 상자가 겹치지 않게). 피드백·드라이브처럼 한 단 안에 있는 소자는
     그 단 STAGE에 넣는다.
4. `AT`를 쓰면 부품 줄에 이름을 명시한다(`R 100K 9 10 R2`). 자동 이름은 줄 순서로 매겨져 줄을 옮기면 바뀐다.
   좌표 문법·방향(h/v/h-/v-, r0~r270, m)은 `kit_netlist.py` 설명. 2단자 60px, BJT 핀은 중심에서 30px, 팟 와이퍼는
   축에서 30px라 10px 격자에 맞추면 선이 곧게 붙는다.

## 4. 검증 (넷리스트가 기판과 같은가, 회로가 맞는가)

1. **역투영**: `python -E -P scripts/verify_overlay.py <map> <kit>.json <board.jpg> <out>.png 4` - 부품마다 패드를 잇는
   선과 "이름 값"을 기판 위에 그린다. 모든 라벨이 같은 값의 실크 위에, 트랜지스터 c/b/e·팟 1/w/3이 실크 표기 위에
   있어야 한다.
2. **부품표 대조**: 3단계 `BOM` 검사가 통과해야 한다.
3. **원본 회로 대조**: 원본 페달의 공개 회로도(빌드 문서 PDF 등)를 찾아 연결을 하나씩 비교하고, 값이 다른 곳과
   빠진 부품을 대응표 머리 주석에 적는다(예: CDOS는 Vintage POW! 회로와 연결 전부 일치, 값 5곳 차이, 베이스 팟
   양단 100n 없음). PDF는 `pymupdf`로 텍스트와 페이지 이미지를 뽑아 본다.
4. **동작점·신호**: `cd apps/web && npx vitest run tests/solver/kit-circuits.test.ts` - 모든 키트의 DC 수렴, 트랜지스터
   컬렉터가 레일 사이, 신호 통과, 팟이 노브로 로드되는지 검사. 이상하면 노드 전압을 찍어 본다. 커플링 캐패시터
   충전 때문에 과도해석 앞부분 수백 ms는 값이 흔들리니 1초 뒤를 본다.
5. 앱에서 확인: dev 서버(`.claude/launch.json`의 `pedal-designer-web`)에서 라이브러리 → 키트 기판 회로 → 해당 키트.
   고해상도 회로도 캡처: `cd apps/web && node <skill>/scripts/capture_schematic.mjs <outDir> "<라이브러리 행 이름>" <prefix>`.

## 5. (선택) 들어보기

`apps/web/tests/tools/renderKitDemo.test.ts` - `RENDER_IN`(48kHz float32 mono, 볼트 단위 기타 DI)과 `RENDER_OUT`을 주면
키트별 노브 설정(중립=12시, 한 노브씩 2~3 위치)으로 렌더하고 캐비닛 IR을 입힌 WAV와 `render.json`(주파수 응답
포함)을 쓴다. 입력은 **실제 연주 DI만**(가상악기 금지): Guitar-TECHS `P3_music.zip`의 `audio/directinput/*.wav`
(Zenodo 14963133, CC BY 4.0, 130MB). IEM 그라츠 공개 녹음의 일렉 기타 DI 채널은 50Hz 험뿐이라 못 쓴다.
DI는 픽업 개방 전압이므로 피크 0.5V 정도로 맞추고, 스크립트가 험버커(7.5kΩ, 4.4H)와 케이블 용량을 소스
임피던스로 넣는다 - 퍼즈페이스처럼 입력 임피던스가 낮은 회로는 이게 없으면 소리가 완전히 달라진다.

알려진 모델 특성: 실리콘 퍼즈페이스는 고이득 트랜지스터에서 Q1 입력 정류로 바이어스가 쏠려 듀티가 치우친
(11~26%) 뾰족한 사각파가 된다. 손으로 쓴 기존 퍼즈페이스 프리셋도 같은 경향이라 변환 오류가 아니다.

## 수집 (재료가 없을 때)

```bash
python -E -P scripts/fetch_kit.py --list 036 065 > references/pcb-kits/categories.tsv      # 카테고리 → 상품
python -E -P scripts/fetch_kit.py --all references/pcb-kits 036 065                         # 이어받기 가능
python -E -P scripts/build_index.py references/pcb-kits references/pcb-kits/categories.tsv   # index.json
python -E -P scripts/fetch_kit.py --all references/parts 058 040 --no-images                 # 부품 상품
python -E -P scripts/build_parts.py references/parts references/parts/categories.tsv apps/web/src/core/library/deviceModels.ts
python -E -P scripts/contact_sheet.py references/pcb-kits board-trace <scratch>/trace 8 170 64  # 분류 눈검사
```
카테고리: 키트 `036`(부품팩) `087`(앵글 팟) `065`(기판 단품) `086~126`(계열별), 앰프 `061 072 078~098`,
부품 `058` 저항 `040` 캡 `029` 팟 `042` 오피앰프 `041` Ge 다이오드 `118/119` TR `016` 반도체 `048` LED `009` 스위치
`012` 잭 `010` 노브 `001/099` 케이스. 0.5초 간격으로 한 장씩 받는다.
