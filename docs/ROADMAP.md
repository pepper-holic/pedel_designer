# Pedal Designer — 전체 컨셉 & 로드맵

> 개별 기능 구현 계획은 `plan-*.md`에 흩어져 있음. 이 문서는 그걸 관통하는 **큰 그림**과 **페이즈별 진행 상황**을 한 곳에 모은 것. 새 세션을 시작할 때 가장 먼저 읽을 문서.

## 1. 전체 컨셉 (비전)

기타 이펙트(오버드라이브/디스토션/부스트 계열) 회로를 **눈으로 조합하고, 그 자리에서 시뮬레이션하고, 최종적으로 실물 DIY 페달까지 만들 수 있는** 웹 기반 플랫폼.

최종 목표 파이프라인:

```
블록/부품 조합 (스키매틱 에디터)
      ↓
시뮬레이션 (transient/AC, THD, 부품 공차 몬테카를로, 페달 체인)
      ↓
부품 목록(BOM) 자동 생성        ← ✅ 완료 (2026-08-28)
      ↓
PCB 레이아웃 생성/익스포트       ← 🟡 KiCad 넷리스트 export까지 완료, 배치/라우팅은 범위 밖 (§5 결정)
      ↓
(선택) 실물 빌드 검증 / 공유
```

파이프라인 앞 절반(조합 + 시뮬레이션)에 이어, 뒷 절반(BOM/PCB)도 2026-08-28 야간 루프에서 결정된 범위까지 완료했다.

**2026-09-06 확장 방향 — 신호 경로를 페달 앞뒤로 넓힌다.** 지금까지는 "페달 회로 1개"가 대상이었지만,
기타리스트가 실제로 듣는 소리는 그 앞뒤가 결정한다:

```
픽업 → 기타 배선(볼륨/톤/셀렉터/스플릿/직병렬) → 케이블 → 페달 체인 → 앰프 입력 → 캐비닛 IR
       └────────── 신규 (Phase 9~13) ──────────┘   └── 기존 ──┘
```

상세 계획은 [plan-guitar-wiring.md](./plan-guitar-wiring.md).

핵심 설계 원칙 (지금까지 세션들에서 자연스럽게 정착된 것):

- **직접 넷리스트 재구성**: 유명 페달 회로는 스캔 이미지·문구를 복제하지 않고, 공개된 자료에서 **토폴로지/부품값(기능적 사실)만** 참고해 직접 넷리스트로 다시 작성한다. 상표명 대신 "~스타일"로 표기 ([plan-circuit-archive.md](./plan-circuit-archive.md) §2 참고).
- **이상적 소자 우선, 필요할 때만 비이상성 추가**: op-amp/다이오드/BJT/JFET 모두 기본은 단순 모델이고, 필요한 경우에만 GBWP·슬루레이트·레일 클리핑 등을 얹는다 ([plan-editor-implementation-history.md](./plan-editor-implementation-history.md) 2부).
- **회로 1개 = 파일 1개, 파일 200~400줄 유지**: 프리셋/블록/UI 컴포넌트 전부 이 규칙을 지키며 쪼갠다.
- **모든 신규 프리셋/분기는 자동 회귀 테스트에 편입**: `presets-sanity.test.ts`가 `presets` 배열 전체를 NaN/Infinity 검사하므로, 프리셋을 배열에 등록하기만 하면 별도 테스트 코드 없이 커버된다. 넷리스트 구조 자체가 파라미터로 갈라지는 경우(예: King of Tone의 `clipMode`, OCD의 `brightSwitch`)만 전용 테스트를 추가한다.

## 2. 페이즈별 로드맵

| 페이즈 | 내용 | 상태 |
|---|---|---|
| 0 | 코어 시뮬레이터 (MNA 솔버, transient/AC 해석, R/C/L/다이오드/BJT/JFET/opamp 모델) | ✅ 완료 |
| 1 | 스키매틱 에디터 (드래그 배치, 배선, 줌/팬, undo/redo, localStorage 저장) | ✅ 완료 |
| 2 | 워크벤치 UI/UX (3-pane 레이아웃, 하단 분석 탭 도크, 접근성) | ✅ 완료 (2026-08-28) |
| 3 | 분석 도구 (THD, 부품 공차 몬테카를로, 페달 체인, 캐비닛 IR 컨볼루션) | ✅ 완료 |
| 4 | 프리셋 라이브러리 (유명 회로 스타일 아카이브) | 🟡 진행 중 — 17종 완료(LPB1 스타일 추가), Tonebender MkIII/Superbolt류 후보 남음 |
| 5 | 기능 블록 시스템 (버퍼/게인/클리핑/톤스택 블록 조합 + 시각적 그룹핑) | ✅ v1 완료 (2026-08-28) — v2(자동 연결/트랜지스터 블록)는 스킵 결정 |
| 6 | BOM(부품 목록) 자동 생성 | ✅ 완료 (2026-08-28) |
| 7 | PCB 레이아웃 생성/익스포트 | 🟡 KiCad 넷리스트 export 완료(2026-08-28) — 배치/자동 라우팅은 범위 밖으로 확정 |
| 8 | (선택) 실물 빌드 검증 / 커뮤니티 공유 기능 | ⬜ 미착수 |

**Phase 9 이후 — 기타 배선/픽업 도메인 확장** (2026-09-06 신설, 상세는 [plan-guitar-wiring.md](./plan-guitar-wiring.md)):

| 페이즈 | 내용 | 상태 |
|---|---|---|
| 9 | 기타 신호원 — `role` 플래그 → `pickup` 소자 → 픽업 모델 라이브러리 → 케이블/앰프 부하 | ⬜ 미착수 |
| 10 | 스위칭 & 배선 — `switch` 소자(SPST/SPDT/DPDT/5-way) + 배선 프리셋(스플릿/직병렬/위상) | ⬜ 미착수 |
| 11 | 노브 & 톤 회로 — 실시간 노브, 파라미터 스윕 겹쳐 그리기, 트레블 블리드, 50s vs 모던 배선 | ⬜ 미착수 |
| 12 | 온보드 액티브 — Baxandall 2/3밴드, 자이레이터 미드, 액티브 픽업 | ⬜ 미착수 |
| 13 | 통합 신호 경로 — 픽업→배선→케이블→페달→앰프를 하나의 넷리스트로 병합 해석(로딩 효과 포함) | ⬜ 미착수 |

## 3. 진행된 것 (상세)

### Phase 0~3 — 시뮬레이터 · 에디터 · 분석 도구
상세는 [plan-editor-implementation-history.md](./plan-editor-implementation-history.md) 참고. 요약:
- MNA 기반 transient/AC 솔버, 비이상적 op-amp 매크로모델, 포텐셔미터 테이퍼, 캐비닛 IR 컨볼루션.
- Undo/Redo, localStorage 자동저장, THD 측정, 몬테카를로 부품 공차 분석, 페달 체인(다단 직렬) 시뮬레이터, JFET 소자.

