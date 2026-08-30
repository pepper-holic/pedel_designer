# Pedal Designer

기타 이펙트(오버드라이브/디스토션/부스트 계열) 회로를 웹에서 직접 조합하고,
그 자리에서 시뮬레이션하고, 부품 목록(BOM)과 PCB 넷리스트까지 뽑아낼 수 있는
스키매틱 에디터 겸 회로 시뮬레이터입니다.

```
블록/부품 조합 (스키매틱 에디터)
      ↓
시뮬레이션 (transient/AC, THD, 부품 공차 몬테카를로, 페달 체인)
      ↓
BOM 자동 생성
      ↓
PCB 넷리스트 생성 (KiCad export)
```

전체 컨셉과 진행 상황은 [docs/ROADMAP.md](docs/ROADMAP.md)를 참고하세요.

## 시작하기

```bash
npm install --prefix apps/web
npm run dev
```

`http://localhost:5173`에서 앱이 열립니다.

## 테스트

```bash
npm test
```

## 프로젝트 구조

- `apps/web` — React + TypeScript + Vite 프론트엔드 (스키매틱 에디터, 회로
  솔버, 프리셋 라이브러리 전부 포함)
- `docs` — 로드맵, 설계 결정 기록

## 라이선스

[LICENSE](LICENSE) 참고 — 현재 비공개(All rights reserved) 상태입니다.
