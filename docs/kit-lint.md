# 키트 회로 구조 lint (2026-10-31)

변환된 152개 회로 JSON을 `lint_circuit.py`로 검사한 결과. 다시 돌리기:

```bash
python -E -P .claude/skills/pcb-to-netlist/scripts/lint_circuit.py apps/web/src/core/library/kits/circuits/*.json
python -E -P .claude/skills/pcb-to-netlist/scripts/stage_vocab.py check
```

검사 항목(코드): `floating` 캡만 닿는 뜬 노드, `one-lead` 부품 하나만 닿는 넷, `short` 양 리드가 한 넷인 부품,
`pot` 와이퍼·양 러그가 한 넷인 팟, `opamp-rail` op-amp 입력이 레일 직결(단일 전원의 접지 포함, 쓰지 않는 반쪽 제외),
`opamp-bias` op-amp 입력에 직류 경로 없음, `opamp-fb` 출력이 부품 3개 안에 −입력으로 돌아오지 않음,
`drivers` op-amp 출력이 다른 출력·이미터와 한 넷, `base-bias` 트랜지스터 베이스/게이트에 바이어스 경로 없음,
`bom` 맵의 BOM 줄과 부품 줄 개수 차이, `map-json` 회로 JSON과 맵의 부품 차이, `stage` STAGE 어휘 위반·없는 부품·소속 없음/중복.
DC 수렴·컬렉터 전압·신호 통과·배치·노브는 `kit-circuits.test.ts`가 보므로 넣지 않았다.

검사는 일부러 망가뜨린 회로(팟 와이퍼 단락, 베이스 바이어스 저항 제거, op-amp −입력을 9V에, 귀환 제거, 캡 사이 뜬 노드,
op-amp 출력과 이미터 합침, 맵과 다른 부품)로 모두 잡히는 것을 확인했다.

## 결과: 경고 6건 (기판 5개)

처음 돌렸을 때 명백한 맵 오류 2건이 나와 고쳤다(아래 "고친 것"). 남은 6건:

### SoLa Face BC108c (`pp-sola-face-bc108`, 186788496) - 확인 필요

- `one-lead` BIAS 트리머의 러그 13·와이퍼 12 넷(n9)이 기판 위 3패드 자리 0-1-2의 0번으로만 이어진다. 1·2번은 470R/10n
  분기점(7·8)과 같은 넷이라, 그 자리에 무언가 놓여야 Q2 컬렉터 부하(470R→?→트리머→1K)가 이어진다. 지금 회로는 Q2 컬렉터에
  직류 부하가 없다(DC 테스트는 수렴해서 통과). 같은 계열 SOLA GE FACE(186788521)는 이 자리에 B5K BIAS2 팟을 둔다 - 이 기판의
  B5K가 FUZZ가 아니라 BIAS2 자리 팟일 수 있다(맵 주석은 "0-1-2는 안 쓰는 두 번째 퍼즈 자리, B1K 미포함"). 키트 설명서·사진으로
  0-1-2에 무엇이 들어가는지 확인한 뒤 고친다.

### LuNa Face BC109c (`pp-luna-face-bc109c`, 186788497) - 확인 필요

- `one-lead` SoLa Face BC108c와 같은 기판·같은 맵 구조라 같은 문제.

### EX 부스터 (`pp-ex-booster`, 186786840) - 의도된 것

- `short` R7 15K, R13 18K: 딥스위치 BRIGHT·BST를 켠 위치로 고정(JUMP 47 48, 28 29)해서 단락된 저항. 맵 주석대로다.

### PEANUT DRIVE (`pp-peanut-drive`, 186787487) - 의도된 것

- `short` R6 1M(0-17): BOOST 스위치를 31 위치로 고정해 팝 방지 1M의 양끝이 모두 접지가 됐다. 맵 주석대로다.

### SOVEREIGN (`pp-sovereign`, 186787486) - 의도된 것으로 보임

- `short` R7 1M(23-1): PEANUT과 같은 J201 계열의 BST 스위치 고정(JUMP 43 36) 뒤 양끝이 접지인 1M. 팝 방지 저항으로 보이나
  맵 주석에 따로 적혀 있지 않다.

## 고친 것

- **King Cat** (186787483): `C 150n 24 13` → `C 150n 23 24`, NC에서 23을 뺐다. 렌더에서 150n 몸통은 패드 23(Q1 컬렉터 넷)과
  24(Q2 베이스) 사이인데 13(3.9K 끝, Q2 베이스와 같은 넷)으로 적혀 Q1→Q2 결합 캡이 단락돼 있었다(`short`).
- **NEW Valve 808** (186788110): `JUMP 1 16` 삭제. 링 추출 전 패드 1(100R)이 고립이던 때의 추측 JUMP가 op-amp B 출력(7번 핀,
  1000n 16)과 출력 버퍼 이미터(100R 1·Q1 e 6·10K 12)를 합치고 있었다(`drivers`). 렌더에서 1은 6과만 이어진다. 고친 뒤 TS-808
  회로도와 연결이 일치해 금메달 세트에 넣었다.

## STAGE 어휘 정리

66개 맵의 STAGE 줄을 고쳤다(넷리스트는 그대로, 회로 JSON은 `kit_netlist.py`로 다시 만들어 stages 외 내용이 같은지 확인).
fuzz 39줄 → gain 36·custom octave 3, control 2줄 → custom, custom 58줄에 접두어(control 27, bias 13, feedback 8, filter 7,
mix 3, octave 3, osc 1). 어휘와 소자 소속 기준은 SKILL.md 2절.

## 맵과 지금의 추출이 어긋나는 기판

`references/pcb-kits/<goods>/board0_nets.json`(지금 추출)으로 맵을 다시 변환하면 커밋된 JSON과 넷리스트가 달라지는 기판이 6개다.
맵이 다른 이미지나 예전 추출 기준이라 그렇다(Fuzzy Face 맵의 `image ff_pcb.jpg`). 커밋된 JSON이 기준이니 이 기판들은
`kit_netlist.py`로 통째로 다시 만들지 말고, 맵을 고칠 때는 패드 번호부터 지금 추출에 맞춘다(이번 STAGE 정리는 stages만 옮겼다).

- pp-andy-1k, pp-bomb-1k, pp-dirty-bom, pp-fuzzy-face, pp-od-one, pp-x-touch

## 병합 뒤 추가 경고 (2026-10-31, 새로 등록한 회로 포함)

- short(두 리드가 같은 넷): EX Booster R7(n7)·R13(out), REVVOLUTION G2 C16(n34), Peanut Drive R6(접지), Sovereign R7(접지) - 맵의 패드 번호 오류 가능성, 렌더로 확인.
- one-lead: Luna Face BC109C·Sola Face BC108의 BIAS 팟 러그 1·2만 있는 넷 - 러그 하나가 빈 자리인지 확인.
- REVVOLUTION G2: U2.6에 레일까지 직류 경로 없음, U2B 출력이 −입력으로 3부품 안에 안 돌아옴 - 귀환망 판독 재확인.
