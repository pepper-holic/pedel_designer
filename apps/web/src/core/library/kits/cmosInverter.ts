import type { Element } from "../../solver/types";
import type { LayoutSpot } from "../types";

/**
 * Open-loop voltage gain of an unbuffered CMOS inverter (CD4049UBE / CD4069UBE) held in its linear region at 9V: the
 * datasheet transfer curves and Red Llama-style measurements put it around 20-30. The buffered (B-suffix) parts are much
 * higher and switch rather than amplify; a kit that calls for a UBE part is modelled here as the UBE.
 */
export const INVERTER_GAIN = 25;
/** Divider that stands in for the inverter's switching threshold at half the supply (ideal: no current into a CMOS gate). */
const THRESHOLD_DIVIDER = 100_000;

/** [input pin, output pin] of each inverter, plus the supply pins, by package. */
type InverterPinout = { vdd: string; vss: string; inverters: readonly (readonly [string, string])[] };
const CD4049: InverterPinout = { vdd: "1", vss: "8", inverters: [["3", "2"], ["5", "4"], ["7", "6"], ["9", "10"], ["11", "12"], ["14", "15"]] };
const CD4069: InverterPinout = { vdd: "14", vss: "7", inverters: [["1", "2"], ["3", "4"], ["5", "6"], ["9", "8"], ["11", "10"], ["13", "12"]] };

export function inverterPinout(part: string): InverterPinout | undefined {
  const key = part.toUpperCase().replace(/\s+/g, "");
  if (/^(CD|HEF|HCF|MC1|TC|NJU)?4049/.test(key)) return CD4049;
  if (/^(CD|HEF|HCF|MC1|TC|NJU)?4069/.test(key)) return CD4069;
  return undefined;
}

export const isCmosInverter = (part: string): boolean => inverterPinout(part) !== undefined;

const resistor = (id: string, a: string, b: string, resistance: number): Element => ({ id, type: "resistor", nodes: [a, b], resistance });

/**
 * A hex inverter as solver elements: each inverter whose input and output pins are both wired becomes an inverting amplifier
 * (op-amp with + on the package's half-supply reference node, - on the input, open-loop gain INVERTER_GAIN) whose output
 * saturates smoothly at the supply pins' rails - the tanh clamp of the solver's rail-limited op-amp. With a feedback
 * resistor and no other DC path on the input, the stage self-biases at the point where in = out, i.e. just under Vdd/2,
 * as the real linear-mode inverter does. Inverters with only one pin wired (an unused input tied off) stamp nothing.
 * Channel ids are <ref>A..<ref>F in pin order; the reference divider is <ref>_rt1 / <ref>_rt2.
 */
export function inverterElements(ref: string, pinout: InverterPinout, pins: Record<string, string>, rails: { top: number; bottom: number }): Element[] {
  const vdd = pins[pinout.vdd];
  const vss = pins[pinout.vss];
  if (!vdd || !vss) throw new Error(`${ref}: a CMOS inverter needs its supply pins ${pinout.vdd} and ${pinout.vss}`);
  const mid = `${ref}_mid`;
  const channels = pinout.inverters.flatMap(([input, output], i): Element[] =>
    pins[input] && pins[output]
      ? [{ id: `${ref}${"ABCDEF"[i]}`, type: "opamp", nodes: [mid, pins[input], pins[output]], openLoopGain: INVERTER_GAIN, railPositive: rails.top, railNegative: rails.bottom }]
      : [],
  );
  if (channels.length === 0) throw new Error(`${ref}: no inverter has both its input and output pins wired`);
  return [resistor(`${ref}_rt1`, vdd, mid, THRESHOLD_DIVIDER), resistor(`${ref}_rt2`, mid, vss, THRESHOLD_DIVIDER), ...channels];
}

/** The reference divider sits under the first placed inverter (its op-amp symbol: + at -30,-20), out of the signal row. */
const INTERNAL_SPOTS: Record<string, LayoutSpot> = {
  rt1: { x: -90, y: 70, rotation: 90 },
  rt2: { x: -90, y: 130, rotation: 90 },
};

/** Spots for a package's internal elements, relative to the spot of its first inverter (or the bare ref). */
export function inverterSpots(ref: string, anchor: LayoutSpot): Record<string, LayoutSpot> {
  return Object.fromEntries(Object.entries(INTERNAL_SPOTS).map(([suffix, d]) => [`${ref}_${suffix}`, { ...d, x: anchor.x + d.x, y: anchor.y + d.y }]));
}
