# 에디터 구현 히스토리 — UI/UX 재설계 · 오디오 도메인 기능 · 워크벤치 확장

> 원래 세 문서(`plan-professional-ui.md`, `plan-audio-domain-features.md`, `plan-workbench-extensions.md`)로 나뉘어 있던, 시간순으로 이어지는 하나의 이야기(전문 EDA 툴 수준 UI 재설계 → 오디오 도메인 특화 기능 → 워크벤치 확장 기능)를 하나로 통합한 문서. 전부 완료된 항목의 **구현 기록**이며, 지금 무엇을 할지는 [ROADMAP.md](./ROADMAP.md)를 보는 게 맞다.

---

# 1부. 전문 EDA 툴 수준 UI/UX 재설계

## 진행 상황 요약

- 1단계 완료: TS9 모티프(라임그린 accent `#a8c400` + 블랙 크롬 메뉴바/상태바 + 밝은 워크벤치 배경)로 `index.css`/`App.css` 전환.
- 2단계 완료: 프리셋/에디터 모드를 하나의 워크벤치로 통합. `editor/graphFromNetlist.ts`가 프리셋 넷리스트를 자동 배치된 부품+배선 그래프로 역변환하고, "템플릿" 탭에서 클릭 한 번으로 캔버스에 로드됨. 8개 프리셋 전부 왕복 변환 후 AC 응답이 원본과 정확히 일치하는지 회귀 테스트로 검증. 자동 배치는 격자 나열이라 보기 좋은 회로도는 아니지만, 로드 즉시 자유롭게 드래그로 재배치 가능.
- 3단계 일부 완료: `editor/symbols.tsx`에 저항 지그재그, 커패시터 평행판, 인덕터 코일, 다이오드 삼각형, 트랜지스터(NPN/PNP 화살표 방향 구분), op-amp 삼각형, 전압원, 접지, 포텐셔미터 기호 구현. `SchematicCanvas`가 박스 대신 이 기호들을 렌더링하고, `PartPalette` 버튼에도 같은 기호 미리보기 아이콘 적용. 포텐셔미터는 넷리스트 변환 시 저항 2개(a→wiper, wiper→b)로 자동 분해되도록 `netlistFromGraph`에 반영, 전압 분배 검증 테스트 통과.
- 3단계 마무리 + 4단계 완료: `editor/geometry.ts`에 회전(`R` 키 또는 버튼, 90도씩), 그리드 스냅(10px), 직교(Manhattan) 배선 라우팅, 3개 이상 배선이 만나는 지점의 접점 dot 구현. `Delete`/`Backspace` 키로 선택 소자 삭제도 추가. 회전/스냅 수학은 유닛 테스트로 검증 완료.
- **버그 수정**: 자동 배치가 선언 순서 그대로 격자에 나열해 배선이 부품을 관통하고, 부품이 많은 회로는 고정 캔버스 크기(900×460)를 넘어가 하단이 잘리는 문제가 실사용 중 발견됨. `graphFromNetlist.ts`를 입력 소스로부터의 BFS 신호흐름 거리 기반 좌우 배치로 재작성하고, 부품 배치 범위에 맞춰 캔버스 크기를 자동 확장 + 넘치면 스크롤하도록 수정. 상세는 2부 참고.
- 소자 인스펙터에 다이오드 모델 드롭다운(1N4148/1N34A/Red LED)과 포텐셔미터 A/B/C 테이퍼 커브 반영 — 상세는 2부 참고.
- 5단계 완료: `editor/paramMeta.ts`에 파라미터 키별 단위 라벨(Ω/F/H/V/Hz/V/us)과 최솟값(min) 테이블 추가. 속성 인스펙터가 각 필드 라벨 옆에 단위를 표시하고, 숫자 입력값을 파라미터별 최솟값으로 자동 클램핑(값이 최솟값 미만이면 입력 테두리도 빨간색으로 표시).
- **캔버스 줌/팬 완료**: `SchematicCanvas.tsx`에 마우스 휠 줌(커서 위치 중심, 0.3x~3x 클램프)과 빈 배경 드래그 팬을 추가. 줌 중심 계산은 `geometry.ts`의 `zoomAroundPoint` 순수 함수로 분리해 유닛 테스트 3개로 검증. 부품 드래그도 화면 좌표를 월드 좌표로 역변환하도록 수정해 줌 상태에서도 정확히 동작. `+`/`−`/`리셋` 버튼과 줌 배율(%) 표시를 캔버스 우상단에 오버레이로 추가.
- 포텐셔미터 taper 값도 다이오드 모델 드롭다운과 동일한 패턴의 전용 `<select>` UI로 교체 완료 (`editor/taper.ts`의 `TAPER_OPTIONS`).
- 비이상적 Op-Amp 매크로 모델(GBWP/슬루레이트/rail 클리핑) 완료 — 상세는 2부 참고.
- **UX 흐름 점검 및 개선 완료** (Nielsen 10대 사용성 휴리스틱 기준 리뷰): 아래 "UX 리뷰" 섹션 참고.

