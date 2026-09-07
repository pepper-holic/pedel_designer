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

export interface CoupledInductorsElement extends ElementBase {
  type: "coupledInductors";
  /** [a1, b1, a2, b2] - the two ends of the first winding, then of the second. */
  nodes: [NodeId, NodeId, NodeId, NodeId];
  inductanceA: number;
  inductanceB: number;
  /** Coupling coefficient k, 0 (independent coils) to 1 (ideal transformer). Sign flips the
   * secondary's polarity, which is how a phase-inverting winding is expressed. */
  coupling: number;
}

export interface VoltageSourceElement extends ElementBase {
  type: "vsource";
  nodes: [NodeId, NodeId];
  /** DC/instantaneous voltage in volts. For time-varying sources this is set per timestep before stamping. */
  voltage: number;
  /**
   * Marks this source as carrying the input signal, so every analysis drives it in phase with the
   * named input source. A humbucker is two coils sensing one string: both generate together, and
   * driving only one would leave the other as a dead passive impedance - which gets the
   * series-vs-parallel and coil-split level relationships backwards.
   *
   * It lives on the element rather than in each analysis's options so that THD, Monte Carlo and the
   * pedal chain get it right for free, without every call site having to remember to pass it.
   */
  isSignalSource?: boolean;
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

export interface JfetElement extends ElementBase {
  type: "jfet";
  /** [gate, drain, source] - n-channel only. */
  nodes: [NodeId, NodeId, NodeId];
  /** Drain saturation current at Vgs=0, in amps. */
  idss: number;
  /** Pinch-off (gate-source cutoff) voltage, in volts. Negative for n-channel. */
  pinchOffVoltage: number;
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
  | CoupledInductorsElement
  | VoltageSourceElement
  | DiodeElement
  | BjtElement
  | JfetElement
  | OpAmpElement;

export interface Netlist {
  elements: Element[];
}
