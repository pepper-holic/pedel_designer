/** Display unit and validation lower-bound for known part parameter keys, used by the property inspector. */
export interface ParamMeta {
  unit?: string;
  min?: number;
  /** When set, renders as a <input type="range"> slider (min..max) instead of a text input. */
  slider?: { max: number; step: number };
}

export const PARAM_META: Record<string, ParamMeta> = {
  resistance: { unit: "Ω", min: 0.001 },
  seriesResistance: { unit: "Ω", min: 0 },
  capacitance: { unit: "F", min: 1e-15 },
  inductance: { unit: "H", min: 1e-9 },
  voltage: { unit: "V" },
  position: { unit: "", min: 0, slider: { max: 1, step: 0.01 } },
  openLoopGain: { unit: "", min: 1 },
  gbwpHz: { unit: "Hz", min: 0 },
  slewRateVPerUs: { unit: "V/us", min: 0 },
  railPositive: { unit: "V" },
  railNegative: { unit: "V" },
  saturationCurrent: { unit: "A", min: 0 },
  thermalVoltage: { unit: "V", min: 0 },
  emissionCoefficient: { unit: "", min: 0.1 },
  forwardBeta: { unit: "", min: 0 },
  reverseBeta: { unit: "", min: 0 },
  idss: { unit: "A", min: 0 },
  pinchOffVoltage: { unit: "V" },
};
