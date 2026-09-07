import { ACTIVE_PREAMP_PICKUP, PAF_STYLE_HUMBUCKER } from "../../core/library/deviceModels";
import type { WiringPreset } from "./types";

/**
 * Onboard active circuits. Unlike the passive wirings these are driven by a plain signal source
 * rather than a pickup, so the circuit's own response is what you see - a pickup's resonance would
 * sit on top of it and confuse the comparison.
 *
 * The op-amps are the ideal model: an onboard preamp runs well inside its limits at instrument
 * level, so slew rate and rail clipping are not what shapes the sound here.
 */

/** Mid notch centre: 1/(2*pi*sqrt(L*C)) with L = 1H and C = 0.1uF, ~503 Hz. Both mid-cut presets
 * below are built to land here, one with a real inductor and one with a gyrator. */
const MID_CAP_F = 100e-9;
/** Resistance in series with the real inductor, matching the gyrator's R2 so the two circuits have
 * comparable loss and therefore comparable notch depth, not just the same centre frequency. */
const MID_LOSS_OHMS = 1_000;

/**
 * Mid cut built the obvious way: a series L-C to ground. At resonance the pair is a near short, so
 * the signal node is pulled down and a notch appears. Real onboard EQs rarely do this - an audio
 * inductor is bulky and expensive - which is exactly why the gyrator version below exists.
 */
