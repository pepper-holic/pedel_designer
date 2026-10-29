# 오픈 페달 회로 아카이빙 → 회로 DB화 계획

## 배경

현재 앱은 `core/library/presets/`에 8개 커스텀 프리셋(직접 설계한 대표 토폴로지: 다이오드 클리퍼, op-amp 드라이브, 퍼즈, 톤스택 등)만 내장하고 있다. 웹에는 수십 년간 DIY 커뮤니티가 축적한 방대한 오픈 페달 회로 자료(부품값 포함 회로도)가 존재하며, 이를 조사·정리해 향후 앱의 `PedalPreset` 포맷과 호환되는 데이터로 옮기면 프리셋 라이브러리를 대폭 확장할 수 있다.

이번 라운드에서는 **조사 + 계획 문서 작성까지만** 진행한다 (사용자 확인 사항). 실제 코드/데이터 구현은 이 문서를 기반으로 별도 세션에서 진행.

---

## 1. 조사한 오픈 회로 아카이브 소스

웹 검색으로 확인한, DIY 커뮤니티에서 통상적으로 참조되는 주요 사이트:

| 사이트 | 특징 | 라이선스/공개 성격 |
|---|---|---|
| [ElectroSmash](https://www.electrosmash.com/) | 유명 페달(Tube Screamer, Big Muff, Rat 등)의 회로 분석 아티클 — 블록별 동작 설명, 주파수 응답, 부품값 표 포함. 교육 목적으로 상세히 공개. | 아티클/이미지 자체는 저작권 있음. 회로 토폴로지·부품값은 별도로 참고해 직접 재구성 가능. |
| [General Guitar Gadgets (GGG)](https://generalguitargadgets.com/) | DIY 스톰박스 프로젝트용 회로도·배선도·PCB 다수. 커뮤니티에서 가장 오래되고 신뢰받는 사이트 중 하나. | 프로젝트 문서 공개, PCB/키트는 유료 판매 — 회로도 자체는 자유 열람. |
| [Tagboard Effects](https://tagboardeffects.blogspot.com/) | 유명 이펙트 수백 종의 vero/tagboard 레이아웃 아카이브(1000개 이상). | 커뮤니티 기여 기반 블로그, 레이아웃 이미지는 원저작자 귀속 필요. |
| [freestompboxes.org](https://www.freestompboxes.org/) | 포럼 기반, 오리지널 이펙트 회로도·트레이스 레이아웃(빈티지 페달 리버스엔지니어링 포함) 자유 공유. | 포럼 회원 기여, 재배포 시 출처 표기 관례. |
| [GuitarPedalPCBs (GitHub)](https://github.com/GuitarML/GuitarPedalPCBs) | KiCad 오픈소스 PCB 설계 모음. | GitHub 공개 저장소 — 개별 저장소 라이선스 확인 필요하나 대체로 오픈소스 지향. |
| [muzique.com](https://www.muzique.com/) | R.G. Keen(AMZ)의 DIY 회로/이론 아티클, 클래식 회로 분석. | 개인 사이트, 교육 목적 공개. |
| [stompboxschematics.com](https://stompboxschematics.com/) | 다양한 상용/DIY 페달 회로도 아카이브. | 회로도 스캔본 재배포 성격 — 저작권 주의 필요. |

## 2. 법적/저작권 고려사항 (중요)

- **회로 토폴로지와 부품값 자체(저항값, 커패시터값, 다이오드 종류 등)는 "기능적 사실(functional fact)"**로 취급되어 대부분의 법域에서 저작권 보호 대상이 아니다(아이디어-표현 이분법). 이미 이 프로젝트도 `deviceModels.ts`에서 1N4148/1N34A 등 실제 소자 SPICE 파라미터를 자유롭게 사용 중 — 같은 원칙 적용 가능.
- **그러나 다음은 절대 그대로 복제하면 안 됨**: (a) 스캔된 회로도 이미지/PDF 자체, (b) 사이트의 설명 문구를 그대로 복사, (c) 상표권이 걸린 상용 제품명(예: "Ibanez Tube Screamer", "ProCo RAT", "Electro-Harmonix Big Muff")을 그대로 제품명처럼 사용.
- **이미 이 프로젝트가 채택한 안전한 패턴**(TS9 프리셋, 캐비닛 IR 라벨링에서 이미 적용): 상용 제품을 지칭할 때는 "TS9 **스타일**", "제네릭 **~시뮬레이션**" 처럼 스타일/근사임을 명시하고, 회로는 **직접 넷리스트로 재작성**(원문 회로도를 참고해 토폴로지와 대표값만 가져오고, 이미지·텍스트는 복사하지 않음). 새 회로 DB에도 동일 원칙 적용.
- 각 회로 데이터에 **출처 참고 링크(sourceRefs)** 를 메타데이터로 남겨, 어디를 참고해 재구성했는지 추적 가능하게 하되 "이 사이트에서 복사함"이 아니라 "이 사이트의 공개된 부품값을 참고해 직접 재구성함"이 명확하도록 함.

## 3. 제안하는 DB 스키마

기존 `PedalPreset`(`core/library/types.ts`)을 그대로 재사용하되, 커뮤니티/아카이브 출처 회로임을 구분하기 위해 옵셔널 메타데이터를 추가하는 방향을 제안:

```typescript
export interface PedalPreset {
  // ...기존 필드 그대로...
  layout?: Record<string, { x: number; y: number }>;

  /** 커뮤니티/아카이브 회로일 때만 설정. 직접 설계한 8개 기존 프리셋에는 없음. */
  archive?: {
    /** 참고한 원 회로/토폴로지의 통칭 (상표명 대신 스타일/장르로 표기, 예: "TS-808 스타일 오버드라이브"). */
    styleReference: string;
    /** 재구성 시 참고한 공개 자료 링크 (텍스트/이미지 복제 아님, 부품값·토폴로지 참고용). */
    sourceRefs: { label: string; url: string }[];
    /** 실측/공식 스펙이 아닌 "대표값 근사"임을 명시하는 주의문. */
    disclaimer: string;
  };
}
```

- 회로 개수가 많아지면 `presets/index.ts`에 전부 나열하는 대신 `presets/archive/` 하위 디렉터리로 분리하고, 카테고리별(오버드라이브/퍼즈/디스토션/톤스택 등) 서브 인덱스를 두는 구조 권장 (파일당 400줄 룰 유지를 위해 회로 1개 = 파일 1개 원칙 계속 적용).
- UI 측: `SchematicEditor`의 "템플릿" 탭에 서브탭 추가 — "기본 프리셋" vs "커뮤니티 아카이브"로 분리하거나, 카테고리 필터/검색 인풋 추가(회로 수가 늘어나면 현재의 단순 리스트 UI로는 스크롤이 길어짐 — 이것도 향후 UX 개선 과제로 별도 트래킹 필요).

## 4. 우선순위 후보 회로 (스타일 기준, 상표명 미사용)

기존 8개 프리셋과 겹치지 않으면서 대표성이 높은 토폴로지 후보 (실제 값은 구현 세션에서 공개 자료 참고해 확정):

1. **RAT 스타일 디스토션** — op-amp 게인 스테이지 + 클리핑 다이오드를 op-amp 출력 쪽(피드백 루프 밖)에 배치하는 것이 특징 (기존 opamp-drive/ts9는 피드백 내부 클리핑이라 토폴로지가 다름). ✅ 완료 (`rat-style-distortion.ts`)
2. **Big Muff 스타일 퍼즈/서스테이너** — 2~3단 트랜지스터 증폭 + 다이오드 클리퍼 + 톤 컨트롤(톤 스택) 조합, 기존 fuzz-germanium(2트랜지스터 직결)과 구분되는 4단 구성. ✅ 완료 (`big-muff-style-fuzz.ts`, 상세는 [plan-editor-implementation-history.md](./plan-editor-implementation-history.md) 참고)
3. **Klon 스타일 클린 부스트/오버드라이브** — 클린 버퍼 경로와 클리핑 경로를 병렬로 섞는(blend) 독특한 구조, MNA 솔버가 병렬 경로를 잘 처리하는지 확인하는 좋은 테스트케이스. ✅ 완료 (`klon-style-blend.ts`)
4. **Silicon/Germanium 스타일 오버드라이브 (Boss-style)** — 다단 오피앰프 + 톤 컨트롤 통합형, 기존 프리셋들과 톤스택 결합 패턴 비교용. ✅ 완료 (`boss-style-overdrive.ts`, 상세는 [plan-editor-implementation-history.md](./plan-editor-implementation-history.md) 참고)

**우선순위 후보 4개 전부 구현 완료.**

## 5. 구현 로드맵 (실제 작업 시)

1. **스키마/로더 메커니즘 구현** — 위 `archive` 필드 타입 추가, `presets/archive/` 디렉터리 스캐폴딩, "출처만 참고하고 값은 직접 재구성" 원칙으로 회로 1개 작성 → 회귀 테스트(AC sanity, 프리셋 왕복 변환) 통과 확인 → 패턴 확정.
2. **회로 3~4개 추가** — 위 우선순위 후보부터, 각각 1개 커밋 단위로 (구현 → 유닛 테스트 → 브라우저 검증 → 문서화 → 커밋 사이클 준수).
3. **UI 확장** — 템플릿 탭에 카테고리/검색 추가 (회로 수가 늘어난 뒤 필요할 때).
4. **(선택) 외부 JSON 임포트** — 사용자가 직접 회로 데이터를 JSON으로 붙여넣어 커스텀 프리셋으로 등록하는 기능 — 유효성 검증(넷리스트 노드 연결성, 소자 파라미터 범위) 로직 필요.

## 완료 기준 (이번 라운드)

- [x] 오픈 회로 아카이브 소스 조사 및 정리
- [x] 저작권/라이선스 고려사항 정리
- [x] DB 스키마 설계안 작성
- [x] 우선순위 후보 회로 선정
- [x] 구현 로드맵 작성
- [x] **일반화 메커니즘 실제 구현 + 데모 회로 2개로 검증 완료** (아래 참고)
- [x] **우선순위 후보 회로 4개 전부 구현 완료** (RAT/Big Muff/Klon/Boss 스타일) — 나머지 2개(Big Muff, Boss 스타일)는 [plan-editor-implementation-history.md](./plan-editor-implementation-history.md) 참고

## 6. 일반화 메커니즘 구현 완료

계획에서 그친 것이 아니라, "실제로 이 프로그램에 불러올 수 있는" 형태까지 구현했다:

- `PedalPreset`에 옵셔널 `archive?: { sourceRefs, disclaimer }` 필드 추가 (`core/library/types.ts`) — 커뮤니티 출처 회로임을 구분하는 메타데이터. 회로 자체는 기존 `PedalPreset` 포맷 그대로라 **별도 로더/변환기 없이 기존 템플릿 파이프라인에 그대로 올라감** (`SchematicEditor`의 "템플릿" 탭에 자동 노출, `graphFromNetlist`/`netlistFromGraph` 왕복도 100% 재사용).
- `core/library/presets/archive/` 디렉터리 신설, 회로 1개 = 파일 1개 원칙으로 데모 2종 구현:
  - **`rat-style-distortion.ts`**: 인버팅 op-amp 게인 스테이지 + 저항(Rs)으로 전류 제한된 출력단 다이오드 클리퍼. 기존 프리셋들과 달리 클리핑이 피드백 루프 **밖**에서 일어남.
    - **구현 중 발견한 설계 함정**: 처음에는 다이오드 페어를 op-amp의 실제 출력 노드에 직접 매달았는데, 이상적(무한 이득/영 출력임피던스) op-amp 모델에서는 피드백 루프가 다이오드 전류와 무관하게 정확한 전압을 강제하기 때문에 **전혀 클리핑되지 않는** 버그를 테스트로 발견(1번 항목의 rail-clipping 버그와 동일한 근본 원인). 피드백은 op-amp의 순수 출력 노드(`opout`)에서 따고, 그 뒤에 전류 제한 저항(Rs)을 거쳐 별도 노드(`out`)에서 다이오드가 클리핑하도록 재설계 — 기존에 이미 검증된 `diode-clipper` 프리셋과 동일한 "저항+다이오드" 패턴 재사용으로 해결.
  - **`klon-style-blend.ts`**: 클린 버퍼 경로 + 클리핑 드라이브 경로를 저항 분배(`Rblend1`/`Rblend2`)로 합친 뒤 출력 버퍼로 재단상. op-amp 2개의 출력을 하나의 수동 합산 노드로 섞는, 라이브러리 최초의 "병렬 경로" 구조 — MNA 솔버가 이런 토폴로지도 추가 코드 변경 없이 그대로 처리됨을 확인.
- `presets/index.ts`에서 `archivePresets`를 기존 `presets` 배열에 병합 — 기존 8개 프리셋과 완전히 동일하게 취급되어 `presets-sanity.test.ts`/`graphFromNetlist.test.ts`의 전수 회귀 테스트에 **자동으로 편입**됨(추가 테스트 코드 불필요).
- 전용 동작 검증: `tests/solver/archive-presets-behavior.test.ts` 4개 — RAT 스타일이 큰 입력에서 선형 이득 예측치보다 훨씬 낮게 클리핑되는지/작은 입력에서는 선형에 가까운지, Klon 블렌드가 한쪽 저항을 극단으로 키우면 순수 클린/순수 드라이브 경로에 각각 수렴하는지 확인 — **4개 전부 첫 실행에 통과**, 두 토폴로지가 설계 의도대로 정확히 동작함을 뒷받침.
- 검증: `npx tsc --noEmit`, `npx vitest run`(70개 전부 통과), `npm run build` 클린. 브라우저에서 두 템플릿 모두 로드 → 회로도 렌더링 → 출력 노드 자동 선택 → 주파수 응답 정상 계산까지 확인, 콘솔 에러 없음.

## 7. 2차 확장: 오버드라이브 계보 4종 추가 완료

사용자 요청으로 유명 오버드라이브/트랜스페어런트 계열 4개를 추가 조사·구현. `coda-effects.com`(Jan Ray/Timmy 회로 분석) 및 웹 검색(ElectroSmash, PedalPCB 포럼, Dirtbox Layouts, Analog Is Not Dead, Stanford CCRMA 논문 등)으로 각 회로의 **기능적 토폴로지**(게인 스테이지 형태, 클리핑 다이오드 위치/개수/종류, 톤스택 방식)를 확인 후 직접 넷리스트로 재구성 - 기존 원칙(회로도 이미지·텍스트 비복제, 상표명 대신 스타일 표기, `archive.sourceRefs`/`disclaimer` 메타데이터 부착) 동일 적용.

- **`timmy-style-overdrive.ts`**: JFET 공통-소스 부스트 단 + 인버팅 op-amp 게인 스테이지, 피드백 루프에 다이오드 **단 1쌍만** 배치(기존 TS9/opamp-drive의 4-다이오드 피드백 대비 압축감이 훨씬 적은 것이 이 계열의 핵심 특징) + 패시브 RC 톤스택.
- **`bluesbreaker-style-overdrive.ts`**: 라이브러리 최초로 **논인버팅** op-amp 게인 스테이지(입력 임피던스가 높고 인버팅 스테이지들과 캐릭터가 다름) + 별도 인버팅 스테이지의 피드백 루프에 4-다이오드(직렬 2개 x 양방향) 클리핑 + 패시브 톤스택.
- **`king-of-tone-style-overdrive.ts`**: Bluesbreaker와 동일한 논인버팅 1단 이후, `clipMode` 파라미터로 **클리핑 배치 자체가 바뀌는** 2단을 `build()` 내에서 분기 구현 - `0`은 피드백 루프 클리핑(TS 계열), `1`은 이미 검증된 RAT 스타일의 "출력단 션트 클리핑" 패턴 재사용. 파라미터 분기가 넷리스트 구조 자체를 바꾸는 첫 사례라 `presets-sanity.test.ts`(defaultParams만 커버)와 별도로 `tests/solver/king-of-tone-clip-modes.test.ts`를 추가해 `clipMode: 1` 분기도 회귀 검증.
- **`ocd-style-overdrive.ts`**: 인버팅 게인 스테이지 + RAT 패턴 재사용의 출력단 션트 클리핑이되, 양쪽 다이오드를 **실리콘/게르마늄으로 다르게** 배치(비대칭 하드 클리핑) + `brightSwitch` 파라미터로 트레블 브리드 커패시터 유무를 분기. 이 분기도 넷리스트 구조를 바꾸므로 `tests/solver/ocd-bright-switch.test.ts`로 `brightSwitch: 1` 분기 별도 검증.
- `presets/archive/index.ts`, `presets/index.ts`에 4종 전부 등록 - 기존 8+4개 프리셋과 동일하게 `presets-sanity.test.ts`(NaN/Infinity 전수 검사)에 자동 편입.
- 검증: `npx tsc -b` 클린, `npx vitest run` 149개 전부 통과(기존 137 + 신규 12: 프리셋 4종의 기본 sanity 테스트 4개 + 분기 전용 테스트 8개), 브라우저에서 4개 템플릿 전부 로드 → 회로도 렌더링 → 출력 노드 자동 선택 → 주파수 응답 정상 계산까지 확인, 콘솔에 새로 발생한 에러 없음.

### 남은 후보 (추가 세션에서)

`coda-effects.com` Theory 섹션에서 추가로 확인한, 아직 미구현인 대표 토폴로지 후보: Fuzz Face류(트랜지스터 2개 피드백 바이어스 퍼즈 - 기존 `fuzz-germanium`과는 바이어스 방식이 다름), LPB1류(단일 트랜지스터 부스트), Tonebender MkIII류(3-트랜지스터 퍼즈). 필요 시 동일 원칙으로 후속 구현 가능.

## 8. 3차 확장: 공개 회로 4종 추가 완료 (2026-10-29)

이전 세션에서 조사만 해 둔 후보(DS-1, Bazz Fuss, Harmonic Percolator, Electra, Micro Amp, Colorsound Overdriver,
Tone Bender MkII, Zendrive, Cry Baby, AMZ Mini Booster) 가운데 **부품값과 노드 연결을 텍스트로 확인할 수 있었던 4종**만
같은 원칙(토폴로지·값만 참고해 직접 넷리스트 작성, 상표명 대신 스타일 표기, `archive.sourceRefs`/`disclaimer`)으로 구현했다.

- **`ds1-style-distortion.ts`** — 라이브러리에서 유일하게 op-amp 앞에 **이산 트랜지스터 부스터**(470k 컬렉터 피드백 바이어스,
  10k/22Ω)를 두는 구성. 논인버팅 op-amp(1 + DIST/4.7k, 접지 다리에 0.47µ로 DC 게인 1배) → 2.2k 직렬 + 실리콘 션트 쌍 →
  Big Muff식 저역(6.8k/0.1µ)·고역(0.022µ/6.8k) 두 갈래를 20k 팟 와이퍼로 섞는 톤. 노브: DIST(레오스탯), TONE(팟).
- **`micro-amp-style-boost.ts`** — 논인버팅 op-amp 한 단. 게인 팟(500k, C 테이퍼)이 **고정 56k와 병렬**이라 1배~약 20배(26dB)로
  제한되고, 2.7k/4.7µ 접지 다리로 DC 게인은 1배. 입력 바이어스 10M.
- **`electra-style-distortion.ts`** — NPN 한 단(2.2M 레일 바이어스, 4.7k/470Ω, 약 9배) + AC 커플 출력에 **직렬 저항 없이** 바로
  매단 저마늄 션트 쌍. 컬렉터 저항이 전류 제한을 겸한다. 원형은 노브가 없다.
- **`bazz-fuss-style-fuzz.ts`** — 달링턴(β≈2000으로 근사) 1석, 컬렉터→베이스 다이오드 하나가 유일한 바이어스. 컬렉터가 약 0.9V에
  앉아 양의 반주기는 포화, 음의 반주기는 같은 다이오드가 베이스 위 한 다이오드 전압으로 묶어 10mV 입력에도 이미 게이트형 구형파가
  된다(440Hz 사인 실측: 0.08~1.1V).
- `presetMotifs.ts`에 DS-1(주황)·Micro Amp(크림)·Electra·Bazz Fuss 칩 추가. `transient-reference.json`에 4종 × 3 적분 설정의
  기준 샘플 추가(기존 항목은 손대지 않음). `tests/solver/public-circuits-round3.test.ts`: 바이어스 점, 소신호 이득 vs 클리핑,
  톤 갈래, 게인 팟 양 끝, 비대칭 클리핑. 테스트 1011 → 1020개, 회로도 품질 테스트(몸통 관통·겹침 0, 교차 ≤ 24) 그대로 통과.

### 소스 접근성 메모 (다음 라운드용)
- `electrosmash.com`은 이 환경에서 DNS 실패, 미러 `electrosmash.mas-effects.com`은 열린다(DS-1·Micro Amp 값은 여기서 확인).
- `cedist.com`/`ftp.amplifiedparts.com`/`diystompboxes.com` 포럼은 403, `geofex.com`은 연결 리셋 — Harmonic Percolator와
  Cry Baby 와(wah)는 노드별 배선을 확정하지 못해 보류.
- 사용자 제안: PedalPCB·Madbean·Aion 같은 **파츠 사이트의 빌드 문서(PDF)** 에 회로도가 그대로 공개돼 있어 다음 소스로 가장 좋다.
  단 PDF 본문이 압축 스트림이라 WebFetch로는 텍스트가 안 나온다 — pdftotext/pypdf로 추출하거나 회로도 이미지를 직접 읽어야 한다.

### 남은 후보
Harmonic Percolator(PNP Ge + NPN Si 상보 쌍), Cry Baby 와(500mH 인덕터 공진 + 피드백 — 솔버에 인덕터는 이미 있음),
Colorsound Overdriver(3-TR + Baxandall 톤), Tone Bender MkII, Zendrive. AMZ Mini Booster(mu-amp)는 두 JFET이 같은 전류로
자기 바이어스되는 구조라 채널 길이 변조가 없는 현재 JFET 모델에서는 중간 노드 전압이 정해지지 않아 모델 보강이 먼저 필요하다.