## UX 리뷰 (Nielsen 10대 휴리스틱 기준)

참고: [NN/g - 10 Usability Heuristics for User Interface Design](https://www.nngroup.com/articles/ten-usability-heuristics/), [Siemens - Navigating easy onboarding in EDA](https://blogs.sw.siemens.com/electronic-systems-design/2025/06/30/navigating-easy-onboarding-in-eda-what-engineers-need-to-know/).

실제 사용 흐름(빈 화면 진입 → 소자 배치/템플릿 로드 → 배선 → 시뮬레이션)을 위 휴리스틱에 대입해 검토, 4가지 문제를 발견하고 수정:

1. **시스템 상태 가시성 부족 (#1)**: 앱 최초 진입 시 안내가 전혀 없었음 → 빈 캔버스에 온보딩 힌트, 부품이 있으면 단축키 힌트로 전환.
2. **에러 인지/진단/복구 지원 부족 (#9)**: 주파수 응답 계산 실패(특이행렬) 시 조용히 빈 차트만 남음 → 상태를 4가지(`no-output`/`no-source`/`error`/`ok`)로 구분해 안내 문구 표시, 에러 시 실제 메시지까지 노출.
3. **패널이 조건부로 사라져 일관성이 없음 (#1, #4)**: `outputNode`가 없으면 주파수 응답 패널 자체가 사라졌음 → 항상 표시, 내부에서 상태별 안내 문구로 대체.
4. **사용자 제어와 자유 부족 (#3)**: "새 회로" 버튼 부재 → 추가(부품 없을 땐 비활성화).
5. **단축키가 발견 불가능 (#7)**: R/Delete 단축키가 안내 없었음 → 회로도 패널에 상시 힌트 텍스트로 노출.

## 배경

기능적으로는 동작하지만(솔버, AC 해석, 프리셋 8종, 간이 스키매틱 에디터) 다음 두 가지가 "장난감처럼" 보이게 만들었음:

1. 레이아웃/워크플로우가 일반 웹 폼에 가까움 — 프리셋 모드와 "직접 회로 구성" 모드가 완전히 분리된 별개 화면.
2. 소자가 사실적인 회로 기호가 아님 — 종류 무관하게 전부 둥근 사각형 박스+점(단자)으로만 그려짐.

목표 아키텍처(통합 워크벤치: 좌 독/중앙 캔버스/우 독/하단 결과 독), 소자 기호 사실화 대상표, 단계별 로드맵은 전부 위 진행 상황에 반영되어 완료됨. (원본 목업/설계 결정 로그는 git 히스토리 참고 — 이 문서는 완료 시점 기준 요약으로 갱신.)

---

# 2부. 오디오 도메인 특화 기능 (Non-ideal Op-Amp / Taper / IR / 프리셋 데이터 구조)

우선순위: 6번(프리셋 데이터 구조)·2번(포텐셔미터 테이퍼) 최우선, 이후 1번(Op-amp 매크로 모델).

## 1. 비이상적 Op-Amp 매크로 모델링 — 완료

- `solver/types.ts`: `OpAmpElement`에 옵셔널 필드 4개(`gbwpHz`, `slewRateVPerUs`, `railPositive`, `railNegative`) 추가. 전부 미설정이면 기존 이상적 nullor 동작 그대로(회귀 없음).
- **GBWP 저역통과 극**: `components/opamp.ts`의 `stampGbwpIntegrator` — 내부 노드에 VCCS+커패시터(Backward-Euler 컴패니언 모델)로 적분기 구현.
- **Rail-to-rail 클리핑**: Newton 루프 내부 비선형 스탬프(`stampClippedBuffer`/`stampClippedAmplifier`) — tanh 기반 부드러운 클램프 + 도함수로 컨덕턴스 선형화. **설계 시행착오**: GBWP 없이 레일만 설정된 경우 내부 pole 노드로 라우팅하려 했으나, 외부 피드백이 반전 입력단을 실제 출력 노드에 직접 연결하는 경우 nullor의 등식 제약이 로직을 우회해 특이행렬을 유발함을 발견 → `openLoopGain`(기존 미사용 필드)을 유한 이득으로 써서 입력 오차 신호를 직접 클리핑하는 브랜치로 재설계.
- **슬루레이트 제한**: `transient.ts`에서 이전 타임스텝 대비 dV/dt 상한을 소프트웨어적으로 클램핑. "히스토리 없으면 현재 미클램프 해로 초기화" 버그 발견 → 초기값 0V 고정으로 수정.
- AC 소신호 해석에도 동일한 GBWP 적분기 + 레일 클리핑(동작점 기울기 고정) 반영.
- 신규 프리셋 `ts9-overdrive`: JRC4558 근사치(GBWP=3MHz, slewRate=1.5V/us, rails=±4V).
- 검증: `tests/solver/opamp-nonideal.test.ts` 6개(GBWP 컷오프, 슬루레이트 램프, rail 클리핑 레벨 + 각각 회귀 없음 확인).

## 2. 포텐셔미터 테이퍼 — 완료

- `editor/taper.ts`: `applyTaper(taper, position)` — B(선형)=`x`, A(오디오)=`10^(log10(100)*x)/100`, C(리버스 오디오)=`1 - f_A(1-x)`.
- `netlistFromGraph.ts`: 포텐셔미터를 저항 2개로 분해할 때 `applyTaper`를 통과시킨 비율 사용.
- 드롭다운 UI: `TAPER_OPTIONS` 레이블 맵, 다이오드 모델 드롭다운과 동일한 패턴.

## 3. 다이오드 클리핑 소자 프리셋화 — 완료

- `deviceModels.ts`의 `DIODE_MODELS`: 1N4148(실리콘), 1N34A(저마늄), RED_LED.
- **RS(직렬저항) 모델링**: `DiodeElement.seriesResistance` 옵셔널 필드, op-amp 내부 pole 노드와 동일한 패턴으로 `${id}::rs` 내부 노드 추가. 미설정 시 완전히 동일 동작(회귀 없음). AC 해석도 동일 구조로 반영.

## 4. 캐비닛 IR 컨볼루션 — 완료

- **설계 변경**: 정적 WAV 자산 대신 **런타임에 직접 합성** (`audio/cabinetIr.ts`의 `generateCabinetIr`). 바이너리 자산 유지보수 불필요, 순수 함수라 유닛 테스트 가능, 샘플레이트 변경에도 항상 정확히 재생성.
- RBJ Audio EQ Cookbook 공식으로 peaking/high-shelf biquad 2~3개를 유닛 임펄스에 직렬 통과 + 지수 감쇠 엔벨로프(τ=6ms)로 ~20ms IR 생성. 2종: `brightCab4x12`, `darkCab2x12` — "제네릭 캐비닛 시뮬레이션"으로 명확히 라벨링.
- `playSamples`에 옵셔널 `cabinetVariant` — 설정 시 `ConvolverNode` 경유.

## 5. 실시간 톤스택 응답 뷰어 — 부분적으로 이미 동작함

- `acPoints`가 `useMemo`로 `parts`/`wires` 변경 시 즉시 재계산 — AC 해석이 가벼워 사실상 실시간. 슬라이더 UI(`paramMeta.ts`의 `slider: {max, step}`)로 `position` 파라미터를 `<input type="range">`로 렌더링.
- 회로 규모가 커지면 경량 디바운스 추가를 권장하나 아직 불필요.

## 6. 프리셋 데이터 구조 일원화 — 다른 방식으로 해결

스펙 제안(넷리스트+좌표+배선 좌표를 프리셋마다 수작업 JSON으로) 대신 **자동 레이아웃 알고리즘**으로 해결:

- `editor/graphFromNetlist.ts`: 넷리스트를 입력받아 입력 소스로부터의 BFS 신호 흐름 거리로 좌우 배치, 같은 거리 내에서는 barycenter heuristic(Sugiyama 스타일, 4회 반복 재정렬)으로 세로 배치 — 전기적으로 연결된 소자가 같은 행에 모이도록 해 배선 교차 감소.
- 배선은 넷리스트의 노드 공유 관계에서 100% 자동 도출.
- **절충안**: `PedalPreset.layout?: Record<elementId, {x,y}>` 옵셔널 필드 — 지정 좌표는 그대로, 나머지는 자동배치 폴백. 배선 교차가 심했던 프리셋(`multi-stage-drive`, `fuzz-germanium`, `klon-style-blend`)에 수작업 적용.
- **배선 교차 시각 구분**: `geometry.ts`의 `computeWirePaths` — 서로 다른 배선이 진짜로 교차하는 지점(단자 접합점과 구분)에서 수직 세그먼트 쪽에 작은 베지어 hop을 그려 "연결 안 됨"을 표시.
- **왜 이 방식**: JSON 스키마 방식은 프리셋이 늘어날수록 "회로 값"과 "도면 좌표" 두 개의 진실 소스를 동기화해야 하는 부담이 생김. 자동 레이아웃은 `PedalPreset.build()` 하나만 진실 소스로 유지.
- **여전히 남은 한계**: barycenter 휴리스틱도 완벽한 크로싱 최소화를 보장하지 않음(일반적으로 NP-hard).

---

# 3부. 워크벤치 확장 기능 (Undo/Redo · 저장 · THD · 체인 · 공차 분석 · JFET)

1~6번 항목(2부) 완료 후, 실제 사용 흐름에서 자연스럽게 필요해진 주변 기능들.

## 1. Undo/Redo — 완료

- `editor/historyStack.ts`: `{past, present, future}` 3-스택 순수 함수 히스토리 매니저. 이산적 액션은 `pushSnapshot`, 드래그 같은 연속 업데이트는 `replacePresent`(되돌리기 스텝 없음) → 드래그 종료 시 `commitPrevious`로 시작 시점 스냅샷 하나만 기록.
- 최대 50 스텝 제한. `Ctrl+Z`/`Ctrl+Shift+Z`(또는 `Ctrl+Y`) 단축키.

## 2. 회로 저장/불러오기 (localStorage) — 완료

- `editor/circuitStorage.ts`: `Storage` 인터페이스를 부분 타입으로 주입받는 구조라 브라우저 없이도 유닛 테스트 가능. `deserializeCircuit`은 손상된 데이터에 `null` 반환(방어적).

## 3. THD(전고조파왜곡) 측정 — 완료

- `audio/testTone.ts`(사인파 생성) → `core/analysis/fft.ts`(라디스-2 Cooley-Tukey, 외부 의존성 없음) → `core/analysis/thd.ts`(배음 크기로 THD% 계산) → `ThdPanel.tsx`(1kHz 테스트 톤).

## 4. 페달 체인 시뮬레이터 — 완료

- `core/analysis/chain.ts`: 여러 회로를 순서대로 이어 붙여 앞 단 출력을 다음 단 입력으로 흘리는 다단 트랜지언트 시뮬레이션. `ChainPanel.tsx`로 스테이지 추가/삭제/순서 변경.

## 5. 부품 공차 몬테카를로 분석 — 완료

- `core/analysis/montecarlo.ts`: 모든 R/L/C에 독립적으로 ±tolerance% 균등분포 난수 적용, AC 해석 N회(기본 20) 반복해 min/max 응답 밴드 산출.

## 6. JFET 소자 + 클린 부스트 프리셋 — 완료

- `core/components/jfet.ts`: Shichman-Hodges 제곱법칙 모델(포화 영역 전용). `core/library/presets/jfet-boost.ts`: 셀프 바이어스 공통-소스 증폭단.

## 7. 아카이브 프리셋 2종 추가 (Big Muff / Boss 스타일) — 완료

`plan-circuit-archive.md`의 우선순위 후보 4개 중 나머지 2개(RAT/Klon은 이전 세션 완료). 상세는 `plan-circuit-archive.md` 참고.

## 8. UI 구조 리팩터: 컴포넌트 분리 — 완료

`SchematicEditor.tsx` 비대화 방지를 위해 `InspectorPanel.tsx`, `AnalysisPanels.tsx`, `OutputAudioPanel.tsx`, `ChainPanel.tsx`, `MonteCarloPanel.tsx`, `ThdPanel.tsx`로 분리. (이후 2026-08-28 워크벤치 재개편에서 `AnalysisPanels.tsx`는 `useAnalysisPanels` 훅 + `BottomDock`/`FrequencyResponseTab`/`WaveformTab`으로 다시 쪼개짐 — [ROADMAP.md](./ROADMAP.md) §3 참고.)

## 요약

| 항목 | 상태 |
|---|---|
| Undo/Redo | ✅ |
| 회로 저장/불러오기 | ✅ |
| THD 측정 | ✅ |
| 페달 체인 시뮬레이터 | ✅ |
| 부품 공차 몬테카를로 분석 | ✅ |
| JFET 소자 + 프리셋 | ✅ |
| 아카이브 프리셋 2종 (Big Muff/Boss) | ✅ |
| UI 컴포넌트 분리 리팩터 | ✅ (이후 추가 리팩터됨) |