### Phase 2 재작업 — 워크벤치 레이아웃 개편 (2026-08-28)
- 기존 "위에 팔레트 패널 + 아래 300px 좁은 컬럼에 5개 분석 패널 세로 나열" 구조 → **3-pane 고정 레이아웃**(좌: 팔레트, 중앙: 캔버스 + 하단 분석 탭 도크, 우: 인스펙터/출력)으로 전면 개편.
- 접근성 수정: `--text-faint` 대비 WCAG AA 미달(3.4:1) → 4.9:1로 조정, range 슬라이더 `:focus-visible` 추가.
- 컴포넌트 분리: `useAnalysisPanels`(로직 훅), `BottomDock`, `FrequencyResponseTab`, `WaveformTab`, `PartsSidebar` — `SchematicEditor.tsx`를 421→365줄로 유지.
- 모바일/좁은 화면 폴백에서 flex 크기 계산 버그(캔버스가 찌그러지는 문제) 발견 후 수정.

### Phase 5 — 기능 블록 시스템 v1 (2026-08-28)
Klon Centaur 다이어그램(기능별 반투명 색상 블록 + 라벨)을 참고 이미지로 삼아 구현.
- **데이터 모델**: `PartInstance.blockId`, `BlockInstance{id, defId, label, category}`, `CircuitSnapshot`/`StoredCircuit`에 `blocks` 필드 추가(구버전 저장 데이터는 `blocks: []`로 자동 하위호환).
- **블록 정의** (`blockDefs.ts`, 5종): 버퍼(Op-Amp 팔로워), 증폭 단(인버팅 Op-Amp, 피드백 루프 반복 추가로 다단 구성), 클리핑 단(대칭/비대칭), 톤 스택(패시브 필터).
- **스탬핑** (`blockInstance.ts`): 프리셋과 동일한 `graphFromNetlist` 파이프라인을 재사용해 블록 내부를 배치·배선한 뒤, 모든 part/wire id를 인스턴스 접두사로 리매핑해 여러 인스턴스 간 충돌 방지.
- **캔버스 렌더링**: 카테고리별 반투명 배경(파랑/주황/빨강/보라) + 점선 테두리 + 라벨, 부품/배선보다 아래 z-order.
- **인스펙터 통합**: 블록 소속 부품 선택 시 "소속 블록" 표시 + "블록 전체 삭제" 버튼.
- **의도적 설계 결정**: 트랜지스터(BJT/JFET) 게인 블록은 **넣지 않음** — 자체 Vdd 바이어스 소스가 "이 회로의 입력 신호원"을 찾는 기존 휴리스틱(`parts.find(p => p.type === "vsource")`, 배열의 첫 vsource)과 충돌할 위험이 있어, 게인 블록은 전원이 필요 없는 **op-amp 인버팅 증폭**으로 안전하게 구현. (아래 "고민해야 할 것" 참고)
- 블록 간 연결은 **수동 배선**(기존 단자 클릭 방식 그대로 재사용) — 자동 직렬 체인 옵션은 v1 범위에서 제외.
- 브라우저에서 5개 블록 전부 배치 → 시각적 그룹핑 → 선택/삭제 → undo까지 실동작 확인.

### Phase 4 — 프리셋 라이브러리 확장
기본 프리셋 8종 + 아카이브(유명 회로 스타일) 8종 = 총 16종.

| 분류 | 프리셋 |
|---|---|
| 기본 8종 | 버퍼, 다이오드 클리퍼(대칭/비대칭), Op-Amp 드라이브, TS9 스타일, 다단 드라이브, 퍼즈(저마늄), 톤스택, 능동 EQ, JFET 부스트 |
| 아카이브 1차 (완료) | RAT 스타일, Klon 스타일 블렌드, Big Muff 스타일, Boss 스타일 |
| 아카이브 2차 (완료, 2026-08-28) | **Timmy/Jan Ray 스타일**(JFET 부스트+저압축 피드백 클리핑), **Bluesbreaker 스타일**(논인버팅 게인+4다이오드 피드백), **King of Tone 스타일**(`clipMode`로 피드백/션트 클리핑 전환), **OCD 스타일**(실리콘+게르마늄 비대칭 하드 클리핑) |

조사 출처: coda-effects.com(Jan Ray/Timmy 회로 분석), ElectroSmash, PedalPCB 포럼, Dirtbox Layouts, Analog Is Not Dead, Stanford CCRMA 논문 등. 상세 및 저작권 원칙은 [plan-circuit-archive.md](./plan-circuit-archive.md) 참고.

### 2026-08-28 야간 루프 — §5 결정 사항 전부 구현

사용자가 자리를 비운 사이 §5-1 실행 순서를 순서대로 처리. 149→161개 테스트 전부 통과, 매 단계 `npx tsc -b --force` + 브라우저 실동작 확인.

