# 오디오 도메인 특화 기능 계획 (Non-ideal Op-Amp / Taper / IR / 프리셋 데이터 구조)

## 배경

UI 재설계(1~4단계, [plan-professional-ui.md](./plan-professional-ui.md) 참고)와 별개로, 실제 이펙터 페달 설계 도구로서 갖춰야 할 오디오/음악 도메인 특화 기능 6가지가 제안됨. 이 문서는 각 항목을 검토하고, 이번 세션에서 실제로 반영한 내용과 남은 작업을 정리한다.

**우선순위 지시**: 6번(프리셋 데이터 구조)과 2번(포텐셔미터 테이퍼)을 최우선 반영, 완료 후 1번(Op-amp 매크로 모델)으로 진행.

---

## 1. 비이상적 Op-Amp 매크로 모델링 — **완료**

- `solver/types.ts`: `OpAmpElement`에 옵셔널 필드 4개 추가 (`gbwpHz`, `slewRateVPerUs`, `railPositive`, `railNegative`). 전부 미설정이면 기존 이상적 nullor 동작 그대로 (회귀 없음, 42개 기존 테스트 전부 그대로 통과).
- **GBWP 저역통과 극**: `components/opamp.ts`의 `stampGbwpIntegrator` — 내부 노드(`${id}::pole`)에 VCCS(트랜스컨덕턴스 `2*pi*gbwpHz*Cpole`) + 커패시터(`Cpole=1nF`, Backward-Euler 컴패니언 모델) 조합으로 `dV(pole)/dt = 2*pi*gbwpHz*(V+ - V-)` 적분기를 구현. 순수 선형(신규 비선형 로직 불필요, 계획대로). `pole → out`은 항등 브랜치(레일 없을 때) 또는 클리핑 브랜치(아래).
- **Rail-to-rail 클리핑**: 계획대로 Newton 루프 내부 비선형 스탬프로 구현(`stampClippedBuffer`/`stampClippedAmplifier`) — tanh 기반 부드러운 클램프 + 도함수로 컨덕턴스 선형화(다이오드와 동일한 원리). **설계 시행착오**: 처음에는 GBWP 없이 레일만 설정된 경우도 "내부 pole 노드 + 별도 nullor 브랜치"로 라우팅하려 했으나, 외부 피드백 네트워크가 반전 입력단을 실제 출력 노드에 직접 연결하는 경우(대부분의 실제 회로) nullor의 등식 제약(`V+=V-`)이 pole/클리핑 로직을 완전히 우회해 특이(singular) 행렬을 유발함을 테스트로 발견. 레일만 설정된 경우는 대신 `openLoopGain`(기존에 있었지만 미사용이던 필드)을 유한 이득으로 사용해 입력 오차 신호를 직접 클리핑하는 브랜치로 재설계 — 별도 내부 노드 불필요, 특이성 문제 해결.
- **슬루레이트 제한**: 계획대로 `transient.ts`에서 이전 타임스텝 대비 dV/dt 상한을 소프트웨어적으로 클램핑(`applySlewRateLimiting`). 초기 구현에서 "히스토리 없으면 현재 미클램프 해로 초기화" 버그로 클램핑이 전혀 발생하지 않는 문제 발견 → 초기값을 0V로 고정해 수정.
- AC 소신호 해석(`ac.ts`)에도 동일한 GBWP 적분기 + 레일 클리핑(DC 동작점에서 기울기 고정) 스탬프를 반영해 주파수 응답에서 GBWP 컷오프가 실제로 보이도록 함.
- 속성 인스펙터: 기존 `Object.entries(selectedPart.params)` 범용 렌더링이 새 필드를 자동으로 텍스트 인풋으로 노출 — 별도 UI 코드 불필요.
- **신규 프리셋**: `ts9-overdrive` — JRC4558 근사치(`GBWP=3MHz`, `slewRate=1.5V/us`, `rails=±4V`)를 opamp-drive와 동일한 회로 토폴로지에 적용, 이상적 버전과 톤 비교 가능.
- **검증**: `tests/solver/opamp-nonideal.test.ts` 신규 — GBWP 컷오프 주파수(-3dB @ gbwpHz, unity buffer), 슬루레이트로 인한 계단 응답 램프(및 이상적 op-amp 회귀 없음 확인), rail 클리핑 레벨(및 레일 내 선형 구간 회귀 없음 확인) 총 6개 테스트. 기존 8개 프리셋 + 신규 ts9-overdrive 프리셋 전부 `presets-sanity`/`graphFromNetlist` 회귀 테스트 통과. `npx tsc --noEmit`, `npm run build`, 브라우저에서 TS9 프리셋 로드 후 인스펙터에 5개 파라미터 정상 노출 및 콘솔 에러 없음 확인.

