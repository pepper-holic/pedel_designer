import type { SpinePlacement } from "./spine";
import { PART_DEFS } from "../partDefs";
import type { PartInstance } from "../types";

export interface OpAmpStage {
  opampId: string;
  /** Series element carrying the signal into one input, if the group has one - the other input may
   * instead be wired by a bare net straight from outside the group, with no local part. */
  inputId: string | null;
  /** Elements wired between the op-amp's output and its inverting input - negative feedback, present
   * in both inverting and non-inverting stages. */
  feedbackIds: string[];
  /** A single element continuing the signal in series after the op-amp's output, if the group has one. */
  outAdjacentId: string | null;
  /** The bias/ground leg on whichever input isn't carrying the signal, if the group has one. */
  groundLegId: string | null;
}

interface DetectOpAmpStageInput {
  members: string[];
  byId: Map<string, PartInstance>;
  terminalNet: Map<string, string>;
  touchesGround: (id: string) => boolean;
  touchesSupply: (id: string) => boolean;
  order: (a: string, b: string) => number;
}

function netSetOf(byId: Map<string, PartInstance>, terminalNet: Map<string, string>, id: string): Set<string> {
  const nets = PART_DEFS[byId.get(id)!.type].terminals.map((t) => terminalNet.get(`${id}:${t.id}`));
  return new Set(nets.filter((n): n is string => !!n));
}

/**
 * Recognizes a block/group that is exactly one op-amp amplifying stage - the op-amp, its feedback
 * element(s), at most one series element into the signal-carrying input, at most one element
 * continuing the signal after the output, and at most one bias/ground leg on the other input.
 *
 * Every member of the group must get one of these roles, or this returns null and the caller falls
 * back to the generic spineLayout: a partial match would silently misplace whatever's left over,
 * which is worse than not recognizing the stage at all.
 */
export function detectOpAmpStage(input: DetectOpAmpStageInput): OpAmpStage | null {
  const { members, byId, terminalNet, touchesGround, touchesSupply, order } = input;
  const opamps = members.filter((m) => byId.get(m)!.type === "opamp");
  if (opamps.length !== 1) return null;
  const opampId = opamps[0];
  const outNet = terminalNet.get(`${opampId}:out`);
  const inMinusNet = terminalNet.get(`${opampId}:inMinus`);
  const inPlusNet = terminalNet.get(`${opampId}:inPlus`);
  if (!outNet || !inMinusNet || !inPlusNet) return null;

  const others = members.filter((m) => m !== opampId);
  const nets = (id: string) => netSetOf(byId, terminalNet, id);

  // Feedback: touches the output and the inverting input and nothing else - true of a plain resistor
  // or cap there, and also of a rheostat-wired pot or an antiparallel diode pair (both ends land on
  // the same two nets even though the part itself has three terminals).
  const feedbackIds = others.filter((id) => {
    const ns = nets(id);
    return ns.size === 2 && ns.has(outNet) && ns.has(inMinusNet);
  });
  const feedbackSet = new Set(feedbackIds);
  const remaining = [...others.filter((id) => !feedbackSet.has(id))].sort(order);

  const inMinusAdjacent: string[] = [];
  const inPlusAdjacent: string[] = [];
  const outAdjacent: string[] = [];
  for (const id of remaining) {
    const ns = nets(id);
    const hits = [ns.has(inMinusNet), ns.has(inPlusNet), ns.has(outNet)].filter(Boolean).length;
    if (hits !== 1) return null; // touches more than one of the op-amp's own nets, or none - ambiguous role
    if (ns.has(inMinusNet)) inMinusAdjacent.push(id);
    else if (ns.has(inPlusNet)) inPlusAdjacent.push(id);
    else outAdjacent.push(id);
  }
  if (outAdjacent.length > 1) return null;

  const isGroundish = (id: string) => touchesGround(id) || touchesSupply(id);
  let inputId: string | null = null;
  let groundLegId: string | null = null;

  if (inMinusAdjacent.length === 1 && inPlusAdjacent.length === 0) {
    if (isGroundish(inMinusAdjacent[0])) groundLegId = inMinusAdjacent[0];
    else inputId = inMinusAdjacent[0];
  } else if (inPlusAdjacent.length === 1 && inMinusAdjacent.length === 0) {
    if (isGroundish(inPlusAdjacent[0])) groundLegId = inPlusAdjacent[0];
    else inputId = inPlusAdjacent[0];
  } else if (inMinusAdjacent.length === 1 && inPlusAdjacent.length === 1) {
    const [a, b] = [inMinusAdjacent[0], inPlusAdjacent[0]];
    const aGround = isGroundish(a);
    const bGround = isGroundish(b);
    if (aGround === bGround) return null; // both a ground leg, or both a signal input - can't tell which is which
    inputId = aGround ? b : a;
    groundLegId = aGround ? a : b;
  } else if (inMinusAdjacent.length > 1 || inPlusAdjacent.length > 1) {
    return null;
  }

  const outAdjacentId = outAdjacent[0] ?? null;
  const accounted = new Set([opampId, ...feedbackIds, ...(inputId ? [inputId] : []), ...(groundLegId ? [groundLegId] : []), ...(outAdjacentId ? [outAdjacentId] : [])]);
  if (accounted.size !== members.length) return null;

  return { opampId, inputId, feedbackIds: feedbackIds.sort(order), outAdjacentId, groundLegId };
}

/**
 * The textbook amplifier-stage placement for a recognized op-amp stage: the input element (if any)
 * and the op-amp on one row, left to right, with any output-side continuation after it; feedback
 * elements stacked above the op-amp as parallel horizontal rungs; the bias/ground leg (if any)
 * directly below.
 *
 * A feedback network commonly mixes two different things: a single gain-setting element (a resistor
 * or pot) and a clipping pair (two diodes wired antiparallel between the same two nets, which reads
 * as one recognizable cluster when stacked tight). Piling all of them into one column regardless of
 * kind makes a 3-element feedback network a three-storey tower with barely any of the canvas's width
 * used - the taller a group gets, the more its own bus wires run the full height right past the
 * bodies of the rungs they don't connect to. Splitting the diode cluster into its own column keeps
 * the pair's convention (stacked tight) while spending height on width instead everywhere else.
 */
export function opAmpStageLayout(stage: OpAmpStage, isDiode: (id: string) => boolean): SpinePlacement {
  const placement: SpinePlacement = new Map();
  const opampCol = stage.inputId ? 1 : 0;
  if (stage.inputId) placement.set(stage.inputId, { col: 0, row: 0 });
  placement.set(stage.opampId, { col: opampCol, row: 0 });
  if (stage.outAdjacentId) placement.set(stage.outAdjacentId, { col: opampCol + 1, row: 0 });

  const diodeFeedback = stage.feedbackIds.filter(isDiode);
  const otherFeedback = stage.feedbackIds.filter((id) => !isDiode(id));
  otherFeedback.forEach((id, i) => placement.set(id, { col: opampCol, row: -(i + 1) }));
  const diodeCol = otherFeedback.length > 0 ? opampCol + 1 : opampCol;
  diodeFeedback.forEach((id, i) => placement.set(id, { col: diodeCol, row: -(i + 1) }));

  if (stage.groundLegId) placement.set(stage.groundLegId, { col: opampCol, row: 1 });
  return placement;
}
