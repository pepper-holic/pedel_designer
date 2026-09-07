import { PAF_STYLE_HUMBUCKER } from "../../core/library/deviceModels";
import { GENERIC_SILICON_NPN } from "../../core/library/deviceModels";
import type { PartInstance, Wire } from "../types";
import type { WiringPreset } from "./types";

/**
 * The guitar and the first pedal on one canvas.
 *
 * The pedal-chain panel runs stages one after another, handing each stage's output waveform to the
 * next as an ideal source - so it cannot show a later stage loading an earlier one. Between a
 * passive guitar and a low-impedance input that loading *is* the effect: it is why a fuzz cleans up
 * when you roll the volume back and why putting a buffer in front stops it doing that
 * (docs/plan-guitar-wiring.md §8).
 *
 * Because netlistFromGraph unions the whole canvas into one netlist, putting both on the same
 * canvas is all it takes to get the interaction right - no chaining, no special case.
 */

/** Common-emitter stage biased for roughly 0.5mA, which puts its input impedance in the same
 * single-digit-kilohm range as a vintage fuzz's first transistor. */
const FUZZ_BIAS_RESISTANCE = 2_200_000;
const FUZZ_COLLECTOR_RESISTANCE = 10_000;

function guitarParts(): PartInstance[] {
  return [
    { id: "PU1", type: "pickup", x: 120, y: 220, rotation: 0, params: { ...PAF_STYLE_HUMBUCKER } },
    { id: "VOL", type: "potentiometer", x: 300, y: 220, rotation: 0, params: { resistance: 500_000, position: 1, taper: "A" } },
    { id: "Ccable", type: "capacitor", x: 420, y: 320, rotation: 0, params: { capacitance: 470e-12 } },
    { id: "G_PU", type: "ground", x: 90, y: 300, rotation: 0, params: {} },
    { id: "G_VOL", type: "ground", x: 270, y: 300, rotation: 0, params: {} },
    { id: "G_CABLE", type: "ground", x: 450, y: 400, rotation: 0, params: {} },
  ];
}

function guitarWires(): Wire[] {
  return [
    { id: "wgp1", a: { partId: "PU1", terminalId: "gnd" }, b: { partId: "G_PU", terminalId: "gnd" } },
    { id: "wgp2", a: { partId: "PU1", terminalId: "hot" }, b: { partId: "VOL", terminalId: "b" } },
    { id: "wgp3", a: { partId: "VOL", terminalId: "a" }, b: { partId: "G_VOL", terminalId: "gnd" } },
    { id: "wgp4", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "Ccable", terminalId: "a" } },
    { id: "wgp5", a: { partId: "Ccable", terminalId: "b" }, b: { partId: "G_CABLE", terminalId: "gnd" } },
  ];
}

/** The transistor input stage, fed from `inputTerminal`. Kept in one place so the direct and
 * buffered presets differ only in what feeds it. */
function fuzzInputStage(feedFrom: { partId: string; terminalId: string }): { parts: PartInstance[]; wires: Wire[] } {
  return {
    parts: [
      { id: "Cin", type: "capacitor", x: 620, y: 220, rotation: 0, params: { capacitance: 100e-9 } },
      { id: "Q1", type: "bjt", x: 800, y: 260, rotation: 0, params: { polarity: "npn", ...GENERIC_SILICON_NPN } },
      { id: "Rb", type: "resistor", x: 760, y: 120, rotation: 0, params: { resistance: FUZZ_BIAS_RESISTANCE } },
      { id: "Rc", type: "resistor", x: 900, y: 120, rotation: 0, params: { resistance: FUZZ_COLLECTOR_RESISTANCE } },
      { id: "Vcc", type: "vsource", x: 1020, y: 120, rotation: 0, params: { voltage: 9 }, role: "supply" },
      { id: "G_Q", type: "ground", x: 850, y: 370, rotation: 0, params: {} },
      { id: "G_VCC", type: "ground", x: 1020, y: 220, rotation: 0, params: {} },
    ],
    wires: [
      { id: "wfz1", a: feedFrom, b: { partId: "Cin", terminalId: "a" } },
      { id: "wfz2", a: { partId: "Cin", terminalId: "b" }, b: { partId: "Q1", terminalId: "base" } },
      { id: "wfz3", a: { partId: "Rb", terminalId: "a" }, b: { partId: "Q1", terminalId: "base" } },
      { id: "wfz4", a: { partId: "Rb", terminalId: "b" }, b: { partId: "Vcc", terminalId: "positive" } },
      { id: "wfz5", a: { partId: "Rc", terminalId: "a" }, b: { partId: "Q1", terminalId: "collector" } },
      { id: "wfz6", a: { partId: "Rc", terminalId: "b" }, b: { partId: "Vcc", terminalId: "positive" } },
      { id: "wfz7", a: { partId: "Q1", terminalId: "emitter" }, b: { partId: "G_Q", terminalId: "gnd" } },
      { id: "wfz8", a: { partId: "Vcc", terminalId: "negative" }, b: { partId: "G_VCC", terminalId: "gnd" } },
    ],
  };
}

const stage = fuzzInputStage({ partId: "VOL", terminalId: "wiper" });

/**
 * Guitar straight into the transistor stage. The stage's few-kilohm input impedance sits directly
 * across the volume pot, so the knob changes tone as well as level.
 */
export const guitarIntoFuzzInput: WiringPreset = {
  id: "wiring-guitar-into-fuzz-input",
  name: "기타 → 퍼즈 입력단 직결 (로딩 상호작용)",
  description:
    "패시브 기타를 저임피던스 트랜지스터 입력단에 직접 물린 회로. 볼륨 노브가 음량뿐 아니라 톤까지 바꾸는 상호작용이 그대로 나타납니다.",
  category: "신호 경로",
  outputTerminal: { partId: "Q1", terminalId: "collector" },
  snapshot: {
    blocks: [],
    parts: [...guitarParts(), ...stage.parts],
    wires: [...guitarWires(), ...stage.wires],
  },
};

const bufferedStage = fuzzInputStage({ partId: "UBUF", terminalId: "out" });

/** The same two halves with a unity-gain buffer between them. The buffer's high input impedance
 * hides the transistor stage from the guitar, so the volume knob goes back to being just a level
 * control - the trade every "should I put a buffer first?" argument is about. */
export const guitarIntoBufferedInput: WiringPreset = {
  id: "wiring-guitar-into-buffered-input",
  name: "기타 → 버퍼 → 퍼즈 입력단 (비교용)",
  description:
    "위 회로 사이에 버퍼를 넣은 구성. 버퍼가 기타에서 뒷단을 가려 볼륨 노브가 음량만 바꾸게 됩니다.",
  category: "신호 경로",
  outputTerminal: { partId: "Q1", terminalId: "collector" },
  snapshot: {
    blocks: [],
    parts: [
      ...guitarParts(),
      { id: "UBUF", type: "opamp", x: 520, y: 220, rotation: 0, params: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
      ...bufferedStage.parts,
    ],
    wires: [
      ...guitarWires(),
      { id: "wbuf1", a: { partId: "VOL", terminalId: "wiper" }, b: { partId: "UBUF", terminalId: "inPlus" } },
      { id: "wbuf2", a: { partId: "UBUF", terminalId: "out" }, b: { partId: "UBUF", terminalId: "inMinus" } },
      ...bufferedStage.wires,
    ],
  },
};
