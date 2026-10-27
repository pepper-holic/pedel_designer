import type { BoardNetlist } from "./boardNetlist";
import { holeLabel, type Hole, type StripboardLayout } from "./stripboardTypes";

export interface StripboardCheck {
  ok: boolean;
  problems: string[];
}

const key = (h: Hole) => `${h.row},${h.col}`;

/**
 * Reads the connectivity back out of a finished stripboard - copper strips as split by the cuts,
 * plus jumpers - and compares it with the circuit, independently of how the layout was made. A
 * wrong board is not a wrong sound, it is a pedal that does not work, so nothing is shown as
 * buildable without passing this.
 */
export function verifyStripboard(layout: StripboardLayout, board: BoardNetlist): StripboardCheck {
  const problems: string[] = [];
  const cutSet = new Set(layout.cuts.map(key));
  const used = new Map<string, string>();
  const inBounds = (h: Hole) => h.row >= 0 && h.row < layout.rows && h.col >= 0 && h.col < layout.cols;

  const claim = (h: Hole, who: string) => {
    if (!inBounds(h)) problems.push(`${who}: ${holeLabel(h)} 구멍이 보드 밖입니다.`);
    else if (cutSet.has(key(h))) problems.push(`${who}: ${holeLabel(h)}은(는) 컷으로 뚫린 구멍입니다.`);
    else if (used.has(key(h))) problems.push(`${who}: ${holeLabel(h)} 구멍을 ${used.get(key(h))}와(과) 같이 씁니다.`);
    else used.set(key(h), who);
  };
  for (const p of layout.placements) for (const pin of p.pins) claim(pin, `${p.ref}.${pin.pad}`);
  layout.jumpers.forEach((j, i) => {
    claim(j.a, `점퍼 ${i + 1}`);
    claim(j.b, `점퍼 ${i + 1}`);
  });

  // Copper: union-find over holes. Neighbours on a row are joined unless either is a cut.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col + 1 < layout.cols; col++) {
      const a = { row, col };
      const b = { row, col: col + 1 };
      if (!cutSet.has(key(a)) && !cutSet.has(key(b))) union(key(a), key(b));
    }
  }
  for (const j of layout.jumpers) union(key(j.a), key(j.b));

  // Every pin of the circuit must be on the board, exactly where the netlist says.
  const expected = new Map<string, string>();
  for (const c of board.components) for (const pad of c.pads) if (pad.net) expected.set(`${c.ref}.${pad.number}`, pad.net);
  const placed = new Map<string, Hole>();
  for (const p of layout.placements) for (const pin of p.pins) placed.set(`${p.ref}.${pin.pad}`, pin);
  for (const pinKey of expected.keys()) if (!placed.has(pinKey)) problems.push(`${pinKey}: 보드에 배치되지 않았습니다.`);

  // Each copper island must carry exactly one net, and each net must be one island.
  const netOfIsland = new Map<string, string>();
  const islandOfNet = new Map<string, string>();
  for (const [pinKey, net] of expected) {
    const hole = placed.get(pinKey);
    if (!hole) continue;
    const island = find(key(hole));
    const other = netOfIsland.get(island);
    if (other !== undefined && other !== net) problems.push(`${pinKey}: ${net} 넷이 ${other} 넷과 단락되었습니다 (${holeLabel(hole)}).`);
    else netOfIsland.set(island, net);
    const home = islandOfNet.get(net);
    if (home !== undefined && home !== island) problems.push(`${pinKey}: ${net} 넷이 끊겨 있습니다 (${holeLabel(hole)}).`);
    else islandOfNet.set(net, island);
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
