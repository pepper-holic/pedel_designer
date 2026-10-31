import type { CoupledInductorsElement } from "../../solver/types";
import type { transformerModel } from "./partModels";

type Transformer = NonNullable<ReturnType<typeof transformerModel>>;

/**
 * An audio transformer as coupled-inductor pairs. Pins: p1/p2 the primary ends, s1/s2 the secondary ends, and an optional
 * centre tap on one side (pct or sct).
 *
 * The solver's coupled pair has two windings, so a tapped side is built as two pairs that share the untapped winding,
 * one per half (the same trick as the Octavia-style archive preset). The shared winding then sits in parallel with itself,
 * so each copy gets twice its inductance, and each half gets half the full winding's inductance (not the physical quarter)
 * so it still sees half the full winding's voltage: per copy, sqrt(L_half / 2L_shared) = n/2. What the split leaves out is
 * the mutual between the two halves - small next to their coupling to the driven side when k is near 1.
 */
export function transformerElements(ref: string, model: Transformer, pins: Record<string, string>): CoupledInductorsElement[] {
  const { p1, p2, s1, s2, pct, sct } = pins;
  if (!p1 || !p2 || !s1 || !s2) throw new Error(`${ref}: a transformer needs p1, p2, s1, s2`);
  if (pct && sct) throw new Error(`${ref}: only one centre tap (pct or sct) can be modelled`);
  const { primaryInductance: lp, secondaryInductance: ls, coupling } = model;
  const pair = (id: string, nodes: CoupledInductorsElement["nodes"], inductanceA: number, inductanceB: number): CoupledInductorsElement => ({
    id,
    type: "coupledInductors",
    nodes,
    inductanceA,
    inductanceB,
    coupling,
  });
  // Both halves are entered start-to-end along the winding, so the two outer ends swing in antiphase about the tap.
  if (sct) return [pair(`${ref}A`, [p1, p2, s1, sct], 2 * lp, ls / 2), pair(`${ref}B`, [p1, p2, sct, s2], 2 * lp, ls / 2)];
  if (pct) return [pair(`${ref}A`, [p1, pct, s1, s2], lp / 2, 2 * ls), pair(`${ref}B`, [pct, p2, s1, s2], lp / 2, 2 * ls)];
  return [pair(ref, [p1, p2, s1, s2], lp, ls)];
}
