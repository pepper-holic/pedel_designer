import type { PartInstance } from "./types";

/** SI prefixes checked largest-first so the first one the magnitude clears wins. */
const SI_PREFIXES: [exponent: number, symbol: string][] = [
  [12, "T"],
  [9, "G"],
  [6, "M"],
  [3, "k"],
  [0, ""],
  [-3, "m"],
  [-6, "µ"],
  [-9, "n"],
  [-12, "p"],
  [-15, "f"],
];

function trimTrailingZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** Formats a raw SI value (e.g. 4700, ohms) as engineering notation (e.g. "4.7k"). */
function formatEngineering(value: number, unit: string): string {
  if (value === 0) return `0${unit}`;
  const abs = Math.abs(value);
  for (const [exponent, symbol] of SI_PREFIXES) {
    const scale = 10 ** exponent;
    if (abs >= scale * 0.999) {
      const scaled = value / scale;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${trimTrailingZeros(scaled.toFixed(digits))}${symbol}${unit}`;
    }
  }
  return `${value}${unit}`;
}

/** Which param key holds each part type's headline value, and its base SI unit. */
const VALUE_PARAM: Partial<Record<PartInstance["type"], { key: string; unit: string }>> = {
  resistor: { key: "resistance", unit: "Ω" },
  capacitor: { key: "capacitance", unit: "F" },
  inductor: { key: "inductance", unit: "H" },
  potentiometer: { key: "resistance", unit: "Ω" },
};

/** The value label drawn under a part's schematic symbol (e.g. "4.7kΩ"), or null if this part type has no single headline value. */
export function partValueLabel(part: PartInstance): string | null {
  const meta = VALUE_PARAM[part.type];
  if (!meta) return null;
  const raw = part.params[meta.key];
  if (typeof raw !== "number") return null;
  return formatEngineering(raw, meta.unit);
}
