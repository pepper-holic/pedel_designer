import { GROUND } from "../../core/solver/types";
import type { Netlist } from "../../core/solver/types";
import { applyTaper } from "../taper";
import { IN_OUT, type BlockDef } from "./types";

/** Single-knob passive low-pass: TONE sets the series resistance into a shunt cap. */
export const toneStackPassiveBlock: BlockDef = {
  id: "tone-stack-passive",
  label: "톤 (패시브 로우패스)",
  category: "tone",
  description: "가변 직렬 저항 + 션트 커패시터 - TONE을 올릴수록 밝아진다 (저역통과 코너가 올라감)",
  ports: IN_OUT,
  knobs: [{ kind: "rheostat", id: "TONE", label: "TONE", element: "Rtone", maxResistance: 100_000, reverse: true }],
  build: () => ({
    elements: [
      { id: "Rtone", type: "resistor", nodes: ["in", "out"], resistance: 50_000 },
      { id: "Cshunt", type: "capacitor", nodes: ["out", GROUND], capacitance: 4.7e-9 },
    ],
  }),
};

/**
 * Big Muff Pi tone: a low-pass (39k/10n) and a high-pass (3.9n/22k) blended by one pot. Its middle
 * position is the famous mid scoop - neither filter passes ~1kHz well.
 */
export const toneMuffBlock: BlockDef = {
  id: "tone-muff",
  label: "톤 (Big Muff 스타일 블렌드)",
  category: "tone",
  description: "로우패스와 하이패스를 TONE 노브로 섞는 톤 - 가운데에서 1kHz 부근이 깊게 파이는 미드 스쿱",
  ports: IN_OUT,
  knobs: [{ kind: "pot", id: "TONE", label: "TONE", upper: "Rta", lower: "Rtb", taper: "B" }],
  build: () => ({
    elements: [
      { id: "Rlp", type: "resistor", nodes: ["in", "lp"], resistance: 39_000 },
      { id: "Clp", type: "capacitor", nodes: ["lp", GROUND], capacitance: 10e-9 },
      { id: "Chp", type: "capacitor", nodes: ["in", "hp"], capacitance: 3.9e-9 },
      { id: "Rhp", type: "resistor", nodes: ["hp", GROUND], resistance: 22_000 },
      // Pot lug a on the low-pass side: turning up (towards b) goes bright.
      { id: "Rta", type: "resistor", nodes: ["lp", "out"], resistance: 50_000 },
      { id: "Rtb", type: "resistor", nodes: ["out", "hp"], resistance: 50_000 },
    ],
  }),
};

interface TmbValues {
  slope: number;
  trebleCap: number;
  bassCap: number;
  midCap: number;
  treblePot: number;
  bassPot: number;
  midPot: number;
}

/**
 * The Fender/Marshall three-knob passive stack (the topology analysed in Yeh & Smith's Bassman tone
 * stack paper): treble pot fed through a small cap, bass and mid as variable resistors under it,
 * all hung off one slope resistor. Knobs start at noon.
 */
function tmbStack(v: TmbValues): () => Netlist {
  const noonA = applyTaper("A", 0.5);
  return () => ({
    elements: [
      { id: "C1", type: "capacitor", nodes: ["in", "t3"], capacitance: v.trebleCap },
      // Treble pot: lug a at the bottom of the stack, lug b at the treble cap, wiper = output.
      { id: "Rtra", type: "resistor", nodes: ["t1", "out"], resistance: v.treblePot * noonA },
      { id: "Rtrb", type: "resistor", nodes: ["out", "t3"], resistance: v.treblePot * (1 - noonA) },
      { id: "Rslope", type: "resistor", nodes: ["in", "n2"], resistance: v.slope },
      { id: "C2", type: "capacitor", nodes: ["n2", "t1"], capacitance: v.bassCap },
      { id: "C3", type: "capacitor", nodes: ["n2", "n3"], capacitance: v.midCap },
      { id: "Rbass", type: "resistor", nodes: ["t1", "n3"], resistance: v.bassPot * noonA },
      { id: "Rmid", type: "resistor", nodes: ["n3", GROUND], resistance: v.midPot * 0.5 },
    ],
  });
}

function tmbKnobs(v: TmbValues) {
  return [
    { kind: "pot" as const, id: "TREBLE", label: "TREBLE", upper: "Rtra", lower: "Rtrb", taper: "A" as const },
    { kind: "rheostat" as const, id: "BASS", label: "BASS", element: "Rbass", maxResistance: v.bassPot, taper: "A" as const },
    { kind: "rheostat" as const, id: "MID", label: "MID", element: "Rmid", maxResistance: v.midPot, taper: "B" as const },
  ];
}

const FENDER: TmbValues = { slope: 56_000, trebleCap: 250e-12, bassCap: 20e-9, midCap: 20e-9, treblePot: 250_000, bassPot: 1_000_000, midPot: 25_000 };
const MARSHALL: TmbValues = { slope: 33_000, trebleCap: 470e-12, bassCap: 22e-9, midCap: 22e-9, treblePot: 220_000, bassPot: 1_000_000, midPot: 22_000 };

export const toneFenderBlock: BlockDef = {
  id: "tone-fender-tmb",
  label: "톤 스택 (Fender 스타일 3밴드)",
  category: "tone",
  description: "트레블·베이스·미드 패시브 톤스택 (Bassman 계열 값). 앞단은 낮은 임피던스로 구동해야 설계대로 동작",
  ports: IN_OUT,
  knobs: tmbKnobs(FENDER),
  build: tmbStack(FENDER),
};

export const toneMarshallBlock: BlockDef = {
  id: "tone-marshall-tmb",
  label: "톤 스택 (Marshall 스타일 3밴드)",
  category: "tone",
  description: "같은 구조에 Marshall 계열 값(33k 슬로프, 470pF) - Fender보다 미드가 덜 파이고 고음이 밝다",
  ports: IN_OUT,
  knobs: tmbKnobs(MARSHALL),
  build: tmbStack(MARSHALL),
};

export const TONE_BLOCKS = [toneStackPassiveBlock, toneMuffBlock, toneFenderBlock, toneMarshallBlock];
