# 키트 기판 작업 전략 (2026-10-30)

현황표는 `docs/kit-progress.md`, 보류 메모는 `docs/kit-deferred.md`, 절차는 `.claude/skills/pcb-to-netlist/SKILL.md`.

## 현황 (묶음 9까지)

| 상태 | 수 | 뜻 |
|---|---|---|
| 변환 완료 | 64 | 앱 "키트 기판 회로"에 올라감 |
| 기록만 | 32 | 회로는 읽었지만 앱에 소자 모델이 없음 (ICL7660 13, MOSFET 9, LM386 5, CD4069 1, 기타 4) |
| 보류 | 33 | 기판 사진만으로는 넷을 확정 못 함 (실크 밑 트레이스·앵글 팟 러그·SMD 패드·변형 공용 기판) |
| 미착수 | 83 | 전부 100패드 이상, 사진 판독 성공률 묶음당 1~3개 |
| C등급 | 49 | 모델 없는 계열 (BBD·PT2399·OTA·광소자·전원 유틸) |

판매 회로라 회로 자체는 전부 정상이다. 막히는 원인은 두 가지뿐이다: (a) 사진에서 선을 못 읽음, (b) 앱에 소자 모델이 없음.

## 비용 원칙

- 기판 사진 판독은 이미지 토큰이 비싸고, 결과가 보류여도 비용은 든다. 가장 비싼 일이므로 맨 뒤로 미룬다.
- 판단이 필요한 일(회로 대조, 넷 확정)만 높은 추론 모델로, 코딩·스크립트·재분류는 낮은 비용 세션으로 돌린다.
- 사진을 볼 때는 `pads.py` 좌표 덤프로 넷을 먼저 세우고, 애매한 곳만 1~2장 확대한다. 사분면 4장을 습관적으로 보지 않는다.
- 묶음은 6개로 줄이고 묶음마다 커밋한다.

## 순서

### ① 소자 모델 추가 (코딩, 중간 추론) - 기록 32개를 한 번에 회로로

1. **전하펌프 전원 규약** - 완료(2026-10-30, 커밋 69a0c6d~410349c): `IC ICL7660 ...` 줄의 핀 5가 이상 -9V 레일(net vm9), `RAIL <pad> <V>`로
   18V/-18V 더블러 레일, `supply` 머리줄. 회로가 된 것: RANGER GE, BENDER III GE, Mark 4, Kantata, SOLA FACE GE, BUZZRITE GE(6개).
   남은 ICL7660 기판 6개(1969 GE, BENDER II GE, Secret Pre, 29 YUNA, Haunting FreQ, 1484 TWELVE)는 오프보드 배선·SMD 패드·고립 패드 문제라 ③으로.
   원래 계획: 대응표의 `IC ICL7660 ...` 줄을 변환기가 "이상 전압원"으로 바꾼다. 핀 5(VOUT)는 -V9, 펌프 캡(2-4)은 무시.
   18V 더블러 배선(Kantata)은 `supply 18` 같은 머리 줄로 레일 전압을 바꾼다. 양접지 Ge 퍼즈는 V9 패드가 -9V 넷이 되도록
   `io V9=...` 대신 `io VNEG=...`를 허용한다. 대상: RANGER GE, SOLA FACE GE, 1969 GE, BUZZRITE GE, BENDER II/III GE, Mark 4,
   Kantata, Secret Pre, 29 YUNA, Haunting FreQ, 1484 TWELVE(SMD라 보류), FUZZ FORGE 7K(양접지).
2. **MOSFET** - 완료(2026-10-30): 솔버 변경 없이 JFET 제곱법칙에 양의 핀치오프(=Vth)를 주어 2N7000(Vth 2.1, K 0.09)·BS170(Vth 2.0,
   K 0.12)을 `partModels.ts`에 등록하고, 변환기가 소스→드레인 바디 다이오드를 따로 붙인다(OCD 클리퍼가 바디 다이오드를 쓴다). 제너는
   `ZENER` 품번(순방향 다이오드)으로. 회로가 된 것: DOC Overdrive, Brown Charlie Childs, Time Peace, NEW ZENFIRE, NEW Z-DRIVE(5개).
   남은 4개(THIMBLE, ANDY PLUS, Dove Drive, ZEN GU DONG)는 오프보드 팟·숨은 트레이스 문제라 ③으로.
3. **LM386** - 완료(2026-10-31): `kits/lm386.ts`가 op-amp 둘과 내부 저항으로 근사(이득 20/200, 출력 바이어스는 6번 핀의 절반,
   1·8번 핀 회로와 무관). 회로가 된 것: RAM Fuzz, Jubilee, Green Punch, Papadumble, Feach Fuzz(5개). 같이 고친 것: 3단자 팟의 `AT`
   위치가 변환기에서 버려지던 버그(이제 모든 키트의 팟이 대응표 자리에 놓인다).
4. 각 단계마다 해당 기록용 맵을 정식 대응표로 바꾸고 키트 테스트 통과까지. 소자 하나 추가할 때 `tests/solver`에 단위 테스트 1개씩.

### ② C등급 재분류 (스크립트, 낮은 추론)

