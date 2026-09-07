# Pedal Designer

기타 이펙트(오버드라이브/디스토션/부스트/퍼즈)와 기타 배선(픽업/스위칭/톤 회로)을 웹에서
직접 조합하고, 그 자리에서 시뮬레이션하고, 부품 목록(BOM)과 PCB 넷리스트까지 뽑아낼 수 있는
스키매틱 에디터 겸 회로 시뮬레이터입니다.

```
픽업 → 기타 배선(볼륨/톤/셀렉터/스플릿/직병렬) → 케이블 → 페달 체인 → 앰프 입력 → 캐비닛 IR
         ↓                                              ↓
    블록/부품 조합 (스키매틱 에디터, 하나의 넷리스트로 병합 해석)
         ↓
    시뮬레이션 (transient/AC, THD, 부품 공차 몬테카를로, 임피던스, 노브 스윕)
         ↓
    BOM 자동 생성 · PCB 넷리스트 생성 (KiCad export)
```

전체 컨셉과 페이즈별 진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md)를 참고하세요. 기타 배선/픽업
도메인 확장 계획은 [docs/plan-guitar-wiring.md](docs/plan-guitar-wiring.md), UI/UX·기능 백로그는
[docs/plan-ux-and-features.md](docs/plan-ux-and-features.md)에 있습니다.

## 시작하기

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web
```

`http://localhost:5173`에서 앱이 열립니다. 순수 클라이언트 앱이라 서버/DB가 없고, PWA로 설치해
오프라인에서도 그대로 동작합니다.

## 기능

### 회로 에디터
- 드래그 배치, 클릭 배선, 휠 줌/팬, Undo/Redo, localStorage 자동저장
- 범위 선택(Shift+드래그), 복사/붙여넣기/복제(Ctrl+C/V/D), 캔버스 키보드 조작(방향키 이동,
  `[`/`]` 부품 순환, Esc 선택 해제)
- 회로를 `.json` 파일로 저장/불러오기 (검증 포함 — 손상되거나 알 수 없는 소자가 있으면 메시지로 거부)
- 기능 블록 시스템(버퍼/게인/클리핑/톤스택/부하를 미리 배선된 단위로 배치)

### 소자 라이브러리 (17종)
저항·커패시터·인덕터·다이오드·BJT·JFET·연산증폭기·전압원·접지·포텐셔미터에 더해:
- **픽업** — 코일 DC저항+인덕턴스+자기용량의 표준 등가회로, 모델 10종(싱글코일/험버커/베이스/액티브)
- **스위치 6종** — SPST/SPDT/DPDT/3-way·5-way 블레이드 셀렉터/6단 로터리 (전부 저항 스탬프라 솔버는
  그대로)
- **결합 인덕터/트랜스포머** — 상호 인덕턴스(코일 결합, 험버커 직렬 정확도, 옥타비아류 회로에 필요)

소자 모델 라이브러리: 다이오드 6종, Op-amp 8종, 트랜지스터 5종, JFET 3종 — 전부 데이터시트/공개
SPICE 파라미터 기반.

### 프리셋 라이브러리 (48종)
- **페달 프리셋 23종** (기본 10 + 커뮤니티 아카이브 스타일 13 — RAT/Klon/Big Muff/Boss/Timmy/
  Bluesbreaker/King of Tone/OCD/LPB-1/Rangemaster/Distortion+/옥타브 퍼즈/Tone Bender Mk III
  스타일). 회로 토폴로지·부품값(기능적 사실)만 공개 자료에서 참고해 직접 재구성 — 상표명 대신
  "~스타일"로 표기합니다. 상세 원칙은 [docs/plan-circuit-archive.md](docs/plan-circuit-archive.md).
- **기타 배선 프리셋 25종** — 픽업 기본, 셀렉터(3-way/5-way), 코일 스위칭(스플릿/직병렬/위상반전),
  톤 회로(트레블 블리드 3종/50s vs 모던/로터리 톤캡/킬스위치), 베이스(볼륨2/블렌드), 온보드 액티브
  (Baxandall 2/3밴드, 자이레이터 미드, 액티브 픽업), 신호 경로(기타→페달 로딩 상호작용 실측)
- 일부 프리셋은 **토폴로지 변형(variants)**을 갖습니다(예: King of Tone의 피드백/션트 클리핑 전환) —
  라이브러리 탐색기에 들여쓴 분기로 항상 노출됩니다.

