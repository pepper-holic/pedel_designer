import { netlistFromGraph } from "../netlistFromGraph";
import { PART_DEFS } from "../partDefs";
import { snapToGrid, terminalPosition } from "../geometry";
import { barycenterRows, layerDepths, type Adjacency } from "./layered";
import { spineLayout } from "./spine";
import { optimizePartOrientations } from "./orientation";
import { detectOpAmpStage, opAmpStageLayout } from "./opampStage";
import type { CircuitSnapshot } from "../historyStack";
import type { PartInstance } from "../types";

const COLUMN_SPACING = 160;
const ROW_SPACING = 150;
/** Space between neighbouring blocks - room for a block's region padding and its label. */
const GROUP_GAP_X = 120;
const GROUP_GAP_Y = 130;
const ORIGIN = { x: 100, y: 100 };
const GROUND_OFFSET_Y = 70;
/** See spineLayout: the signal path prefers amplifiers, avoids diodes. */
const SPINE_WEIGHT: Partial<Record<PartInstance["type"], number>> = { opamp: 1, bjt: 1, jfet: 1, coupledInductors: 2, diode: 6 };

/** How much of a part's own lead stays visible above/below the row instead of being flushed flat onto
 * it. A real schematic always shows a short straight run off a pin before a wire bends onto a
 * different axis - flushing all the way to zero would erase that and read as the wire just teleporting
 * sideways out of the part, not as a lead that happens to bend. */
const ROW_ANCHOR_STUB = 20;

/** Row placement lines a part's CENTRE up with its row - fine for a resistor/cap/diode, whose two
 * terminals sit level with its centre, but a signal source's output pin sits off to one side of its
 * own symbol (vsource's "positive" is drawn above centre). Left as-is, the wire into the next part has
 * to detour around the source's own body just to clear it before it can turn toward its target - this
 * returns how far to shift the part so its OWN connecting pin lands close to the row (leaving a short,
 * deliberate stub of ROW_ANCHOR_STUB) instead of far off it. */
export function rowAnchorOffset(part: PartInstance): number {
  if (part.type !== "vsource" || part.role === "supply" || part.role === "bias") return 0;
  const gap = part.y - terminalPosition(part, "positive").y; // +30 when the pin sits above centre
  return Math.sign(gap || 1) * Math.max(0, Math.abs(gap) - ROW_ANCHOR_STUB);
}

interface Group {
  id: string;
  members: string[];
  power: boolean;
}

function addEdge(adj: Adjacency, a: string, b: string) {
  if (a === b) return;
  if (!adj.has(a)) adj.set(a, new Set());
  if (!adj.has(b)) adj.set(b, new Set());
  adj.get(a)!.add(b);
  adj.get(b)!.add(a);
}

/**
 * Lays the circuit out hierarchically: blocks are placed left to right in signal order (power
 * blocks in a row above), and the parts inside each block are laid out by the same layered
 * algorithm on their own. Loose parts act as one-part groups. Each ground symbol goes right under
 * the part it serves. Parts with `pinned` keep where the user put them.
 *
 * Supply rails are left out of the adjacency: every stage hangs off 9V, and counting that as
 * "connected" would put every stage one hop from every other and flatten the chain into one column.
 */
