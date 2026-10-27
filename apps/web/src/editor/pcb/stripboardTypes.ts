/** A hole on the board: row 0 is the top strip, column 0 the left edge. */
export interface Hole {
  row: number;
  col: number;
}

export interface StripPin extends Hole {
  pad: string;
  /** Empty for a pad nothing connects to (an op-amp's unused pins). */
  net: string;
}

export interface StripPlacement {
  ref: string;
  value: string;
  footprintId: string;
  /**
   * How the part sits: `lead2` a two-lead part stood along a column, `inline` a TO-92 with its legs
   * down a column, `dip` an IC straddling cut strips, `flex` flying-lead pads for something mounted
   * off the board (jacks, pots, switches).
   */
  kind: "lead2" | "inline" | "dip" | "flex";
  pins: StripPin[];
  /** Holes covered by the body (not just its leads), for drawing and overlap checks. */
  body: { rowFrom: number; rowTo: number; colFrom: number; colTo: number } | null;
}

export interface StripJumper {
  net: string;
  a: Hole;
  b: Hole;
}

/**
 * A stripboard (Veroboard) layout: horizontal copper strips, one per row, split by cuts. A cut at a
 * hole drills the copper out there, so the strip is broken at that hole and the hole is unusable.
 */
export interface StripboardLayout {
  rows: number;
  cols: number;
  placements: StripPlacement[];
  cuts: Hole[];
  jumpers: StripJumper[];
}

/** "A".."Z", then "AA".. - the row naming every stripboard build guide uses. */
export function rowLabel(row: number): string {
  let label = "";
  let n = row;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

export const holeLabel = (h: Hole) => `${rowLabel(h.row)}${h.col + 1}`;
