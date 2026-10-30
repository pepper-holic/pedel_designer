# 키트 변환 보류 목록

트리아지 등급과 달리 실제로 크거나 읽기 어려워 뒤로 미룬 기판. 파일럿 스크래치 분석 메모를 옮겨 둔다.

## 186788016 Pluto Blue (TL072+TL071, 98패드)

- Pluto Blue (186788016) deferred: board0 image is a cropped instruction picture (59 pads); the full board is board1 (98 pads, TL072 + TL071).
- Findings so far (board1 pad ids): Vref net n9 (47K/47K + 100uF); op-amp A pins 25=out,33=-in,38=+in,45=gnd,26=V+;
- op-amp B 46=+in (trace from 10K pad 18, maybe also to diode node 52/61), 39=-in (220K 47, 6.8K 54), 34=out (D1 53, cyan to 70);
- TL071: 57,65,73,81 / 83,74,66,58 (65=-in with 10uF 41 + 6.8K 48, 73=+in biased 1M/1M+2.4K, 74=out lone, 66=V+);
- lone pads 18,35,40,46,55,57,58,70,74,83; red pads (LEVEL lug1 / 4.7uF -) are wired together off-board per seller note.

## 186787512 Wide Range (TL072 x2, A100K 듀얼 팟, 75패드)

- Catalinbread Varioboost 계열 파라메트릭 부스트. 두 TL072와 Freq 듀얼 팟("2=3" 표기: 2·3번 러그 묶음) 때문에 넷이 많다.
- 9개 고립 패드(1,3,5,8,15,18,20,24,36)는 팟 러그·실크 밑 트레이스. 다음 세션에서 사분면 확대(q1~q4.png 방식)로 읽을 것.