### 분석 도구 (10개 탭)
검사(DRC) · 주파수 응답 · 파형 · 노브 스윕 · 임피던스 · THD · 부품 공차(몬테카를로) · 페달 체인 ·
BOM · PCB(KiCad 넷리스트 export)

- **검사(DRC)**: 접지 누락·신호원 부재·떠 있는 단자·전압원 단락 등을 심각도별로 알려주고 해당
  부품으로 점프
- **노브 스윕**: 포텐셔미터/스위치 위치별 주파수 응답을 한 그래프에 겹쳐 그림 (색상 범례 포함)
- **임피던스**: 회로가 앞단(픽업/이전 페달)에 얼마나 무거운 부하인지 — 버퍼 배치·픽업 로딩 논의의
  핵심 수치
- **파형**: 내장 테스트 신호(단음/코드/사인 스윕/임펄스) 원클릭 실행 + 원본↔처리음 A/B 비교 재생 +
  캐비닛 IR 컨볼루션

### 시뮬레이션 코어
- MNA(Modified Nodal Analysis) 기반 transient/AC 솔버, Newton-Raphson 비선형 반복
- 이상적 소자 우선, 필요할 때만 비이상성 추가(op-amp GBWP/슬루레이트/레일 클리핑, 다이오드 직렬저항)
- **Newton 웜스타트** — 이전 샘플 해에서 시작해 클리핑 회로의 수렴 실패를 실질적으로 제거
- **오버샘플링(4x)** — 빠른 클리핑 knee의 앨리어싱 방지 (실제 오디오 시뮬레이션 경로)
- **적분법 선택** — 기본은 어떤 회로에도 안정적인 Backward Euler, 필요 시 더 정확한 Trapezoidal로
  전환 가능(UI 체크박스)
- 대용량 오디오 시뮬레이션은 Web Worker에서 실행(메인 스레드 안 막음)

## 시작하기 (개발)

```bash
npm install --prefix apps/web
npm run dev --prefix apps/web       # 개발 서버
```

## 스크립트 (`apps/web` 기준)

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입체크 + 프로덕션 빌드 (PWA 매니페스트/서비스워커 포함) |
| `npm test` | Vitest 단위/컴포넌트 테스트 (366개) |
| `npm run test:coverage` | 커버리지 포함 테스트 (`@vitest/coverage-v8`) |
| `npm run test:e2e` | Playwright E2E (프로덕션 빌드 기준 6개 시나리오) |
| `npm run typecheck` | `tsc -b` (strict 모드) |
| `npm run lint` | Oxlint |

## 품질 게이트

- **TypeScript strict 모드** 전면 적용 (앱 코드 + 테스트 코드 전부)
- **366개 유닛/컴포넌트 테스트** + **Playwright E2E 6종** (실제 캔버스 렌더링, 휠 줌, DRC, 노브
  스윕, KiCad 익스포트 등 jsdom이 구조적으로 검증 못 하는 것만)
- **커버리지 임계값** 실측치 바로 아래로 고정 — 회귀는 막고 평범한 변동은 통과 (`vite.config.ts`)
- **GitHub Actions CI** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — lint → typecheck →
  coverage → build → e2e 순서로 실행
- 모든 신규 프리셋/분기는 `presets-sanity.test.ts` / `wiringPresets.test.ts`에 자동 편입(배열에
  등록만 하면 NaN/Infinity 전수 검사)

## 프로젝트 구조

```
apps/web/
  src/core/       # 솔버(MNA/Newton/AC), 소자 모델, 프리셋 라이브러리
  src/editor/     # 스키매틱 에디터, 캔버스, 인스펙터, 분석 패널, 배선 프리셋
  src/audio/      # 오디오 로드/재생/테스트 신호/캐비닛 IR
  src/viz/        # 파형/주파수 응답 차트
  tests/          # Vitest 단위/컴포넌트 테스트
  e2e/            # Playwright E2E 스펙
docs/             # 로드맵, 도메인별 확장 계획, 설계 결정 기록
.github/workflows/ci.yml
```

## 배포

Vercel 설정([vercel.json](vercel.json)) 포함 — CSP 등 보안 헤더 적용, 순수 정적 SPA라 별도
백엔드 없이 배포됩니다.

## 라이선스

[LICENSE](LICENSE) 참고 — 현재 비공개(All rights reserved) 상태입니다.
