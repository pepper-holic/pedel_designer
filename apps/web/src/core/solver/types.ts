export type NodeId = string;

export const GROUND: NodeId = "0";

export interface ElementBase {
  id: string;
  nodes: NodeId[];
}

export interface ResistorElement extends ElementBase {
  type: "resistor";
  nodes: [NodeId, NodeId];
  resistance: number;
}

export interface CapacitorElement extends ElementBase {
  type: "capacitor";
  nodes: [NodeId, NodeId];
  capacitance: number;
}

export interface InductorElement extends ElementBase {
  type: "inductor";
  nodes: [NodeId, NodeId];
  inductance: number;
}

export interface VoltageSourceElement extends ElementBase {
  type: "vsource";
  nodes: [NodeId, NodeId];
  /** DC/instantaneous voltage in volts. For time-varying sources this is set per timestep before stamping. */
  voltage: number;
}

export interface DiodeElement extends ElementBase {
  type: "diode";
  nodes: [NodeId, NodeId];
  saturationCurrent: number;
  thermalVoltage: number;
  emissionCoefficient: number;
  /** Optional bulk/lead series resistance in ohms, for accuracy in the high-current knee region. Undefined/0 disables it (unchanged ideal-junction behavior). */
  seriesResistance?: number;
}

export interface BjtElement extends ElementBase {
  type: "bjt";
  /** [base, collector, emitter] */
  nodes: [NodeId, NodeId, NodeId];
  polarity: "npn" | "pnp";
  saturationCurrent: number;
  thermalVoltage: number;
  forwardBeta: number;
  reverseBeta: number;
}

export interface OpAmpElement extends ElementBase {
  type: "opamp";
  /** [nonInverting, inverting, output] */
  nodes: [NodeId, NodeId, NodeId];
  openLoopGain: number;
  /** Gain-bandwidth product in Hz. Undefined/0 keeps the ideal infinite-bandwidth behavior. */
  gbwpHz?: number;
  /** Output slew rate limit in V/us, applied in the transient solver only. Undefined/0 disables it. */
  slewRateVPerUs?: number;
  /** Positive supply rail in volts. Both rails must be set (and railPositive > railNegative) to enable clipping. */
  railPositive?: number;
  /** Negative supply rail in volts. */
  railNegative?: number;
}

export type Element =
  | ResistorElement
  | CapacitorElement
  | InductorElement
  | VoltageSourceElement
  | DiodeElement
  | BjtElement
  | OpAmpElement;

export interface Netlist {
  elements: Element[];
}