## 1-구. 비이상적 Op-Amp 매크로 모델링 (원본 계획, 참고용)

제안된 4단계 구성(입력저항 → GBWP 저역통과 극 → 슬루레이트 제한 → rail-to-rail 클리핑) 자체는 타당하고, 현재 아키텍처(MNA + Newton-Raphson, `mna.ts`/`newton.ts`)로 충분히 구현 가능하다. 다만 난이도가 서로 다르므로 아래 순서로 단계적 구현을 권장한다.

| 하위 항목 | 구현 난이도 | 이유 |
|---|---|---|
| 입력 저항(Rin) | 낮음 | 기존 `stampConductance` 그대로 재사용 가능 |
| GBWP 저역통과 극 | 낮음 | 내부 노드 하나 + R/C 컴패니언 모델(이미 `capacitor.ts`에 구현됨) 추가로 충분. 새 비선형 로직 불필요 |
| 슬루레이트 제한 | 중간 | 물리적으로는 전류제한 VCCS+커패시터가 정석이나, `transient.ts`에서 이전 타임스텝 대비 dV/dt 상한을 클램핑하는 소프트웨어적 방식이 훨씬 단순하고 충분히 근사함 — 이쪽을 권장 |
| Rail-to-rail 클리핑 | 높음 | **반드시 Newton 반복 내부의 비선형 스탬프로 구현해야 함.** 출력단을 사후(post-hoc) 클리핑하면 피드백 루프가 있는 회로(예: 이미 구현된 `opamp-drive` 프리셋처럼 피드백 저항이 클리핑 동작에 관여하는 경우)에서 물리적으로 틀린 동작점을 만들어냄. `diode.ts`의 전압 제한(voltage limiting) 방식과 동일한 패턴(tanh 또는 유사 함수의 도함수로 컨덕턴스 선형화)으로 구현 필요 — 사실상 새로운 비선형 소자 하나를 다이오드와 같은 급으로 설계하는 작업
| 사용자 파라미터(인스펙터) | 낮음 | 기존 `PART_DEFS`/속성 패널 패턴 그대로 확장 |

**설계 결정**: 기존 `opamp`(이상적) 타입은 그대로 두고, `solver/types.ts`에 새 `OpAmpElement` 필드(옵셔널: `gbwpHz`, `slewRateVPerUs`, `railPositive`, `railNegative`)를 추가하는 방식을 권장 — 기존 8개 프리셋과 회귀 테스트가 전부 이상적 opamp에 의존하므로, 필드를 옵셔널로 두고 미설정 시 현재 동작(무한 대역폭/슬루레이트, 클리핑 없음)을 그대로 유지해야 회귀가 발생하지 않는다.

**왜 이번 세션에 착수하지 않았나**: 이번 세션에서 이미 레이아웃 알고리즘 재작성, 회전/그리드/배선, 다이오드 프리셋, 포텐셔미터 테이퍼까지 반영해 변경량이 상당함. Rail-to-rail 클리핑은 새 비선형 소자 설계 + Newton 안정성 검증(전압 제한 알고리즘 포함)이 필요한 별도 작업 단위라, 충분한 집중과 테스트 시간이 필요한 다음 세션의 첫 작업으로 남겨둠.