export function arrangeParts(snapshot: CircuitSnapshot, inputPartId: string | null): CircuitSnapshot {
  const { parts, blocks } = snapshot;
  const { terminalNet } = netlistFromGraph(parts, snapshot.wires);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const powerBlocks = new Set(blocks.filter((b) => b.category === "power").map((b) => b.id));

  // Nets that are supply rails: driven by a source flagged as supply/bias.
  const supplyNets = new Set<string>();
  for (const p of parts) {
    if (p.type === "vsource" && (p.role === "supply" || p.role === "bias")) supplyNets.add(terminalNet.get(`${p.id}:positive`) ?? "");
  }
  supplyNets.add("0");

  const signalParts = parts.filter((p) => p.type !== "ground");
  const partsOnNet = new Map<string, string[]>();
  for (const p of signalParts) {
    for (const t of PART_DEFS[p.type].terminals) {
      const net = terminalNet.get(`${p.id}:${t.id}`);
      if (!net || supplyNets.has(net)) continue;
      if (!partsOnNet.has(net)) partsOnNet.set(net, []);
      partsOnNet.get(net)!.push(p.id);
    }
  }
  const partAdj: Adjacency = new Map(signalParts.map((p) => [p.id, new Set<string>()]));
  for (const ids of partsOnNet.values()) for (const a of ids) for (const b of ids) addEdge(partAdj, a, b);

  // --- groups: one per block, one per loose part ------------------------------------------------
  const groupOf = new Map<string, string>();
  const groups = new Map<string, Group>();
  for (const p of signalParts) {
    const gid = p.blockId ?? `part:${p.id}`;
    groupOf.set(p.id, gid);
    if (!groups.has(gid)) groups.set(gid, { id: gid, members: [], power: !!p.blockId && powerBlocks.has(p.blockId) });
    groups.get(gid)!.members.push(p.id);
  }
  const groupAdj: Adjacency = new Map([...groups.keys()].map((g) => [g, new Set<string>()]));
  for (const [a, ns] of partAdj) for (const b of ns) addEdge(groupAdj, groupOf.get(a)!, groupOf.get(b)!);

  const chainGroups = [...groups.values()].filter((g) => !g.power).map((g) => g.id);
  const leftmost = [...chainGroups].sort((a, b) => Math.min(...groups.get(a)!.members.map((m) => byId.get(m)!.x)) - Math.min(...groups.get(b)!.members.map((m) => byId.get(m)!.x)));
  const rootGroup = inputPartId && groupOf.has(inputPartId) ? groupOf.get(inputPartId)! : leftmost[0];
  const groupDepth = layerDepths(chainGroups, groupAdj, rootGroup ? [rootGroup] : []);
  const groupRow = barycenterRows(chainGroups, groupDepth, groupAdj);

  // --- inside each group: signal spine on one row, the rest above/below ---------------------------
  const netsOf = (id: string) => PART_DEFS[byId.get(id)!.type].terminals.map((t) => terminalNet.get(`${id}:${t.id}`) ?? "");
  const groundNet = "0";
  const supplyOnly = new Set([...supplyNets].filter((n) => n !== groundNet));
  const portParts = (blockId: string, kind: "in" | "out") =>
    (blocks.find((b) => b.id === blockId)?.ports ?? []).filter((p) => p.kind === kind).map((p) => p.terminal.partId);
  const local = new Map<string, { x: number; y: number }>();
  const size = new Map<string, { w: number; h: number }>();
  /** Distance from a group's top to its spine row - used to put every spine on one baseline. */
  const spineY = new Map<string, number>();
  for (const g of groups.values()) {
    const members = g.members;
    const myDepth = groupDepth.get(g.id) ?? 0;
    const memberSet = new Set(members);
    const neighbourDepths = (m: string) => [...(partAdj.get(m) ?? [])].filter((n) => !memberSet.has(n)).map((n) => groupDepth.get(groupOf.get(n)!) ?? myDepth);
    const blockId = g.id.startsWith("part:") ? null : g.id;
    const entries = (blockId ? portParts(blockId, "in") : []).concat(members.filter((m) => neighbourDepths(m).some((d) => d < myDepth)));
    const exits = (blockId ? portParts(blockId, "out") : []).concat(members.filter((m) => neighbourDepths(m).some((d) => d > myDepth)));
    const innerAdj: Adjacency = new Map(members.map((m) => [m, new Set([...(partAdj.get(m) ?? [])].filter((n) => memberSet.has(n)))]));
    const touchesGround = (id: string) => netsOf(id).includes(groundNet);
    const touchesSupply = (id: string) => netsOf(id).some((n) => supplyOnly.has(n));
    const order = (a: string, b: string) => byId.get(a)!.x - byId.get(b)!.x || byId.get(a)!.y - byId.get(b)!.y;
    const opAmpStage = detectOpAmpStage({ members, byId, terminalNet, touchesGround, touchesSupply, order });
    const placement = opAmpStage
      ? opAmpStageLayout(opAmpStage)
      : spineLayout({
          members,
          adjacency: innerAdj,
          entries: [...new Set(entries)].filter((m) => memberSet.has(m)),
          exits: [...new Set(exits)].filter((m) => memberSet.has(m)),
          touchesGround,
          touchesSupply,
          order,
          weight: (id) => SPINE_WEIGHT[byId.get(id)!.type] ?? 3,
        });
    const minRow = Math.min(...[...placement.values()].map((p) => p.row));
    const maxRow = Math.max(...[...placement.values()].map((p) => p.row));
    const maxCol = Math.max(...[...placement.values()].map((p) => p.col));
    for (const [m, p] of placement) local.set(m, { x: p.col * COLUMN_SPACING, y: (p.row - minRow) * ROW_SPACING + rowAnchorOffset(byId.get(m)!) });
    size.set(g.id, { w: maxCol * COLUMN_SPACING, h: (maxRow - minRow) * ROW_SPACING });
    spineY.set(g.id, -minRow * ROW_SPACING);
  }

  // --- place groups: columns by depth, stacked by row; power on a row of its own above ------------
  const origin = new Map<string, { x: number; y: number }>();
  const depthColumns = new Map<number, string[]>();
  for (const g of chainGroups) {
    const d = groupDepth.get(g)!;
    if (!depthColumns.has(d)) depthColumns.set(d, []);
    depthColumns.get(d)!.push(g);
  }
  // The first group of every column sits on a shared baseline (its spine row); further groups in the
  // same column stack underneath. Power goes in a row of its own above everything.
  const columnOrder = [...depthColumns.keys()].sort((a, b) => a - b).map((d) => depthColumns.get(d)!.sort((a, b) => groupRow.get(a)! - groupRow.get(b)!));
  const baseline = ORIGIN.y + Math.max(0, ...columnOrder.map((col) => spineY.get(col[0])!));
  let x = ORIGIN.x;
  for (const col of columnOrder) {
    let y = baseline - spineY.get(col[0])!;
    let width = 0;
    for (const g of col) {
      origin.set(g, { x, y });
      y += size.get(g)!.h + GROUP_GAP_Y + ROW_SPACING / 2;
      width = Math.max(width, size.get(g)!.w);
    }
    x += width + COLUMN_SPACING + (col.some((g) => groups.get(g)!.members.length > 1) ? GROUP_GAP_X : 0);
  }
  const chainTop = Math.min(ORIGIN.y, ...[...origin.values()].map((o) => o.y));
  let px = ORIGIN.x;
  const powerGroups = [...groups.values()].filter((g) => g.power);
  const powerHeight = Math.max(0, ...powerGroups.map((g) => size.get(g.id)!.h));
  for (const g of powerGroups) {
    origin.set(g.id, { x: px, y: chainTop - powerHeight - GROUP_GAP_Y - ROW_SPACING / 2 });
    px += size.get(g.id)!.w + COLUMN_SPACING + GROUP_GAP_X;
  }

  // --- apply, keeping pinned parts, then hang ground symbols under their owners --------------------
  const moved = new Map<string, PartInstance>();
  for (const p of signalParts) {
    if (p.pinned) {
      moved.set(p.id, p);
      continue;
    }
    const o = origin.get(groupOf.get(p.id)!)!;
    const l = local.get(p.id)!;
    moved.set(p.id, { ...p, x: snapToGrid(o.x + l.x), y: snapToGrid(o.y + l.y) });
  }
  const groundOwner = new Map<string, string>();
  for (const w of snapshot.wires) {
    const a = byId.get(w.a.partId);
    const b = byId.get(w.b.partId);
    if (a?.type === "ground" && b && b.type !== "ground" && !groundOwner.has(a.id)) groundOwner.set(a.id, b.id);
    if (b?.type === "ground" && a && a.type !== "ground" && !groundOwner.has(b.id)) groundOwner.set(b.id, a.id);
  }
  const nextParts = parts.map((p) => {
    if (p.type !== "ground") return moved.get(p.id)!;
    const owner = groundOwner.get(p.id);
    if (p.pinned || !owner) return p;
    const o = moved.get(owner)!;
    return { ...p, x: o.x, y: o.y + GROUND_OFFSET_Y };
  });
  return { ...snapshot, parts: optimizePartOrientations(nextParts, snapshot.wires) };
}
