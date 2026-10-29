const MULTIPLIER: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  r: 1,
  R: 1,
  k: 1e3,
  K: 1e3,
  M: 1e6,
};

/**
 * Parse a value as printed on a board or parts list: "4.7K", "4K7", "470R", "1M", "2M2", "220n",
 * "22uF", "4u7", "500p", "500mH". Throws on anything else so a typo in a kit map fails loudly.
 * (The unit letter F/H/Ω is ignored; "m" is milli, so "500mH" is 0.5.)
 */
export function parseValue(text: string): number {
  const s = text.trim().replace(/[FHΩ]$/i, "").replace(/ohm$/i, "");
  const plain = /^(\d+(?:\.\d+)?)([pnuµmrRkKM]?)$/.exec(s);
  if (plain) return Number(plain[1]) * (plain[2] ? MULTIPLIER[plain[2]] : 1);
  const infix = /^(\d+)([pnuµmrRkKM])(\d+)$/.exec(s);
  if (infix) return Number(`${infix[1]}.${infix[3]}`) * MULTIPLIER[infix[2]];
  throw new Error(`unreadable component value "${text}"`);
}

/** "B100K" -> taper B, 100kΩ. A bare value is taken as linear (B). */
export function parsePot(text: string): { taper: "A" | "B" | "C"; resistance: number } {
  const m = /^([ABC])?(.+)$/.exec(text.trim());
  if (!m) throw new Error(`unreadable pot value "${text}"`);
  return { taper: (m[1] as "A" | "B" | "C" | undefined) ?? "B", resistance: parseValue(m[2]) };
}