---

## 2. 포텐셔미터 테이퍼 — **완료**

- `editor/taper.ts`: `applyTaper(taper, position)` 구현. B(선형)=`x`, A(오디오)=`10^(log10(100)*x)/100`, C(리버스 오디오)=`1 - f_A(1-x)` — 스펙에 제시된 수식 그대로.
- `editor/partDefs.ts`: 포텐셔미터 기본 파라미터에 `taper: "B"` 추가.
- `editor/netlistFromGraph.ts`: 포텐셔미터를 저항 2개로 분해할 때 `position`을 그대로 쓰지 않고 `applyTaper`를 통과시킨 비율(`ratio`)로 분해하도록 수정.
- 검증: `tests/editor/taper.test.ts` — A 테이퍼가 회전 중간(0.5)에서 전기적으로 10%만 이동했는지, C가 A의 반전인지, 범위를 벗어난 입력이 클램핑되는지 확인.
- **드롭다운 UI 완료**: `editor/taper.ts`에 `TAPER_OPTIONS` 레이블 맵 추가, `SchematicEditor.tsx`에서 포텐셔미터 선택 시 다이오드 모델 드롭다운과 동일한 패턴으로 전용 `<select>` 렌더링 (범용 텍스트 인풋 목록에서는 `taper` 키를 필터링해 중복 표시 방지). 브라우저에서 포텐셔미터 배치 → 선택 → 드롭다운에 B/A/C 3개 옵션 노출 확인, 콘솔 에러 없음.

---

## 3. 다이오드 클리핑 소자 프리셋화 — **완료** (요청 범위 내)

- `core/library/deviceModels.ts`에 `DIODE_MODELS` 레지스트리 추가: `1N4148`(실리콘), `1N34A`(저마늄, `Is=2e-7, N=1.2`로 갱신), `RED_LED`(`Is=1e-18, N=2.5`로 갱신 — 실제 LED 순방향 전압(~1.8V)에 더 가깝게 조정).
- `editor/SchematicEditor.tsx`: 다이오드 소자 선택 시 속성 패널에 "소자 모델" 드롭다운이 나타나고, 선택하면 `saturationCurrent`/`thermalVoltage`/`emissionCoefficient` 세 값이 한번에 적용됨.
- **RS(직렬저항) 모델링 완료** (7번 항목, 스트레치 목표): `DiodeElement`에 옵셔널 `seriesResistance` 필드 추가. Op-amp의 내부 pole 노드와 동일한 패턴으로 다이오드 내부에 `${id}::rs` 노드를 추가해, 외부 애노드 핀 → (선형 저항 Rs) → 내부 접합 노드 → (기존 지수 방정식) → 캐소드로 분리. 미설정(0/undefined) 시 기존 동작과 완전히 동일(회귀 없음). AC 해석(`ac.ts`)도 동일한 2단 구조로 스탬프(Rs 저항 + 접합의 DC 선형화 컨덕턴스)해 반영. **검증**: `tests/solver/diode-series-resistance.test.ts` 4개 — 고전류에서 Rs가 전압 강하를 늘리는지, 저전류 소신호 영역은 거의 그대로인지, AC 해석이 finite한지, `seriesResistance=0`/미설정이 회귀 없음(9자리 정밀도 일치)인지 확인. 인스펙터에는 `paramMeta.ts`에 단위(Ω) 등록만으로 자동 노출.

---

## 4. 캐비닛 IR 컨볼루션 — **완료**

