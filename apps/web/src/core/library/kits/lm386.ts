import type { Element } from "../../solver/types";
import type { LayoutSpot } from "../types";

/** Internal resistors of the LM386 (datasheet equivalent circuit): 15K feedback per side, 1.35K + 150R
 * between the gain pins, 50K input pulldowns. Gain = 2*15K / (150 + 1.35K || Z18): 20 open, ~200 with a cap. */
const FEEDBACK = 30_000;
const GAIN_PINS = 1_350;
const EMITTER = 150;
const INPUT_PULLDOWN = 50_000;
/** Bias injection: a node at -V6 feeds pin 8 through twice the feedback resistance, so the output settles at V6/2. */
const BIAS_INJECT = 2 * FEEDBACK;
const BIAS_DIVIDER = 400_000;
/** About 4mA of quiescent current at 9V (datasheet 4mA typ): what makes a series "sag" resistor starve the chip. */
const QUIESCENT_LOAD = 2_200;
/** Pin 7 (bypass) taps the supply through 15K + 15K inside the chip. */
const BYPASS_DIVIDER = 15_000;
/** Output swing stops this far short of each rail into a pedal's high-impedance load. */
export const LM386_HEADROOM = 0.7;

export const isLm386 = (part: string): boolean => /^(LM|JRC|NJM)?386/.test(part.toUpperCase().replace(/\s+/g, ""));

const resistor = (id: string, a: string, b: string, resistance: number): Element => ({ id, type: "resistor", nodes: [a, b], resistance });

/**
 * LM386 as solver elements: one op-amp (the chip, id = ref) set up as a non-inverting amp from pin 3 with the
 * internal 30K/1.35K/150R gain network on pins 5-8-1, the network's foot on pin 2 (through a follower unless
 * pin 2 is grounded, so a signal there sees the chip's 50K, not 1.5K). Both ends of the network sit at 0V DC,
 * so whatever hangs on pins 1 and 8 - a cap, R+C, or the two pins tied with a path to ground - carries no DC
 * and the output bias stays where the real chip keeps it: a second op-amp makes -V6 and feeds pin 8 through
 * 60K, which holds the output at half of whatever pin 6 sees (a sagging supply moves the bias too).
 * Pins 1, 7 and 8 may be left out; 2, 3, 5 and 6 are required. The rails follow `rails` (the nominal pin 6/pin 4
 * voltages). No bandwidth limit: the chip's 300kHz at a gain of 20 is far above audio, and the solver's GBW model
 * holds too little loop gain for the gain-200 setting.
 */
export function lm386Elements(ref: string, pins: Record<string, string>, rails: { top: number; bottom: number }): Element[] {
  const pin = (n: string): string => {
    const node = pins[n];
    if (!node) throw new Error(`${ref}: LM386 pin ${n} is not connected`);
    return node;
  };
  const [inMinus, inPlus, out, vs] = [pin("2"), pin("3"), pin("5"), pin("6")];
  const p1 = pins["1"] ?? `${ref}_p1`;
  const p8 = pins["8"] ?? `${ref}_p8`;
  const foot = inMinus === "0" ? "0" : `${ref}_foot`;
  const sense = `${ref}_sense`;
  const negative = `${ref}_neg`;
  const bypass = pins["7"];
  return [
    { id: ref, type: "opamp", nodes: [inPlus, p8, out], openLoopGain: 1e5, railPositive: rails.top - LM386_HEADROOM, railNegative: rails.bottom + LM386_HEADROOM },
    resistor(`${ref}_rf`, out, p8, FEEDBACK),
    resistor(`${ref}_r18`, p8, p1, GAIN_PINS),
    resistor(`${ref}_re`, p1, foot, EMITTER),
    ...(foot !== "0" ? [{ id: `${ref}_buf`, type: "opamp" as const, nodes: [inMinus, foot, foot] as [string, string, string], openLoopGain: 1e5 }] : []),
    { id: `${ref}_bias`, type: "opamp", nodes: ["0", sense, negative], openLoopGain: 1e5 },
    resistor(`${ref}_rbt`, vs, sense, BIAS_DIVIDER),
    resistor(`${ref}_rbf`, sense, negative, BIAS_DIVIDER),
    resistor(`${ref}_rm`, negative, p8, BIAS_INJECT),
    resistor(`${ref}_rq`, vs, "0", QUIESCENT_LOAD),
    ...(inPlus !== "0" ? [resistor(`${ref}_rin3`, inPlus, "0", INPUT_PULLDOWN)] : []),
    ...(inMinus !== "0" ? [resistor(`${ref}_rin2`, inMinus, "0", INPUT_PULLDOWN)] : []),
    ...(bypass ? [resistor(`${ref}_rb1`, vs, bypass, BYPASS_DIVIDER), resistor(`${ref}_rb2`, bypass, "0", BYPASS_DIVIDER)] : []),
  ];
}

/** Where the internal parts go relative to the chip (its op-amp symbol: + at -30,-20, - at -30,20, out at 30,0):
 * all under the chip - feedback, the gain chain down from the - input, the bias source and the pin-2 follower -
 * so the input stage on the left and the parts a kit hangs on pins 1/8 (keep those at x >= +90) stay clear. */
const INTERNAL_SPOTS: Record<string, LayoutSpot> = {
  rf: { x: 0, y: 60, rotation: 180 },
  r18: { x: -30, y: 100, rotation: 90 },
  re: { x: -30, y: 170, rotation: 90 },
  rm: { x: 30, y: 130, rotation: 270 },
  bias: { x: 30, y: 240 },
  rbf: { x: 30, y: 300 },
  rbt: { x: -60, y: 330 },
  rq: { x: -120, y: 360, rotation: 90 },
  buf: { x: -90, y: 250 },
  rin3: { x: -60, y: 10, rotation: 90 },
  rin2: { x: -150, y: 260, rotation: 90 },
  rb1: { x: -150, y: 330, rotation: 90 },
  rb2: { x: -150, y: 390, rotation: 90 },
};

/** Spots for an LM386's internal elements, clustered around the chip's own spot. */
export function lm386Spots(ref: string, chip: LayoutSpot): Record<string, LayoutSpot> {
  return Object.fromEntries(Object.entries(INTERNAL_SPOTS).map(([suffix, d]) => [`${ref}_${suffix}`, { ...d, x: chip.x + d.x, y: chip.y + d.y }]));
}