export const midCutRealInductor: WiringPreset = {
  id: "wiring-mid-cut-inductor",
  name: "미드 컷 (실제 인덕터)",
  description: "직렬 LC를 접지로 내려 만든 미드 노치. 1H + 0.1uF로 약 500Hz에 딥이 생깁니다.",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rs", terminalId: "b" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "V1", type: "vsource", x: 120, y: 200, rotation: 0, params: { voltage: 0 }, role: "signalSource" },
      { id: "Rs", type: "resistor", x: 280, y: 200, rotation: 0, params: { resistance: 10_000 } },
      { id: "Cmid", type: "capacitor", x: 420, y: 300, rotation: 0, params: { capacitance: MID_CAP_F } },
      { id: "Lmid", type: "inductor", x: 420, y: 380, rotation: 0, params: { inductance: 1 } },
      { id: "Rq", type: "resistor", x: 420, y: 460, rotation: 0, params: { resistance: MID_LOSS_OHMS } },
      { id: "Rload", type: "resistor", x: 560, y: 200, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 120, y: 290, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 450, y: 540, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 590, y: 280, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wm1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Rs", terminalId: "a" } },
      { id: "wm2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wm3", a: { partId: "Rs", terminalId: "b" }, b: { partId: "Cmid", terminalId: "a" } },
      { id: "wm4", a: { partId: "Cmid", terminalId: "b" }, b: { partId: "Lmid", terminalId: "a" } },
      { id: "wm5", a: { partId: "Lmid", terminalId: "b" }, b: { partId: "Rq", terminalId: "a" } },
      { id: "wm6", a: { partId: "Rq", terminalId: "b" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wm7", a: { partId: "Rs", terminalId: "b" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wm8", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
};

/**
 * The same mid notch with the inductor replaced by a gyrator - an op-amp, two resistors and a cap
 * that together look like a grounded inductor of L = R1 * R2 * Cg. With R1 = 100k, R2 = 1k and
 * Cg = 10nF that is 1H, the same value the preset above uses as a physical part.
 *
 * This is how every real onboard mid control is built, and loading the two presets back to back is
 * the point: the curves land on top of each other, which is the whole claim behind the substitution.
 */
export const midCutGyrator: WiringPreset = {
  id: "wiring-mid-cut-gyrator",
  name: "미드 컷 (자이레이터 = 인덕터 시뮬레이션)",
  description:
    "위 회로의 인덕터를 op-amp 자이레이터(L = R1 x R2 x Cg = 1H)로 대체한 구성. 두 프리셋을 번갈아 불러오면 응답이 거의 겹칩니다.",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rs", terminalId: "b" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "V1", type: "vsource", x: 120, y: 200, rotation: 0, params: { voltage: 0 }, role: "signalSource" },
      { id: "Rs", type: "resistor", x: 280, y: 200, rotation: 0, params: { resistance: 10_000 } },
      { id: "Cmid", type: "capacitor", x: 420, y: 300, rotation: 0, params: { capacitance: MID_CAP_F } },
      // Gyrator: Cg to the op-amp's non-inverting input, R1 from there to ground, unity-gain
      // follower, and R2 back to the node. Together they present s*(R1*R2*Cg) - an inductor.
      { id: "Cg", type: "capacitor", x: 420, y: 400, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "R1", type: "resistor", x: 420, y: 500, rotation: 0, params: { resistance: 100_000 } },
      { id: "U1", type: "opamp", x: 600, y: 400, rotation: 0, params: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
      { id: "R2", type: "resistor", x: 600, y: 300, rotation: 0, params: { resistance: 1_000 } },
      { id: "Rload", type: "resistor", x: 560, y: 200, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 120, y: 290, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 450, y: 580, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 590, y: 130, rotation: 0, params: {} },
      { id: "G4", type: "ground", x: 570, y: 480, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wg1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Rs", terminalId: "a" } },
      { id: "wg2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wg3", a: { partId: "Rs", terminalId: "b" }, b: { partId: "Cmid", terminalId: "a" } },
      { id: "wg4", a: { partId: "Cmid", terminalId: "b" }, b: { partId: "Cg", terminalId: "a" } },
      { id: "wg5", a: { partId: "Cg", terminalId: "b" }, b: { partId: "R1", terminalId: "a" } },
      { id: "wg6", a: { partId: "R1", terminalId: "b" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wg7", a: { partId: "Cg", terminalId: "b" }, b: { partId: "U1", terminalId: "inPlus" } },
      { id: "wg8", a: { partId: "U1", terminalId: "out" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "wg9", a: { partId: "U1", terminalId: "out" }, b: { partId: "R2", terminalId: "b" } },
      { id: "wg10", a: { partId: "R2", terminalId: "a" }, b: { partId: "Cmid", terminalId: "b" } },
      { id: "wg11", a: { partId: "Rs", terminalId: "b" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wg12", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
};

/**
 * Active two-band tone control in the Baxandall arrangement: one inverting op-amp with both pots
 * bridging input and feedback, so each knob shifts the ratio between them instead of just throwing
 * signal away. That is what "active" buys - the same knob can boost as well as cut.
 *
 * Cbass sits across the bass pot: above its corner it shorts the pot's two ends together, so the
 * bass knob stops acting and the stage goes flat. The treble pot is reached through caps instead,
 * so it does nothing at low frequencies and takes over where the bass section has let go.
 *
 * Both pots are wired with their output-side lug on "a", so position 1 is boost and 0 is cut.
 */
export const activeTwoBandEq: WiringPreset = {
  id: "wiring-active-2band-eq",
  name: "온보드 액티브 2밴드 (베이스/트레블)",
  description:
    "인버팅 op-amp 하나에 베이스·트레블 포트를 입력과 피드백에 걸쳐 놓은 Baxandall 구성. 각 노브가 부스트와 컷을 모두 합니다(1 = 부스트, 0 = 컷).",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rf_treble", terminalId: "a" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "V1", type: "vsource", x: 120, y: 300, rotation: 0, params: { voltage: 0 }, role: "signalSource" },
      { id: "Rin_bass", type: "resistor", x: 280, y: 220, rotation: 0, params: { resistance: 10_000 } },
      { id: "Rf_bass", type: "resistor", x: 700, y: 220, rotation: 0, params: { resistance: 10_000 } },
      { id: "BASS", type: "potentiometer", x: 490, y: 160, rotation: 0, params: { resistance: 100_000, position: 0.5, taper: "B" } },
      { id: "Cbass", type: "capacitor", x: 490, y: 260, rotation: 0, params: { capacitance: 4.7e-9 } },
      { id: "Cin_treble", type: "capacitor", x: 280, y: 420, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "Cf_treble", type: "capacitor", x: 700, y: 420, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "TREBLE", type: "potentiometer", x: 490, y: 480, rotation: 0, params: { resistance: 100_000, position: 0.5, taper: "B" } },
      { id: "U1", type: "opamp", x: 860, y: 320, rotation: 0, params: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
      { id: "Rf_treble", type: "resistor", x: 1000, y: 320, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 120, y: 390, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 830, y: 250, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 1030, y: 400, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wa1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Rin_bass", terminalId: "a" } },
      { id: "wa2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
      // Bass section: input and feedback meet at the two ends of the pot, wiper into the summing node.
      { id: "wa3", a: { partId: "Rin_bass", terminalId: "b" }, b: { partId: "BASS", terminalId: "b" } },
      { id: "wa4", a: { partId: "Rf_bass", terminalId: "a" }, b: { partId: "BASS", terminalId: "a" } },
      { id: "wa5", a: { partId: "BASS", terminalId: "wiper" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "wa6", a: { partId: "Cbass", terminalId: "a" }, b: { partId: "BASS", terminalId: "b" } },
      { id: "wa7", a: { partId: "Cbass", terminalId: "b" }, b: { partId: "BASS", terminalId: "a" } },
      // Treble section: same shape, reached through caps so it only acts up high.
      { id: "wa8", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Cin_treble", terminalId: "a" } },
      { id: "wa9", a: { partId: "Cin_treble", terminalId: "b" }, b: { partId: "TREBLE", terminalId: "b" } },
      { id: "wa10", a: { partId: "Cf_treble", terminalId: "a" }, b: { partId: "TREBLE", terminalId: "a" } },
      { id: "wa11", a: { partId: "TREBLE", terminalId: "wiper" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "wa12", a: { partId: "U1", terminalId: "inPlus" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wa13", a: { partId: "Rf_bass", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
      { id: "wa14", a: { partId: "Cf_treble", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
      { id: "wa15", a: { partId: "U1", terminalId: "out" }, b: { partId: "Rf_treble", terminalId: "a" } },
      { id: "wa16", a: { partId: "Rf_treble", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
};

/**
 * An active pickup on a long cable. Its built-in preamp drives the cable from a low impedance, so
 * the cable capacitance has nothing to resonate against and the response stays flat - which is the
 * practical reason active systems are indifferent to cable length.
 *
 * Load the passive presets with the same cable to see the other half of the comparison.
 */
export const activePickupLongCable: WiringPreset = {
  id: "wiring-active-pickup-long-cable",
  name: "액티브 픽업 + 긴 케이블",
  description:
    "프리앰프 내장 픽업이 6m급 케이블(900pF)을 구동하는 구성. 출력 임피던스가 낮아 공진이 생기지 않고 응답이 평탄합니다.",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rload", terminalId: "a" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU1", type: "pickup", x: 150, y: 220, rotation: 0, params: { ...ACTIVE_PREAMP_PICKUP } },
      { id: "Ccable", type: "capacitor", x: 350, y: 320, rotation: 0, params: { capacitance: 900e-12 } },
      { id: "Rload", type: "resistor", x: 420, y: 220, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 120, y: 300, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 380, y: 400, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 450, y: 300, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wac1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wac2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "Ccable", terminalId: "a" } },
      { id: "wac3", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wac4", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wac5", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
};

/** The passive counterpart to `activePickupLongCable`: identical cable and load, ordinary humbucker. */
export const passivePickupLongCable: WiringPreset = {
  id: "wiring-passive-pickup-long-cable",
  name: "패시브 픽업 + 긴 케이블 (비교용)",
  description: "위와 같은 케이블·부하에 패시브 험버커를 물린 비교 회로. 공진 피크와 그 위의 롤오프가 뚜렷하게 나타납니다.",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rload", terminalId: "a" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "PU1", type: "pickup", x: 150, y: 220, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
      { id: "Ccable", type: "capacitor", x: 350, y: 320, rotation: 0, params: { capacitance: 900e-12 } },
      { id: "Rload", type: "resistor", x: 420, y: 220, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 120, y: 300, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 380, y: 400, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 450, y: 300, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wpc1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "wpc2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "Ccable", terminalId: "a" } },
      { id: "wpc3", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "wpc4", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "wpc5", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
    ],
  },
};