- **설계 변경**: 스펙은 "생성 스크립트로 IR을 만들어 `public/ir/`에 WAV로 저장"을 제안했으나, 정적 WAV 자산 대신 **런타임에 직접 합성**하는 방식으로 구현 (`audio/cabinetIr.ts`의 `generateCabinetIr(sampleRate, variant)`). 이유: (1) 바이너리 자산을 커밋/유지보수할 필요가 없음, (2) 순수 함수라 vitest로 바로 단위 테스트 가능(정적 WAV는 별도 디코딩 없이는 테스트 불가), (3) 샘플레이트가 바뀌어도(44.1k/48k) 항상 그 자리에서 정확히 재생성됨.
- **구현**: RBJ Audio EQ Cookbook 공식으로 peaking/high-shelf biquad 2~3개를 유닛 임펄스에 직렬로 통과시키고(순수 시간영역 IIR, FFT 불필요), 짧은 지수 감쇠 엔벨로프(τ=6ms)를 곱해 실제 캐비닛 IR과 비슷한 길이(~20ms)로 정리. 2종: `brightCab4x12`(3kHz 프레즌스 부스트 +6dB, 저역 컷), `darkCab2x12`(3kHz 딥 -6dB, 150Hz 로우미드 부스트 +4dB). **"제네릭 캐비닛 시뮬레이션"으로 명확히 라벨링** — 특정 상용 캐비닛 이름 미사용.
- `audio/playback.ts`의 `playSamples`에 옵셔널 `cabinetVariant` 인자 추가 — 설정 시 `AudioBufferSourceNode → ConvolverNode(normalize=true) → destination`으로 라우팅, 미설정 시 기존 경로 그대로(회귀 없음).
- `SchematicEditor.tsx` 파형 패널 하단에 "IR 적용 (제네릭 캐비닛 시뮬레이션)" 체크박스 + variant 드롭다운 추가.
- **검증**: `tests/audio/cabinetIr.test.ts` — IR 길이/유한성/비무음 확인, bright가 dark보다 3kHz 에너지 높음, dark가 bright보다 150Hz 에너지 높음(단순 단일주파수 DFT로 계산), 샘플레이트에 비례해 길이 스케일 확인. 브라우저에서 WAV 샘플 로드→시뮬레이션 실행→"IR 적용" 체크→파형 재생까지 콘솔 에러 없이 동작 확인.

---

## 5. 실시간 톤스택 응답 뷰어 — **부분적으로 이미 동작함**

- 현재 `SchematicEditor`의 `acPoints`는 `parts`/`wires` 상태가 바뀔 때마다 `useMemo`로 즉시 재계산됨 — AC 해석(복소수 선형 솔브)이 회로 규모에서 매우 가벼워 텍스트 입력 파라미터를 바꿀 때마다 사실상 실시간으로 이미 갱신되고 있음. lodash 등 새 의존성 추가 없이도 동작.
- **슬라이더 UI 완료**: `editor/paramMeta.ts`에 `slider: {max, step}` 메타를 추가해 `position` 파라미터가 `<input type="range">`로 렌더링되도록 함(`SchematicEditor.tsx`). 브라우저에서 전압원+포텐셔미터+접지로 간단한 분압 회로를 구성해 검증 — position 슬라이더를 0.5→0.02로 드래그하는 동안 주파수 응답 캔버스가 매번 다시 그려지는 것을 캔버스 픽셀 데이터 비교로 확인(디바운스 없이 `useMemo` 재계산만으로 이미 실시간). 콘솔 에러 없음.
- 회로 규모가 커질 경우(사용자가 대형 커스텀 회로를 구성하는 경우) AC 재계산 비용이 늘어날 수 있으므로, 그 시점에는 자체 구현한 경량 디바운스(setTimeout 기반, 새 의존성 없이)를 추가하는 것을 권장 — 아직은 불필요.

---

## 6. 프리셋 데이터 구조 일원화 — **다른 방식으로 해결**

스펙에서 제안한 "넷리스트+좌표+배선 좌표까지 포함한 JSON을 프리셋마다 수작업으로 작성" 방식 대신, **자동 레이아웃 알고리즘**으로 같은 문제(프리셋을 캔버스에 바로 로드해서 편집 가능하게 하기)를 해결함:

- `editor/graphFromNetlist.ts`: 기존 `PedalPreset.build()`가 반환하는 넷리스트(현재 스키마 그대로, 변경 없음)를 입력받아, **입력 소스로부터의 BFS 신호 흐름 거리**로 좌우 배치(column)를, 같은 거리 내에서는 선언 순서로 세로 배치(row)를 계산. 접지는 전체 아래 별도 행에 배치.
- 배선은 넷리스트의 노드 공유 관계에서 자동 도출되며(수작업 불필요), 같은 넷 안에서는 배치 좌표 기준으로 가까운 부품끼리 먼저 연결하도록 정렬해 배선이 화면을 가로지르지 않게 함.
- **왜 이 방식을 택했나**: 스펙의 JSON 스키마 방식은 프리셋마다 좌표+배선 waypoint를 손으로 맞춰야 해 정확한 회로도를 얻을 수 있지만, 프리셋이 늘어날수록 "회로 값"과 "도면 좌표"라는 두 개의 진실 소스를 계속 동기화해야 하는 유지보수 부담이 생김. 자동 레이아웃은 그 부담이 없고, `PedalPreset.build()` 하나만 진실 소스로 유지됨.
- **검증**: `tests/editor/graphFromNetlist.test.ts` — 8개 프리셋 전부 왕복 변환 후 AC 응답이 원본과 정확히 일치하는지 회귀 테스트로 확인 (BFS 레이아웃 변경 후에도 통과 유지).
- **사용자 피드백 반영**: 최초 자동 레이아웃(선언 순서 그대로 격자 배치 + 발견 순서로 배선 체이닝)이 배선이 부품을 관통하고 캔버스 하단이 잘리는 문제를 일으켜, 이번에 BFS 신호흐름 레이아웃 + 배선 정렬 + 캔버스 동적 크기 조정(부품 배치 범위에 맞춰 자동 확장, 넘치면 스크롤)으로 교체함.
- **절충안 적용 완료**: `PedalPreset`에 옵셔널 `layout?: Record<elementId, {x,y}>` 필드 추가, `graphFromNetlist(netlist, inputSourceId, layout?)`가 해당 elementId의 좌표가 있으면 그대로 쓰고 없으면 기존 BFS 자동배치로 폴백(배선은 여전히 넷리스트에서 100% 자동 도출, waypoint 수작업 없음). 배선 교차가 가장 심했던 두 프리셋(`multi-stage-drive`: 2단 피드백 클리핑, `fuzz-germanium`: 2트랜지스터 직결 피드백)에 수작업 좌표 적용 — 나머지 6개는 자동배치로 이미 충분히 깔끔해 그대로 둠. 검증: `tests/editor/graphFromNetlist.test.ts`에 레이아웃 오버라이드 유닛 테스트 3개 추가(명시 좌표 적용, 부분 지정 시 나머지는 자동배치 폴백, 인자 미전달 시 완전히 동일 — 회귀 없음) + 기존 8개 프리셋 왕복 회귀 테스트에도 `preset.layout` 전달 반영. 브라우저에서 두 프리셋 로드 후 부품 좌표가 지정값과 정확히 일치하는지 확인, 콘솔 에러 없음.

---

## 요약: 이번 세션 반영 사항

| 항목 | 상태 |
|---|---|
| 1. 비이상적 Op-Amp | ✅ 완료 (GBWP/슬루레이트/rail 클리핑, TS9 프리셋, 6개 테스트) |
| 2. 포텐셔미터 테이퍼 | ✅ 완료 (A/B/C, 테스트 포함) |
| 3. 다이오드 프리셋화 | ✅ 완료 (드롭다운 UI 포함, RS 미모델링) |
| 4. 캐비닛 IR | ✅ 완료 (런타임 합성 IR, ConvolverNode, 4개 테스트) |
| 5. 실시간 AC 뷰어 | ✅ 완료 (연산은 이미 실시간 + 슬라이더 UI 반영, 브라우저 검증 완료) |
| 6. 프리셋 데이터 구조 | 대안 방식으로 해결 (BFS 자동 레이아웃) — 완료 |