1. **`circuitStorage` schemaVersion 도입** — [circuitStorage.ts](../apps/web/src/editor/circuitStorage.ts)에 `CURRENT_SCHEMA_VERSION` 상수 추가. 기존 저장 데이터는 필드 누락 시 버전 1로 간주(마이그레이션 분기는 버전 2가 생기는 날 추가).
2. **GND 로컬 심볼 재설계** — [graphFromNetlist.ts](../apps/web/src/editor/graphFromNetlist.ts): 접지 노드에 물리는 단자마다 그 소유 부품 바로 아래(`+70px`)에 개별 `GND1`, `GND2`, ... 심볼을 생성하도록 변경. `netlistFromGraph.ts`가 이미 "ground" 타입 부품을 전부 하나의 넷으로 union하고 있어서 몇 개를 놓든 전기적으로 동일 — **schemaVersion 변경이 필요 없었음**(당초 §5에서 필요하다고 예상했던 것과 달리, 실제로는 배치 로직만의 문제였음). 실측: 멀티스테이지 프리셋에서 575px 왕복 배선 2줄이 완전히 사라짐(최대 배선 길이 270px로 감소).
3. **Newton 미수렴 플래그** — [newton.ts](../apps/web/src/core/solver/newton.ts)가 `{ solution, converged }`를 반환하도록 변경(기존 `Float64Array` 단독 반환에서), [transient.ts](../apps/web/src/core/solver/transient.ts)가 미수렴 샘플 수를 집계해 `TransientResult.nonConvergentSampleCount`로 노출. "시뮬레이션 실행" 완료 후 상태 메시지에 경고로 표시.
4. **템플릿 탭 UX 개선** — [PartsSidebar.tsx](../apps/web/src/editor/PartsSidebar.tsx)에 검색 인풋 + 전체/기본/아카이브 카테고리 탭 추가. 카테고리는 `preset.archive` 필드 유무로 자동 판별(스키마 변경 없음).
5. **BOM 자동 생성** — [bom.ts](../apps/web/src/editor/bom.ts) + [BomPanel.tsx](../apps/web/src/editor/BomPanel.tsx). 종류+값(저항/커패시터/인덕터/포텐셔미터)·모델(다이오드는 SPICE 파라미터로 1N4148/1N34A/LED 역매칭)·극성(BJT)으로 집계, 전압원/접지는 실제로 구매하는 부품이 아니므로 제외. 탭구분 텍스트 복사 지원.
6. **PCB 레이아웃 — KiCad 넷리스트 export** — [kicadNetlist.ts](../apps/web/src/editor/kicadNetlist.ts) + [PcbExportPanel.tsx](../apps/web/src/editor/PcbExportPanel.tsx). `netlistFromGraph`에 `terminalNet: Map<"partId:terminalId", netName>`을 새로 노출시켜(포텐셔미터가 솔버 단계에서 저항 2개로 쪼개지기 전의 실제 3핀 연결을 그대로 사용) KiCad 표준 S-expression 넷리스트(`(export (components ...) (nets ...))`)를 생성. 풋프린트는 비워둠 — 배치/라우팅은 KiCad에서 사용자가 직접(§5 결정대로). `.net` 다운로드 + 텍스트 복사 지원.
7. **시뮬레이션 성능 — Web Worker 분리** — [transientWorker.ts](../apps/web/src/core/solver/transientWorker.ts) + [runTransientAsync.ts](../apps/web/src/core/solver/runTransientAsync.ts). "시뮬레이션 실행" 버튼만 비동기 워커 경로로 전환(THD/몬테카를로/체인은 합성 신호라 짧아서 동기 유지). 실행 중 버튼 비활성화. `npm run build`로 워커가 별도 청크로 정상 번들링되는 것 확인, 실제 WAV 업로드 후 브라우저에서 종단간 동작 확인.
8. **LPB-1 스타일 부스트 프리셋 추가** — [lpb1-style-boost.ts](../apps/web/src/core/library/presets/archive/lpb1-style-boost.ts). 단일 NPN 공통-이미터, 언바이패스 이미터 저항(390Ω)으로 게인을 Rc/Re(~26x)에 고정. AC 해석으로 1kHz 게인 26dB(≈20x, 출처의 "~25x" 근사와 부합) 확인.
   - **Fuzz Face류는 신규 작업 없이 스킵** — 기존 [fuzz-germanium.ts](../apps/web/src/core/library/presets/fuzz-germanium.ts)를 다시 읽어보니 이미 "2-트랜지스터 직결 피드백 바이어스" 토폴로지, 즉 Fuzz Face 회로 그 자체였음(§4 옛 항목이 이 사실을 놓치고 있었음 — 문서 오류로 판단하고 정정).
   - **Tonebender MkIII류, JHS Superbolt/ROG Supreaux류는 미착수로 남음** — 3-트랜지스터 이상 회로는 정확한 부품값 검증에 시간이 더 필요해 이번 루프에서 보류. 아래 §4에 남겨둠.

### 2026-08-29 — 프리셋 탐색기 트리화 + 소자 모델 라이브러리 확장

사용자 요청: 프리셋을 카테고리별 접고/펴는 탐색기로, 자주 쓰는 소자(특히 op-amp/diode)도 실제 SPICE 값 조사해서 프리셋으로 미리 정리. 169개 테스트 전부 통과, 타입체크·프로덕션 빌드·브라우저 실동작 확인.

1. **프리셋 카테고리 트리 탐색기** — 어제(§3 위 항목 4)의 전체/기본/아카이브 탭 방식을 대체. [types.ts](../apps/web/src/core/library/types.ts)에 `PresetCategory`(버퍼/부스트/오버드라이브/디스토션/퍼즈/톤·EQ) 타입 추가, 프리셋 19개 전부에 `category` 필드 부여(각 프리셋 `name`에 이미 있던 장르 단어 기준으로 일관되게 분류). 카테고리별 접기/펼치기(기본 전체 펼침, 클릭으로 토글) + 검색(검색 중엔 접힌 카테고리도 매치 항목 강제로 보여줌) + 아카이브 배지. (이 트리 컴포넌트는 바로 아래 2026-08-29 후속 항목에서 `LibraryExplorer.tsx`로 다시 한번 바뀜 — 최신 구조는 그쪽 참고.)
2. **Op-amp/다이오드 소자 모델 라이브러리 확장** — [deviceModels.ts](../apps/web/src/core/library/deviceModels.ts). 전부 데이터시트/공개 SPICE 모델에서 실측:
   - **Op-amp 7종 + 이상적** (`OPAMP_MODELS`): JRC4558(기존), **TL072/TL071**(GBWP 3MHz, 슬루 13V/us, TI 데이터시트), **LM741**(GBWP 1MHz, 슬루 0.5V/us), **LM308**(RAT의 그 칩 — GBWP 1MHz인데 슬루레이트가 0.3V/us로 유난히 느린 게 RAT 특유의 눌린 클리핑 엣지의 원인이라는 게 잘 알려진 모드 주제), **CA3130**(Big Muff Pi 일부 버전 — BiMOS라 15MHz/30V/us로 훨씬 빠르고 CMOS 출력이라 레일 스윙도 더 넓게(±4.3V) 잡음), **NE5532**(저노이즈 오디오용, GBWP 10MHz), **OP07**(정밀, GBWP 0.6MHz로 LM308급으로 느림). [InspectorPanel.tsx](../apps/web/src/editor/InspectorPanel.tsx)에 다이오드처럼 op-amp 모델 드롭다운 추가 — 기존 `openLoopGain`은 보존하고 GBWP/슬루/레일만 덮어씀. 브라우저에서 LM308 선택 시 실제 파라미터 반영 확인함.
   - **다이오드 3종 추가** (`DIODE_MODELS`, 기존 1N4148/1N34A/레드 LED에 추가): **그린 LED**·**블루/화이트 LED**(codeinsecurity.wordpress.com이 데이터시트 I-V 커브를 피팅해 공개한 실측 Is/N 값, LED는 N>2가 정상이라는 점도 출처에 명시돼 있음 — 이 앱의 thermalVoltage=0.02585 가정으로 역산해도 문헌상의 Vf와 order-of-magnitude로 맞아떨어짐 확인), **1N5817 쇼트키**(diodes.com 공식 SPICE 모델 IS=870uA/N=1.81/RS=81.3mΩ 그대로 사용 — 비대칭 클리핑 모드에서 실리콘/LED와 짝지어 쓰는 소자). 기존 레드 LED 값은 사용 중인 프리셋(asymmetric-clipper)의 톤이 바뀌지 않도록 그대로 유지.
3. **"자주 쓰는 소자 값" 퀵애드** — [QuickAddPalette.tsx](../apps/web/src/editor/QuickAddPalette.tsx), 소자 팔레트 탭 하단에 접이식으로 배치(기본 접힘). 페달 회로에 반복적으로 나오는 저항 9종(1k~1M)·커패시터 9종(100pF~47uF) 값과, 위에서 추가한 다이오드/op-amp 모델 전체를 원클릭으로 그 값이 세팅된 채 캔버스에 추가. `handleAddPart`에 `paramsOverride` 파라미터를 추가해 지원(기존 `PART_DEFS[type].defaultParams` 위에 덮어씀). 브라우저에서 22kΩ 칩 클릭 → 정확히 22kΩ 저항이 추가되는 것 확인.

