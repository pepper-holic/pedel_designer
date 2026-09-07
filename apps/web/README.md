# apps/web

Pedal Designer의 프론트엔드(React 19 + TypeScript strict + Vite). 전체 프로젝트 개요·기능
목록은 [루트 README](../../README.md)를 참고하세요.

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 (`http://localhost:5173`) |
| `npm run build` | 타입체크(`tsc -b`) + 프로덕션 빌드 (PWA 매니페스트/서비스워커 생성) |
| `npm run preview` | 프로덕션 빌드 결과 로컬 미리보기 |
| `npm test` | Vitest 단위/컴포넌트 테스트 |
| `npm run test:coverage` | 커버리지 리포트 포함 테스트 (`@vitest/coverage-v8`) |
| `npm run test:e2e` | Playwright E2E (내부적으로 프로덕션 빌드 후 preview 서버에 대해 실행) |
| `npm run typecheck` | `tsc -b` 단독 실행 |
| `npm run lint` | Oxlint |

## 디렉터리

```
src/
  core/
    solver/       # MNA 시스템, Newton-Raphson, AC(복소) 해석, transient 적분
    components/   # 소자별 스탬프 함수(저항~결합 인덕터)
    analysis/     # THD, 몬테카를로, 임피던스, 체인
    library/
      deviceModels.ts     # 다이오드/Op-amp/트랜지스터/JFET/픽업 SPICE 모델
      presets/            # 페달 프리셋 (기본 10 + archive/ 아래 커뮤니티 스타일 13)
  editor/
    SchematicEditor.tsx   # 최상위 에디터 컴포넌트(상태·핸들러 조합)
    SchematicCanvas.tsx   # SVG 캔버스(드래그/배선/줌팬/범위선택)
    dockTabs.tsx          # 하단 분석 도크 탭 목록
    wiring/               # 기타 배선 프리셋(픽업/셀렉터/톤회로/온보드 액티브) 25종
    partDefs.ts           # 소자 타입/단자 정의 (17종)
    netlistFromGraph.ts   # 캔버스 → 솔버 넷리스트 변환(합성 소자 전개 포함)
  audio/          # 샘플 로드/재생/내장 테스트 신호/캐비닛 IR 컨볼루션
  viz/            # 파형/주파수 응답 캔버스 차트
tests/            # Vitest - src/ 구조를 그대로 미러링
e2e/              # Playwright 스펙
```

## 개발 시 참고

- **파일 크기**: 회로 1개 = 파일 1개, 200~400줄 유지 원칙. 넘으면 기능 단위로 분리.
- **불변성**: 상태는 스프레드로 새로 만들어 반환.
- **회귀 테스트**: 프리셋/배선을 배열(`presets`, `wiringPresets`)에 등록하면
  `presets-sanity.test.ts` / `wiringPresets.test.ts`가 자동으로 NaN/Infinity 전수 검사에 편입시킵니다.
  넷리스트 구조 자체가 파라미터로 갈라지는 경우만 전용 테스트를 추가하세요.
- **저작권 원칙**: 커뮤니티 회로는 토폴로지/부품값(기능적 사실)만 참고해 직접 재구성하고, 상표명
  대신 "~스타일"로 표기합니다 — [docs/plan-circuit-archive.md](../../docs/plan-circuit-archive.md) 참고.