`batch_prepare.py`의 계열 분류가 틀린 것을 손으로 고친다: [1K] SHO(부스터, noise-gate로 분류), NEW FAT 부스터(compressor),
Octavia·OCB·OCTA CLASSIC·OCTA KING(옥타브 퍼즈는 트랜지스터·다이오드만이라 시뮬 가능), Black CAB·TWEED AMP 57·BLACK AMP 65
(앰프 시뮬 - 확인 필요). 나머지 C(BBD 코러스·PT2399 딜레이·OTA 컴프·광 트레몰로·전원 유틸)는 모델이 생길 때까지 범위 밖.

### ③ 보류 33개를 원본 회로도 대조로 (높은 추론, 기판당 중간 비용)

1. 원본 페달 공개 회로도를 찾는다(대부분 유명 클론: Timmy, KoT, RAT, Xotic RC, Cornish SS-2, Bloid, Euphoria, Simble...).
2. 회로도에서 넷리스트를 먼저 세우고, 부품값으로 기판 패드를 대응시킨다. 사진은 패드 좌표 덤프와 확대 1~2장만.
3. 같은 계열은 묶어서: KO-N AZS/UI(JRC4580 계열), RC BEAST/REAL CLEAN/BASS CLEAN(Xotic RC), NEW Cat/Dirty Cat(RAT), Duel B/Soulist(Duel A 기반).
4. SMD J201 기판(SON OF BEN, NEW MORNING, Green Soma)은 추출기에 "실크 밑 SMD 패드" 처리를 넣거나 G/S/D 넷을 손으로 적는다.

### ④ 미착수 83개 (가장 비쌈, 맨 뒤)

패드 수·고립 패드가 적은 순으로 6개씩. 고립 패드 10개 이상인 기판은 ③ 방식(회로도 먼저)으로 돌린다.

## 세션 배치

- ①②: 코딩·스크립트. 별도 세션(중간 비용 모델)에서 해도 된다. 변경 파일: `apps/web/src/core/solver/*`, `kits/partModels.ts`,
  `kits/kitToPreset.ts`, `.claude/skills/pcb-to-netlist/scripts/kit_netlist.py`, 해당 `references/pcb-kits/maps/*.txt`.
- ③④: 회로 판단. 높은 추론 세션. 묶음 6개, 커밋 단위 유지.

## 다음 할 일

①·② 완료. ③은 2026-10-31에 8개를 회로로 만들고 나머지는 원본 회로도가 필요한 지점을 `kit-deferred.md` 끝에 적었다. 다음은 ④ 미착수(패드 적은 순 6개씩).
④ 묶음 1(2026-10-31): West Breeze, Brown Sound II, OCB, Parsley Drive, OCTA CLASSIC을 회로로, ALMOST CLEAN은 RC/AC 공용 기판이라 보류.
OCTA CLASSIC은 TONE 가변저항이 두 캡 사이에 떠 있어(직류 섬) 변환기가 그런 섬을 감싼 캡에만 1GΩ 누설을 넣도록 했다(`kits/dcIslands.ts`).
④ 묶음 2: Brown Charlie, Black CAB, KONISH P-1, BXM Boost, Honey Beast, Abracadabra를 회로로, 14개(BIG 프리앰프 5종 포함)는 보류.
미착수 남은 64개는 고립 패드·최대 넷 크기 순으로 정렬해 다음 묶음을 고른다(사진 판독 성공률이 묶음당 절반 정도).
Octavia는 오디오 트랜스포머(42TM022) - 대응표 `T` 줄과 `kits/transformer.ts`로 해결(2026-10-31).
④ 2차(B·C등급 40개, 병렬 5세션 + 모델 1세션): 6개 회로, 나머지는 보류 태그([대조][팟라벨][오병합][모델][자료][다회로])로 분류. 미착수 0.

### ② 재분류 결과 (2026-10-30)

index.json·triage.json의 계열을 손으로 고쳐 B로 올림: [1K] SHO(buffer-boost, A등급), NEW FAT 부스터(buffer-boost), Octavia·OCB·OCTA CLASSIC·
OCTA KING(fuzz), Black CAB(eq, 캐비닛 필터만), BLACK AMP 65·TWEED AMP 57(overdrive, 앰프 인 어 박스). 나머지 C 40개(BBD·PT2399·OTA·광소자·
전원 유틸·노이즈게이트)는 모델이 생길 때까지 범위 밖. `batch_prepare.py`를 다시 돌리면 index.json의 계열이 기준이라 유지된다.

## 판독 문제 5종과 처리 (2026-10-31 검토)

| # | 문제 | 처리 |
|---|---|---|
| 1 | 안 쓰는 IC 핀·빈 러그가 고립 목록에 섞임 | 추출기가 "동박 0" 패드를 `unconnected`로 분리, 뼈대에 따로 표시 → NC |
| 2 | 라벨만 있는 더미 풋프린트(1969 GE CONTOUR/INPUT) | 동박이 없으면 NC. 배선도 찾지 않음 |
| 3 | 글자·층 교차 밑으로 숨은 동박 | 반투명 실크의 기색(올리브/청록→녹색)으로 교차를 잇고, 글자 밑은 힌트로 제안 |
| 4 | SMD 패드가 없음 | `--smd` 가상 패드(SMD 키트만) |
| 5 | 팟 라벨 없음 | `fetch_photo.py`로 상품 사진을 받아 노브 순서로 배정 |

남는 것은 원본에만 있는 값 정보(팟 값 배분, 변형 공용 기판의 미표기 저항)뿐이며, 이것은 원본 회로도 대조(③)로 간다.