### 2026-08-29 후속 — 팔레트 서브메뉴 + 템플릿/블록 탭 통합

사용자 피드백: 다이오드/트랜지스터/JFET가 "고정" 값처럼 보임(팔레트에서 클릭하면 항상 같은 기본값), 템플릿 좌측 설명 텍스트가 공간을 너무 잡아먹음, 블록 탭과 템플릿 탭이 굳이 나뉠 이유가 없어 보임. 169개 테스트 통과, 타입체크·빌드·브라우저 실동작(새 탭, stale HMR 회피) 확인.

1. **BJT/JFET named 모델 추가** — [deviceModels.ts](../apps/web/src/core/library/deviceModels.ts)에 `TRANSISTOR_MODELS`(2N3904/2N5088/BC549/2N3906/AC128 — hFE는 데이터시트 실측치, Is/reverseBeta는 기존 generic-silicon/germanium 대표값 유지)와 `JFET_MODELS`(J201/2N5457/MPF102 — idss·pinchOffVoltage는 공개 특성화 데이터 평균치) 추가.
2. **팔레트 소자 클릭 → 모델 서브메뉴** — [PartPalette.tsx](../apps/web/src/editor/PartPalette.tsx): 다이오드/BJT/JFET 버튼을 클릭하면 이제 바로 추가되지 않고 "기본값" + named 모델 목록이 펼쳐지는 서브메뉴가 뜸(다른 소자는 기존처럼 원클릭 추가 그대로). 브라우저에서 1N34A 선택 → 정확한 저마늄 다이오드 파라미터로 추가되는 것 확인.
3. **인스펙터 모델 드롭다운 일반화** — 다이오드/op-amp에만 있던 "소자 모델" 드롭다운을 BJT/JFET까지 확장. `onApplyDiodeModel`/`onApplyOpampModel` 두 개였던 핸들러를 `onApplyModel(paramsOverride)` 하나로 합침 — 어떤 모델 맵을 볼지는 `InspectorPanel.tsx`가 `MODEL_MENUS[selectedPart.type]`로 알아서 고름.
4. **템플릿 탭 + 블록 탭 → "템플릿/블록" 탭 하나로 통합** — [LibraryExplorer.tsx](../apps/web/src/editor/LibraryExplorer.tsx) 신규(어제 만든 `TemplateExplorer.tsx`와 `BlockPalette.tsx`를 대체, 둘 다 삭제). 최상위를 "페달 프리셋(완성된 회로)" / "기능 블록(빈 기본 단위)" 두 그룹으로 나누고, 기존 장르별 서브카테고리는 그 아래 그대로 유지 — 프리셋 쪽은 기본 펼침, 블록 쪽은 기본 접힘(덜 쓰는 쪽).
5. **항목 설명을 별도 미리보기 박스로 이동** — 지금까지는 모든 프리셋/블록 카드에 설명 텍스트가 항상 붙어 있어서 좁은 사이드바 폭을 다 잡아먹었음. 이제 목록은 이름 한 줄(+아카이브 배지)만 보이고, 클릭하면(기존처럼 그 즉시 캔버스에 로드/추가되는 것도 그대로) 목록 위 박스에 그 항목의 설명이 표시됨.

### 2026-08-30 — 상용화/초보자 관점 전수 점검 (ask-matt)

사용자 요청: 컨셉/목표 재확인, 전체 프로젝트 점검, 초보~고수 사용자 지원 여부, 상용화 준비. 점검 결과 82개 파일이 미커밋 상태(테스트 170개는 이미 통과)였던 게 가장 시급한 문제로 드러나 의미 단위 9개 커밋으로 우선 정리. 이후 사용자가 고른 3개 트랙 진행, 173개 테스트 전부 통과·타입체크 클린·브라우저 실동작 확인.

1. **상용화 기초 인프라** — [LICENSE](../LICENSE)(상용 배포 전제로 "All rights reserved" 기본값 — 오픈소스 전환 시 교체 필요), 루트/apps/web [README.md](../README.md) 정비(Vite 기본 템플릿 상태였음), [vercel.json](../vercel.json) 최소 배포 설정, index.html 메타 description 추가.
2. **초보자 온보딩** — 빈 캔버스 안내문을 3단계 시작 가이드로 확장, [BottomDock.tsx](../apps/web/src/editor/BottomDock.tsx) 분석 탭 7개 전부에 "이게 뭔지 모르는 사용자" 기준 툴팁(THD/부품 공차/BOM/PCB 등 용어를 쉬운 말로 설명) 추가.
3. **시뮬레이션 정확도 — 리스크 2(오버샘플링) 해결** — 상세는 아래 §6 리스크 2 참고.

**아직 남은 상용화 격차** (이번 루프 범위 밖, 우선순위는 사용자 결정 필요):
- i18n 인프라 없음 — UI 텍스트 전부 한국어 하드코딩, 해외 사용자 타겟이면 구조 변경 필요.
- 인증/과금/약관·개인정보처리방침/에러 트래킹·애널리틱스 전부 없음.
- 타겟 시장(국내/해외)·가격 모델(무료/유료/구독)·실제 배포처가 아직 미정 — 이건 코드 문제가 아니라 사업 방향 결정이 먼저 필요.

### 2026-09-05 — 상용화 상세 조사 + 즉시 가능한 기술 항목 처리

전체 코드베이스를 감사해 위 상용화 격차를 구체화(배포/인프라, 에러처리, 보안, 법적 문서, 접근성/i18n, 테스트, 성능, 브라우저 호환성, PWA 9개 항목). 사업 결정이 필요 없는 즉시 처리 가능 항목 3개 바로 적용, 173개 테스트·타입체크·프로덕션 빌드·브라우저 실동작 확인.

