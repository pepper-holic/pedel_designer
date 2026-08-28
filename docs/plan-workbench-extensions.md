# 워크벤치 확장 기능 (Undo/Redo · 저장 · THD · 체인 · 공차 분석 · JFET)

## 배경

`plan-audio-domain-features.md`의 6개 항목을 모두 완료한 뒤, 실제 사용 흐름에서 자연스럽게 필요해지는 주변 기능들을 이어서 구현함 (별도 스펙 문서 없이 자체적으로 진행된 작업이라, 사후에 이 문서로 정리).

---

## 1. Undo/Redo — **완료**

- `editor/historyStack.ts`: `{past, present, future}` 3-스택 구조의 순수 함수 히스토리 매니저. 이산적 액션(부품 추가/삭제/회전/파라미터 변경/템플릿 로드)은 `pushSnapshot`으로 스냅샷을 쌓고, 드래그처럼 연속적인 업데이트는 `replacePresent`(되돌리기 스텝을 만들지 않음) → 드래그가 끝나면 `commitPrevious`로 드래그 시작 시점 스냅샷 하나만 되돌리기 스택에 기록 — 마우스를 1px씩 옮길 때마다 되돌리기 스텝이 쌓이는 것을 방지.
- 최대 50 스텝 제한(`MAX_HISTORY`).
- `SchematicEditor.tsx`에 "↶ 실행취소 / ↷ 다시실행" 버튼 + `Ctrl+Z`/`Ctrl+Shift+Z`(또는 `Ctrl+Y`) 단축키로 연결.
- 검증: 순수 함수라 스냅샷 스택 로직 자체를 유닛 테스트로 커버 가능(리듀서 패턴).

## 2. 회로 저장/불러오기 (localStorage) — **완료**

- `editor/circuitStorage.ts`: 현재 회로(`parts`/`wires`/`outputNode`/`inputGain`)를 JSON으로 직렬화해 `localStorage`에 저장/복원. `Storage` 인터페이스를 부분 타입(`Pick<Storage, "setItem">` 등)으로 주입받는 구조라 실제 브라우저 `localStorage` 없이도 유닛 테스트 가능.
- `deserializeCircuit`은 파싱 실패나 형식이 안 맞는 데이터에 대해 `null`을 반환하도록 방어적으로 작성 — 손상된 저장값이 앱을 깨뜨리지 않음.
- 브라우저 새로고침 후에도 마지막 작업 회로가 복원되는 것이 핵심 가치 (지금까지는 새로고침하면 작업 내용이 전부 날아갔음).

## 3. THD(전고조파왜곡) 측정 — **완료**

- `audio/testTone.ts`: THD 측정용 순수 사인파 생성 (`generateSineWave`) — 실제 오디오 샘플은 정상상태 단일 주파수가 아니라 THD 계산에 부적합하므로 별도 합성 톤 필요.
- `core/analysis/fft.ts`: 라디스-2 Cooley-Tukey FFT 직접 구현(제자리 반복 방식, 외부 의존성 없음). 입력 길이는 2의 거듭제곱이어야 하며, 호출부에서 zero-pad.
- `core/analysis/thd.ts`: FFT 결과에서 기본파 + 배음(2차, 3차, ...) 크기를 추출해 THD(%) 계산.
- `editor/thdMeasurement.ts` + `editor/ThdPanel.tsx`: 1kHz 테스트 톤을 현재 회로에 흘려 THD를 측정하는 UI. 출력 노드가 선택되어야 실행 가능.

## 4. 페달 체인 시뮬레이터 — **완료**

- `core/analysis/chain.ts`: 여러 회로(각각 `{netlist, inputSourceId, outputNode}`)를 순서대로 이어 붙여, 앞 단의 출력을 다음 단의 입력으로 흘려보내는 다단 트랜지언트 시뮬레이션.
- `editor/ChainPanel.tsx`: "현재 회로(캔버스)"를 포함해 8개 기본 프리셋 + 아카이브 프리셋 전부를 스테이지로 추가/삭제/순서 변경(↑↓) 가능한 체인 빌더 UI. "여러 페달을 연결한 보드 단위 신호 체인"이라는, 최초 UI 재설계 계획 문서에서 검토만 하고 보류했던 컨셉(옵션 3)을 별도 패널로 가볍게 구현한 형태.

## 5. 부품 공차 몬테카를로 분석 — **완료**

- `core/analysis/montecarlo.ts`: 현재 회로의 모든 R/L/C 값에 독립적으로 ±tolerance% 균등분포 난수를 적용해 AC 해석을 N회(기본 20회) 반복, 주파수별 min/max 응답 밴드를 산출.
- `editor/MonteCarloPanel.tsx`: 공차(%) 입력 + 실행 버튼, 결과로 "최악 편차(dB)"를 표시. 실제 양산 시 부품 공차가 톤에 미치는 영향을 가늠하는 용도 — 페달 자작/설계 커뮤니티에서 실질적으로 유용한 분석.

