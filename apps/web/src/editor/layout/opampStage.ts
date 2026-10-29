import type { SpinePlacement } from "./spine";
import { PART_DEFS } from "../partDefs";
import type { PartInstance } from "../types";

export type OpAmpInput = "inMinus" | "inPlus";

export interface OpAmpStage {
  opampId: string;
  /** Series element carrying the signal into one input, if the group has one - the other input may
   * instead be wired by a bare net straight from outside the group, with no local part. */
  inputId: string | null;
  /** Which input the signal arrives at - decides which way the stage is drawn (see opAmpStageLayout). */
  signalInput: OpAmpInput;
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
  // The signal input is wherever the series element is; failing that, the input the ground leg is
  // NOT on; failing that, "+" when the output is strapped straight to "-" (a follower), else "-".
  let signalInput: OpAmpInput = outNet === inMinusNet ? "inPlus" : "inMinus";

  if (inMinusAdjacent.length === 1 && inPlusAdjacent.length === 0) {
    if (isGroundish(inMinusAdjacent[0])) {
      groundLegId = inMinusAdjacent[0];
      signalInput = "inPlus";
    } else inputId = inMinusAdjacent[0];
  } else if (inPlusAdjacent.length === 1 && inMinusAdjacent.length === 0) {
    if (isGroundish(inPlusAdjacent[0])) groundLegId = inPlusAdjacent[0];
    else {
      inputId = inPlusAdjacent[0];
      signalInput = "inPlus";
    }
  } else if (inMinusAdjacent.length === 1 && inPlusAdjacent.length === 1) {
    const [a, b] = [inMinusAdjacent[0], inPlusAdjacent[0]];
    const aGround = isGroundish(a);
    const bGround = isGroundish(b);
    if (aGround === bGround) return null; // both a ground leg, or both a signal input - can't tell which is which
    inputId = aGround ? b : a;
    groundLegId = aGround ? a : b;
    signalInput = aGround ? "inPlus" : "inMinus";
  } else if (inMinusAdjacent.length > 1 || inPlusAdjacent.length > 1) {
    return null;
  }

  const outAdjacentId = outAdjacent[0] ?? null;
  const accounted = new Set([opampId, ...feedbackIds, ...(inputId ? [inputId] : []), ...(groundLegId ? [groundLegId] : []), ...(outAdjacentId ? [outAdjacentId] : [])]);
  if (accounted.size !== members.length) return null;

  return { opampId, inputId, signalInput, feedbackIds: feedbackIds.sort(order), outAdjacentId, groundLegId };
}

export interface OpAmpStagePlacement {
  placement: SpinePlacement;
  /** Orientation the template decided for a member (the op-amp's mirror) - the generic orientation
   * pass must not undo it. */
  mirror: Map<string, boolean>;
}

/** The op-amp symbol's input pins sit 20px above and below its centre (partDefs); the centre is put
 * 20px below the spine row so the signal input pin lands exactly ON the row, and the wire from the
 * series input element runs straight in. */
const OPAMP_INPUT_PIN_OFFSET = 20;
/** The op-amp's input pins sit 30px left of its centre; the feedback rails hang on that line. */
const OPAMP_PIN_INSET = 30;
/** Distance from the spine row to the first feedback rung - clears the op-amp body and a pot's wiper
 * indicator with room for the labels in between. */
const FIRST_RUNG = 120;
/** Pitch between feedback rungs: tight, the way a clipping pair is always drawn, but with room for
 * each rung's id label between them. */
const RUNG_PITCH = 70;
/** How far past the last rung a ground leg on the ladder side hangs, so it reads as the rail
 * continuing straight down to ground rather than as one more rung. */
const GROUND_LEG_DROP = 70;

/**
 * The textbook amplifier-stage placement for a recognized op-amp stage: the input element (if any)
 * and the op-amp on one row, left to right, with any output-side continuation after it, and every
 * feedback element as a horizontal rung of ONE ladder whose two rails are the inverting-input pin
 * line and the output pin line - so each rung's own end pins already sit on the rails and the wires
 * joining them are straight, with no second column of rungs for the rails to cross.
 *
 * The ladder goes on the inverting input's side: ABOVE for an inverting stage (signal in at "-",
 * drawn on top by mirroring the op-amp; the bias/ground leg of "+" hangs straight below), BELOW for
 * a non-inverting one (signal in at "+", drawn on top; the "-" feedback and its ground leg both go
 * underneath, the ground leg hanging off the bottom of the left rail). The op-amp is nudged down so
 * its signal input pin lands exactly on the spine row.
 */
export function opAmpStageLayout(stage: OpAmpStage): OpAmpStagePlacement {
  const placement: SpinePlacement = new Map();
  const inverting = stage.signalInput === "inMinus";
  const side = inverting ? -1 : 1; // which way the ladder grows from the spine row
  const opampCol = stage.inputId ? 1 : 0;
  if (stage.inputId) placement.set(stage.inputId, { col: 0, row: 0 });
  placement.set(stage.opampId, { col: opampCol, row: 0, dy: OPAMP_INPUT_PIN_OFFSET });
  if (stage.outAdjacentId) placement.set(stage.outAdjacentId, { col: opampCol + 1, row: 0 });

  const rungY = (i: number) => side * (FIRST_RUNG + i * RUNG_PITCH);
  stage.feedbackIds.forEach((id, i) => placement.set(id, { col: opampCol, row: 0, dy: rungY(i) }));

  if (stage.groundLegId) {
    if (inverting) placement.set(stage.groundLegId, { col: opampCol, row: 1, dx: -OPAMP_PIN_INSET });
    else placement.set(stage.groundLegId, { col: opampCol, row: 0, dx: -OPAMP_PIN_INSET, dy: rungY(Math.max(0, stage.feedbackIds.length - 1)) + GROUND_LEG_DROP });
  }
  // Mirrored, the "-" pin draws on top: where an inverting stage's input and feedback both want it.
  return { placement, mirror: new Map([[stage.opampId, inverting]]) };
}