1. **React Error Boundary 추가** — [ErrorBoundary.tsx](../apps/web/src/ErrorBoundary.tsx) 신규, [main.tsx](../apps/web/src/main.tsx)에서 `<App />`을 감쌈. 기존엔 런타임 에러 시 화이트스크린이었음.
2. **CSP 등 보안 헤더 추가** — [vercel.json](../vercel.json)에 `Content-Security-Policy`(외부 API/스크립트 없는 순수 클라이언트 앱 특성 반영해 `default-src 'self'` 기반), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` 추가.
3. **상표 표기 수정** — [deviceModels.ts](../apps/web/src/core/library/deviceModels.ts) op-amp 모델 라벨에서 "RAT"/"Big Muff"/"TS9/OD-1" 상표명 노출을 프로젝트 기존 관례("~스타일")로 통일.

**감사에서 확인된 양호 항목** (조치 불필요): npm audit 취약점 0건, `dangerouslySetInnerHTML` 미사용, 외부 API 호출 전무(순수 클라이언트 앱), localStorage에 민감정보 없음.

**남은 항목**(사업 결정 또는 더 큰 작업 필요, 위 "아직 남은 상용화 격차"와 중복 없이 추가):
- TypeScript strict 모드 미설정(`strictNullChecks` 등 없음).
- 커버리지 측정 도구 없음, E2E 테스트 부재(기존에도 알려진 문제).
- 접근성 속성(`aria-label` 등) 6개 파일 10건뿐 — 컴포넌트 수 대비 부족.
- CI/CD 파이프라인 없음(`.github/workflows` 없음), `.env` 환경변수 관리 체계 없음.
- PWA(manifest/service worker) 미구현 — 오프라인 계산형 앱 특성상 전환 난이도는 낮음.

### 2026-09-05 후속 — 기능/라이브러리 완성도 + UX A-Z 점검 및 수정

`core/components`·`core/analysis`·프리셋·블록·BOM/PCB·의존성 전수 확인(배경 에이전트) + 브라우저 실사용 흐름(온보딩 → 프리셋 로드 → 배선 → 인스펙터 → BOM/PCB) 직접 점검. 173개 테스트·타입체크·빌드·브라우저 실동작(휠 줌 `defaultPrevented` 확인 포함) 통과.

**감사 결론(수정 불필요, 기록용)**: 소자/분석/프리셋 라이브러리는 로드맵에 명시된 스코프(오버드라이브/디스토션/부스트) 안에서 충분히 두터움 — MOSFET 부재·모듈레이션 이펙트 부재는 의도된 스코프 제한. react/react-dom 단 2개 의존성은 이 규모 앱에는 장점.

**실사용 중 발견해 바로 수정한 항목**:
1. **캔버스 휠 줌 버그** — React의 `onWheel`은 wheel 리스너를 passive로 등록해 `e.preventDefault()`가 조용히 무시되고 있었음(콘솔에 "Unable to preventDefault inside passive event listener" 반복). [SchematicCanvas.tsx](../apps/web/src/editor/SchematicCanvas.tsx)에서 `useEffect`로 `{ passive: false }` 네이티브 리스너를 직접 붙이는 방식으로 교체. 수정 후 `dispatchEvent`로 `defaultPrevented: true` 확인.
2. **인스펙터 파라미터가 전부 영어 원본 키로 표시** — [paramMeta.ts](../apps/web/src/editor/paramMeta.ts)에 단위만 있고 표시명이 없어 "voltage", "gbwpHz", "saturationCurrent" 등이 그대로 노출되던 문제. `ParamMeta`에 `label` 필드 추가해 18개 키 전부 한글 라벨 부여, [InspectorPanel.tsx](../apps/web/src/editor/InspectorPanel.tsx)가 이를 사용하도록 수정.
3. **전류 소모 추정치 추가** — [powerDraw.ts](../apps/web/src/editor/powerDraw.ts) 신규: DC 동작점을 풀어 오디오 입력이 아닌 전원(Vcc/Vdd) 소스의 MNA 분기 전류를 읽어 mA 단위로 추정. [BomPanel.tsx](../apps/web/src/editor/BomPanel.tsx)에 노출(예: LPB-1 프리셋에서 "Vcc (9V) 0.3mA"). 이상적 op-amp 회로는 전원 소자 자체가 넷리스트에 없어 표시되지 않음 — 정확도보다 "회로에 실제 전원 소스가 있을 때만 보여준다"는 원칙으로 과설계 방지.
4. **분석 탭 버튼의 접근성 이름이 시각 라벨과 다름** — `title` 속성(긴 툴팁 문장)이 스크린리더 접근성 이름으로 읽히던 문제. [BottomDock.tsx](../apps/web/src/editor/BottomDock.tsx)에 `aria-label`(짧은 이름 고정)과 `aria-describedby`(긴 설명은 시각적으로 숨긴 별도 요소로 분리) 추가, `.visually-hidden` 유틸리티 클래스 신규.
5. **모바일/터치 사용자 안내 부재** — 핵심 조작(휠 줌·드래그 이동·단자 2회 클릭 배선)이 마우스 전용인데 안내가 없던 문제. [App.tsx](../apps/web/src/App.tsx)/[App.css](../apps/web/src/App.css)에 `@media (pointer: coarse), (max-width: 700px)`에서만 노출되는 안내 배너 추가.

### 2026-09-06 — 도메인 확장 탐색 (ask-matt) · 계획 문서 2종 신설

사용자 요청: 전체 탐색 후 UI/UX·기능 개선점, 공개 회로 추가 후보, 그리고 **페달 밖의 영역**(픽업 배선,
온보드 배선, 스위치/스플릿/직병렬, 온보드 EQ, 톤노브·픽업별 시뮬레이션)을 계획 문서로 정리.
코드 전수 확인 + 브라우저 실사용(TS9 프리셋 로드 → 렌더링 → 사이드바 조작) 근거. **이번 루프는 조사·계획까지만, 코드 변경 없음.**

신설 문서 2종:

- **[plan-guitar-wiring.md](./plan-guitar-wiring.md)** — 기타 배선/픽업 도메인 전체 계획(위 Phase 9~13).
  핵심 결론: 신규 프리미티브는 `switch`·`pickup` **2개뿐**이고 둘 다 포텐셔미터와 같은
  "캔버스 1부품 → 넷리스트에서 기본 소자로 전개" 패턴이라 **솔버·MNA·Newton은 안 바뀐다.**
- **[plan-ux-and-features.md](./plan-ux-and-features.md)** — UI/UX·기능 백로그 + 페달 아카이브 추가 후보.
  이 문서 §6에 이미 있는 항목은 중복 기재하지 않고 신규 발견만 담음.

이번 탐색에서 새로 드러난 것 중 특히 중요한 3가지:

1. **와이어를 지울 수 없다** — `selectedWire`/`onDeleteWire` 류가 코드베이스에 하나도 없음.
   배선을 잘못 그으면 Ctrl+Z 외에 복구 수단이 없다. 배선이 핵심 조작인 앱에서 실질적 기능 공백.
2. **프리셋 파라미터가 UI에 노출되지 않는다** — `handleLoadTemplate`이 `defaultParams`로만 빌드하므로
   King of Tone의 `clipMode`, OCD의 `brightSwitch` 분기를 **사용자가 쓸 방법이 없다**(전용 회귀 테스트까지
   있는데도). 아카이브를 더 늘리기 전에 이걸 먼저 풀어야 한다.
3. **`chain.ts`는 로딩 효과를 무시한다** — 스테이지 출력을 다음 스테이지의 이상적 입력원으로 넘기므로
   패시브 픽업 → 첫 페달 구간(퍼즈페이스가 기타 볼륨에 반응하는 그 상호작용)에는 부정확하다.
   기타 배선은 체인이 아니라 **같은 캔버스에서 하나의 넷리스트로 병합**해 풀어야 한다
   (plan-guitar-wiring.md §8). `netlistFromGraph`의 union-find가 이미 그 일을 하므로 추가 작업은 UI 쪽뿐.

## 4. 해야 할 것 (다음 단계 후보, 우선순위 대략순)

0. **[plan-ux-and-features.md](./plan-ux-and-features.md) §5의 A그룹** — 와이어 삭제, 프리셋 파라미터 UI,
   캔버스 화면 맞춤(fit). 셋 다 작고, 앞의 둘은 "이미 있는 걸 못 쓰는 상태"를 푸는 것이라 효과가 가장 크다.
0-1. **`role` 플래그 리팩토링** — Phase 9의 착수점이자, 오래 보류돼 온 트랜지스터 게인 블록·파워서플라이
   블록(아래 2번)의 선행 조건이기도 하다. 하나 고쳐서 셋이 풀린다.
1. **남은 아카이브 프리셋 후보** (2026-08-28 기준 갱신, 신규 후보는 plan-ux-and-features.md §4):
   - Tonebender MkIII류 (3-트랜지스터 퍼즈) — 미착수, 부품값 검증 필요
   - JHS Superbolt / ROG Supreaux류 — 미착수, 부품값 검증 필요
   - ~~Fuzz Face류~~ — 기존 `fuzz-germanium` 프리셋이 이미 이 토폴로지였음, 별도 작업 불필요로 정정
   - ~~LPB1류~~ — 2026-08-28 완료 (`lpb1-style-boost`)
2. **블록 시스템 v2** 후보 (2026-08-28 §5에서 이번 루프 범위 밖으로 확정, 사용자가 명시 요청 시 재검토):
   - 블록 간 "자동 직렬 연결" 옵션
   - 트랜지스터 기반 게인 블록 (role 플래그 리팩토링 선행 필요)
   - 파워서플라이 블록
   - 사용자 커스텀 블록 저장 기능
3. **PCB 레이아웃 확장 여부** — 지금은 넷리스트 export까지만(§5 결정). 자동 배치/오토라우터를 원하면 그건 사실상 새 프로젝트 규모라 다시 논의 필요.
4. **시뮬레이션 코어 감사 잔여 리스크** — 리스크 3(trapezoidal), 4(Newton 웜스타트)는 아래 §6에 그대로 남아 있음(리스크 2는 2026-08-30 해결). 실측 THD와 비교하는 검증 작업은 여전히 안 함.
5. **UI/UX 감사 잔여 리스크** — 배치/라우팅 리스크 3(미드포인트 배선 뭉침), 4(부품 회전 미활용)는 아래 §6에 그대로 남아 있음.
6. **E2E 테스트 부재** — 여전히 미해결.
7. **상용화 격차** — i18n, 인증/과금, 약관/개인정보처리방침, 에러 트래킹/애널리틱스. 사업 방향(타겟 시장·가격 모델) 결정이 선행돼야 함 — 위 2026-08-30 항목 참고.

## 5. 설계 결정 (2026-08-28 확정)

- **PCB 레이아웃의 범위 → 부품 목록 + 넷리스트를 KiCad 호환 포맷으로 export만.** 배치/라우팅은 사용자가 KiCad에서 직접. 완전 자동 오토라우터는 별도 대형 프로젝트라 범위 밖.
- **GND 왕복 배선(§6 UI/UX 감사 리스크 1) → 근본적으로 재설계.** 접지 부품을 캔버스당 1개로 제한하지 않고, 노드마다 로컬 그라운드 심볼을 여러 개 배치할 수 있도록 `graphFromNetlist.ts` 배치 로직과 `circuitStorage.ts` 저장 포맷을 함께 변경. 아래 schemaVersion 도입과 같이 진행.
- **트랜지스터 게인 블록 / role 플래그 리팩토링 → 이번 루프에서는 스킵.** 블록 시스템 v2 전체를 이번 범위에서 제외. 사용자가 명시적으로 "BJT/JFET 게인 스테이지"를 다시 요청하면 그때 role 플래그 리팩토링부터 시작.
- **circuitStorage 스키마 버전 관리 → 지금 도입.** `schemaVersion` 필드를 저장 포맷에 추가해, GND 재설계처럼 앞으로 필드가 바뀔 때마다 애드혹 하위호환 처리 대신 버전 분기로 처리.
- **블록 자동 연결 UX / 프리셋·블록 검색 UI**: 아직 미정 — 블록 v2가 이번 범위 밖이라 자동 연결 UX도 자연히 뒤로 밀림. 검색 UI는 §4-2(템플릿 탭 UX 개선) 작업 시 다시 논의.
- **E2E 테스트 부재**: 여전히 미해결. 이번 루프 범위에는 포함하지 않음 — 캔버스 인터랙션이 더 늘어난 뒤(예: GND 재설계 완료 후) 재검토.

## 5-1. 실행 순서 (2026-08-28 루프) — ✅ 전부 완료

위 결정에 따라 확정한 작업 순서. 8개 항목 전부 완료(8번 순서는 실제로는 2번 작업 중 조기 처리):

1. ✅ `circuitStorage` schemaVersion 도입
2. ✅ GND 로컬 심볼 재설계 (§6 UI/UX 감사 리스크 1 — 해결됨)
3. ✅ 아카이브 프리셋 — LPB1 스타일 추가(Fuzz Face는 기존 프리셋이 이미 커버, Tonebender/Superbolt류는 §4로 이월)
4. ✅ 템플릿 탭 UX 개선 (§4-2)
5. ✅ BOM 자동 생성
6. ✅ PCB 레이아웃 — KiCad export
7. ✅ 시뮬레이션 성능 — Web Worker 분리
8. ✅ Newton 미수렴 플래그 (시뮬레이션 코어 감사 리스크 1 — 해결됨)

## 6. 알려진 기술 부채 / 리스크

- `SchematicEditor.tsx`가 395줄로 400줄 룰에 근접 — 다음에 손댈 때 추가 분리 필요할 가능성 높음.
- 트랜지스터 게인 블록 부재는 기능 공백이 아니라 **의도적 회피**(2026-08-28 §5에서 블록 v2 자체를 이번 범위 밖으로 확정). 사용자가 "BJT/JFET 게인 스테이지"를 명시적으로 다시 요청하면 role 플래그 리팩토링부터 먼저 해야 함.
- ~~대용량 오디오 파일 시뮬레이션이 메인 스레드 동기 실행~~ — 2026-08-28 Web Worker 분리로 해결. 아래 시뮬레이션 코어 감사 리스크 5 참고.

### 시뮬레이션 코어 감사 (2026-08-28)

솔버/컴포넌트 모델 전체(`core/solver/*`, `core/components/*`, `core/analysis/*`)를 "기타 페달 오디오 시뮬레이션 정확도"라는 목적에 맞는지 기준으로 전수 검토. 결론: 전반적으로 목적에 잘 맞게 설계돼 있으나(특히 op-amp 매크로모델이 GBWP/슬루레이트/소프트 새추레이션을 제대로 반영하는 점은 이례적으로 잘 됨), THD 정확도라는 핵심 가치를 갉아먹는 리스크가 두 건 있음.

**리스크 1 — [HIGH, 해결됨 2026-08-28] Newton-Raphson 미수렴이 조용히 무시됨**
- 위치: [newton.ts](../apps/web/src/core/solver/newton.ts) — `maxIterations`(50) 초과 시 수렴 여부 체크나 플래그 없이 마지막 추정값을 그대로 반환하던 문제.
- 실패 시나리오: `transient.ts`가 오디오 샘플마다 한 번씩 이 solver를 호출하므로, 피드백이 강한 유저 회로(예: 퍼즈류의 강한 포지티브 피드백, 다이오드 두 개가 루프를 이루는 토폴로지)에서 특정 샘플이 크래시도 NaN도 아닌 **"조용히 틀린 값"**으로 새어나갈 수 있었음.
- 해결: `solveNewton`이 `{ solution, converged }`를 반환하도록 변경, `runTransient`가 미수렴 샘플 수를 집계해 `TransientResult.nonConvergentSampleCount`로 노출. UI가 시뮬레이션 완료 상태 메시지에 경고를 표시.

**리스크 2 — [HIGH, 해결됨 2026-08-30] 오버샘플링 없는 고정 타임스텝**
- 위치: [transient.ts](../apps/web/src/core/solver/transient.ts) — `dt = 1/sampleRate` 고정, 2x/4x 오버샘플링 없음.
- 실패 시나리오: 게르마늄 다이오드(`veff` ~0.031V, `deviceModels.ts`)처럼 클리핑 knee가 마이크로초 단위로 꺾이는 소자는 44.1kHz 한 샘플 폭 안에서 전이가 끝남 → 샤프한 knee가 앨리어싱되어 THD 측정치가 실물보다 부정확해짐. 실리콘/LED 하드 클리퍼 계열(RAT, Boss 스타일 등 이미 구현된 프리셋 다수)일수록 영향이 큼.
- 해결: `TransientOptions.oversample`(기본 1=기존과 동일) 추가 — dt를 줄이고 입력 샘플을 선형 보간해 서브스텝을 먹인 뒤 박스카 평균으로 원래 샘플레이트로 되돌림. "시뮬레이션 실행"(사용자 오디오 업로드) 경로에 `oversample: 4` 적용, THD/부품 공차/체인은 합성 신호라 짧아서 기본값 유지. 기존 170개 테스트는 수치까지 완전히 동일(oversample=1일 때 로직이 기존과 수학적으로 동치임을 확인), 신규 오버샘플링 전용 테스트 3개 추가.
- 남은 일: 실측 THD와 비교하는 검증은 여전히 안 함 — 이 리스크는 "존재하는 메커니즘을 고쳤다"는 뜻이지 "수치를 검증했다"는 뜻은 아님.

**리스크 3 — [MEDIUM] Trapezoidal이 아닌 Backward Euler만 사용**
- 위치: [capacitor.ts](../apps/web/src/core/components/capacitor.ts), [inductor.ts](../apps/web/src/core/components/inductor.ts).
- 영향: 임의의 유저 토폴로지에도 무조건 안정적이라는 장점은 있으나, 나이퀴스트 근처 주파수에서 실제보다 응답이 둔하게(더 따뜻하게) 나옴. `ac.ts`의 주파수 응답 분석과 트랜지언트 시뮬레이션 결과가 같은 회로에서도 미묘하게 어긋날 수 있음. SPICE 기본값(trapezoidal)과 다른 선택이라는 점이 코드 어디에도 문서화돼 있지 않음.

**리스크 4 — [MEDIUM] 샘플 간 Newton 웜스타트 없음**
- 위치: `newton.ts` — `solveNewton`이 매 샘플 0V 추정값에서 새로 시작, 이전 샘플의 해를 넘겨받지 않음.
- 영향: 서서히 변하는 실제 동작점 근처에서 시작하면 될 것을 매번 새로 수렴시키느라 반복 횟수를 낭비 → 리스크 1(50회 상한)을 더 자주 건드리게 만드는 간접 요인.

**리스크 5 — [LOW, 해결됨 2026-08-28] 메인 스레드 블로킹**
- `runTransient`(오디오 신호 시뮬레이션의 핵심 경로)을 [transientWorker.ts](../apps/web/src/core/solver/transientWorker.ts)로 옮기고 [runTransientAsync.ts](../apps/web/src/core/solver/runTransientAsync.ts)로 감싸 "시뮬레이션 실행" 버튼이 Web Worker에서 동작하도록 전환. THD/몬테카를로/체인은 합성 신호라 짧아서 동기 경로 유지(과설계 방지).

**감사 결과 손댈 필요 없다고 판단한 부분** (과설계 방지용으로 기록):
- JFET는 포화영역만 모델링 — 버퍼/부스트 용도로 충분, triode 영역 모델링은 불필요.
- Gaussian elimination(희소행렬 미사용) — 회로 규모(수십 노드)에서는 O(n³)이 문제되지 않음, sparse solver는 과설계.
- AC 분석이 비선형 소자를 DC 바이어스에 고정 — Bode-plot 용도로는 적절한 스코프.
- Monte Carlo가 R/L/C만 변동시키고 반도체 SPICE 파라미터는 고정 — 소자 간 편차까지 다루는 건 별도의 더 큰 문제, 지금 풀 필요 없음.

### UI/UX 감사 — 회로도 표현 (2026-08-28)

`SchematicCanvas.tsx`/`symbols.tsx`/`geometry.ts`/`graphFromNetlist.ts`를 KiCad eeschema, EasyEDA, Falstad CircuitJS 같은 웹/데스크톱 레퍼런스와 비교 검토. 부품 심볼 자체(저항 지그재그, 다이오드 삼각형, op-amp 삼각형+±)는 미국식 표준 표기를 정확히 따르고 있어 문제없음. 아래 두 가지를 바로 고쳤고, 배치/라우팅 쪽은 더 큰 리스크가 남아 있음.

**즉시 적용한 개선**
- **스냅 그리드 시각화 부재** — `geometry.ts`의 `GRID_SIZE=10` 스냅 로직은 있었지만 캔버스에 점으로 그려주지 않아 사용자가 배치 규칙을 감으로만 알 수 있었음. [SchematicCanvas.tsx](../apps/web/src/editor/SchematicCanvas.tsx)에 팬/줌 추종 dot grid 추가로 해결 (레퍼런스 3개 툴 전부 기본 제공하는 기능).
- **부품 값이 캔버스에 안 보임** — id 라벨("R1")만 있고 실제 저항값/커패시턴스는 인스펙터를 열어야만 보였음. [valueLabel.ts](../apps/web/src/editor/valueLabel.ts)에 SI 접두사 포맷터를 추가해 심볼 아래에 값 라벨("4.7kΩ" 등)을 같이 표시하도록 수정.

**배치/라우팅 리스크 (실측 근거: multi-stage-drive 프리셋 로드 후 렌더된 SVG `path d` 값 직접 추출해서 확인)**

1. **[HIGH, 해결됨 2026-08-28] 접지(GND) 단일 인스턴스가 캔버스 맨 아래 한 곳에 고정 배치되어 왕복 우회 배선을 만들던 문제.**
   - 위치: [graphFromNetlist.ts](../apps/web/src/editor/graphFromNetlist.ts) — 접지 노드에 물리는 모든 단자가 부품 배치 영역(대략 y=40~200) 훨씬 아래(`ORIGIN_Y + maxRows * ROW_SPACING`, 실측 y=700)에 있는 단 하나의 GND 심볼로 전부 몰려서 배선되던 문제.
   - 수정 전 실측: `M265,105 L265,392.5 L440,392.5 L440,680` 등 575px 이상 길이의 왕복 배선이 여러 줄.
   - 해결: 접지 노드에 물리는 단자마다 그 소유 부품 바로 아래(`+70px`)에 개별 로컬 그라운드 심볼(`GND1`, `GND2`, ...)을 생성하도록 변경. `netlistFromGraph.ts`가 이미 "ground" 타입 부품을 개수와 무관하게 전부 하나의 넷으로 union하고 있어서 저장 포맷(`circuitStorage.ts`) 변경은 필요 없었음(당초 예상과 달리 순수 배치 로직 문제였음). 수정 후 같은 프리셋 재측정: 최대 배선 길이 270px로 감소, 왕복 배선 완전히 사라짐.
2. **[MEDIUM, 수정 완료] 같은 지점에 홉(교차 bump)이 중복으로 그려지던 버그.**
   - 위치: [geometry.ts](../apps/web/src/editor/geometry.ts) `computeWirePaths` — 서로 다른 두 와이어가 같은 세로 구간을 정확히 같은 y에서 교차하면(대칭 클리핑 다이오드 페어처럼 좌우 대칭 구조에서 흔함) 홉 좌표가 배열에 두 번 push되어, 같은 자리에 곡선이 두 번 겹쳐 그려짐.
   - 실측(수정 전): `...L330,166 Q324,160 330,154 L330,166 Q324,160 330,154 L330,120...` — 똑같은 구간이 반복돼 매듭처럼 보임.
   - 수정: 같은 세그먼트 키에 동일 좌표가 이미 있으면 push하지 않도록 중복 제거. 수정 후 실제 브라우저에서 재확인함, 컴포넌트 테스트 68개 통과.
3. **[MEDIUM, 미해결] 2-bend 미드포인트 휴리스틱이 여러 와이어에 같은 중간 좌표를 배정.**
   - 위치: `geometry.ts` `orthogonalPoints` — 두 점의 중간 x(또는 y)를 기계적으로 꺾는 지점으로 쓰기 때문에, 인접한 여러 넷이 거의 같은 좌표를 지나가면서 다닥다닥 뭉친 홉 다발이 생김. 실측: x≈210·270·510 부근에서 와이어 3~4개가 거의 같은 위치에서 반복적으로 교차/홉.
   - 장애물(부품 몸체) 회피가 전혀 없다는 점도 동일 원인 계열 — "obstacle-avoiding auto-router가 아니다"라고 코드 주석에도 명시돼 있음, 의도된 단순화이긴 하나 회로가 조밀해질수록 체감 악화.
4. **[LOW→MEDIUM으로 재평가, 부분 해결됨 2026-08-29] 부품 회전이 전혀 활용되지 않음.**
   - 위치: `graphFromNetlist.ts` — 모든 부품이 `rotation: 0`으로 고정 배치되던 문제. 당초 "체감 효과가 작아 우선순위 낮음"으로 판단했었는데, 사용자가 실제로 로드한 `다이오드 클리퍼 (대칭)` 프리셋 스크린샷에서 훨씬 심각한 사례가 나와 재평가함: 대칭 클리핑 다이오드 페어(D1: 신호→애노드, D2: 신호→캐소드)가 둘 다 기본 방향(애노드-왼쪽/캐소드-오른쪽)으로 배치되면, D2는 자기 캐소드(신호 쪽 단자)가 오른쪽을 향하게 되어 배선이 D1·D2 몸체를 통째로 감싸고 도는 상자 모양 루프를 만듦 — 리스크 1(GND)이나 리스크 3(미드포인트 뭉침)보다 시각적으로 훨씬 눈에 띄는 문제였음.
   - 실측(수정 전): `M410,100 L410,175 L470,175 L470,250` — D1의 애노드(왼쪽, x=410)에서 D2의 캐소드(오른쪽, x=470)까지 두 부품 몸체를 가로질러 크게 우회.
   - 해결: [graphFromNetlist.ts](../apps/web/src/editor/graphFromNetlist.ts)에 `orientTwoTerminal` 추가 — 2단자 소자(저항/커패시터/인덕터/다이오드)의 첫 번째 노드가 접지(`GROUND`)면 180도 회전시켜, 접지가 아닌 쪽 단자(허브로 이어져야 하는 쪽)가 항상 왼쪽을 향하도록 함. 접지 연결은 로컬 그라운드 심볼로 짧게 내려가므로 좌우 어느 쪽이든 비용이 같아 이 규칙에 부작용이 없음. `diode-clipper`·`asymmetric-clipper`·`rat-style-distortion`·`ocd-style-overdrive`·`king-of-tone-style-overdrive`·`big-muff-style-fuzz`의 대칭/비대칭 클리핑 다이오드 페어 전부에 적용됨. 수정 후 실측: D1·D2가 종이 회로도처럼 서로 마주보는 대칭 형태로 그려지고, 우회 배선 완전히 사라짐 — 170개 테스트(회전은 전기적 동등성에 영향 없음) 전부 통과, 브라우저 재확인함.
   - **부수적으로 발견해 같이 고친 버그**: 부품 회전 시 id/값 라벨 `<text>`가 부품 심볼과 같은 `<g>`에 있어서 부품과 함께 180도 뒤집혀(거꾸로) 그려지던 문제 — 지금까지는 `rotation:0`만 써서 드러난 적이 없었는데, 이번에 회전을 실제로 쓰게 되면서 발견됨. [SchematicCanvas.tsx](../apps/web/src/editor/SchematicCanvas.tsx)에서 회전을 심볼+단자만 감싸는 내부 `<g>`로 좁히고 라벨은 바깥의 회전 없는 `<g>`에 둬서 항상 똑바로 보이게 수정. 겸사겸사 라벨 뒤에 배경 사각형을 깔아, 값 라벨이 배선 위에 겹쳐도(사용자가 지적한 R1의 "10kΩ" 겹침 케이스) 읽을 수 있게 함.

**다음에 이 영역을 다시 열 때**: 리스크 1(GND)·4(회전)는 해결됐으니, 남은 건 리스크 3(미드포인트 배선 뭉침)부터. 회로가 커질수록 체감이 커지는 항목이라 프리셋이 더 늘어나면 우선순위가 올라갈 것.