## 6. JFET 소자 + 클린 부스트 프리셋 — **완료**

- `core/components/jfet.ts`: Shichman-Hodges 제곱법칙 모델(포화 영역 전용 — 게이트 바이어스로 pinch-off 안쪽에 유지되는 부스트/버퍼단 목적에 충분). `solveNewton`과 동일한 Newton 선형화 패턴(`linearizeJfet` → VCCS 스탬프)을 따름, 게이트/드레인-소스에 작은 안정화 컨덕턴스(`JFET_GMIN`) 포함.
- `core/library/presets/jfet-boost.ts`: N채널 JFET 셀프 바이어스 공통-소스 증폭단 — 게이트 대저항 바이어스, 소스 저항 자기 바이어스, 바이패스 커패시터로 게인 확보. JFET 특유의 부드러운/짝수배음 위주 오버로드 특성을 시뮬레이션에 반영하는 첫 사례 (기존 BJT/다이오드 비선형과는 다른 소자 모델).

## 7. 아카이브 프리셋 2종 추가 — **완료**

`docs/plan-circuit-archive.md`의 "우선순위 후보" 4개 중 나머지 2개를 구현 완료 (RAT 스타일, Klon 스타일은 이전 세션에서 이미 완료):

- `presets/archive/big-muff-style-fuzz.ts`: 실리콘 NPN 2단 컬렉터 클리핑(각 단이 독립적으로 클리핑, 공유 피드백 루프 없음 — `fuzz-germanium`의 단일 직결 피드백 루프와 대비) + 패시브 톤스택.
- `presets/archive/boss-style-overdrive.ts`: 인버팅 op-amp 클리핑 게인 스테이지 + 클리핑 **이후**에 톤을 다듬는 패시브 톤 컨트롤 + 출력 버퍼 (`active-shelf-eq`처럼 게인 스테이지 자체에서 톤을 성형하는 방식과 대비).
- 두 회로 모두 상표명 대신 "스타일" 표기, 원 소스는 참고만 하고 넷리스트는 직접 재구성 — `plan-circuit-archive.md`에 이미 정리된 라이선스 원칙을 그대로 적용.
- 전용 동작 검증: `tests/solver/archive-presets-behavior-2.test.ts`.

## 8. UI 구조 리팩터: 컴포넌트 분리 — **완료**

`SchematicEditor.tsx`가 위 기능들을 다 떠안으면서 비대해지는 것을 막기 위해 하위 패널을 별도 파일로 분리 (파일당 400줄 원칙 유지):

- `InspectorPanel.tsx` — 선택 소자 속성 편집 (기존 SchematicEditor 내부 로직을 추출)
- `AnalysisPanels.tsx` — 주파수 응답 + 파형 뷰어 래퍼
- `OutputAudioPanel.tsx` — 출력 노드 선택 + 오디오 입력/재생 컨트롤
- `ChainPanel.tsx`, `MonteCarloPanel.tsx`, `ThdPanel.tsx` — 위 3~5번 항목의 전용 패널
- `App.tsx`는 메뉴바/상태바 셸만 남기고 32줄로 축소, 실질 조립은 `SchematicEditor.tsx`(412줄)가 담당.

## 요약

| 항목 | 상태 |
|---|---|
| Undo/Redo | ✅ 완료 |
| 회로 저장/불러오기 (localStorage) | ✅ 완료 |
| THD 측정 | ✅ 완료 |
| 페달 체인 시뮬레이터 | ✅ 완료 |
| 부품 공차 몬테카를로 분석 | ✅ 완료 |
| JFET 소자 + 프리셋 | ✅ 완료 |
| 아카이브 프리셋 2종 추가 (Big Muff/Boss 스타일) | ✅ 완료 |
| UI 컴포넌트 분리 리팩터 | ✅ 완료 |

## 남은 것

- 이 문서에 정리된 기능들은 코드 작성 시점에 검증(유닛 테스트/브라우저 확인)까지 마친 상태로 보이나, 이 문서 자체는 사후 정리이므로 **다음 세션에서 `npx vitest run` 전체 재실행 결과와 커밋 로그를 대조해 테스트 커버리지 공백이 없는지 한 번 더 확인 권장**.
- `ChainPanel`은 프리셋 개수가 늘어날수록(현재 13개) 드롭다운이 길어짐 — `plan-circuit-archive.md`에서 이미 언급된 "템플릿 탭 카테고리/검색" 개선과 같이 묶어서 처리하면 좋음.
