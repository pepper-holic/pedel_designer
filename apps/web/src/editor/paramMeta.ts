/** Display label/unit and validation lower-bound for known part parameter keys, used by the property inspector. */
export interface ParamMeta {
  /** Korean display name shown in the inspector - falls back to the raw key when absent. */
  label?: string;
  unit?: string;
  min?: number;
  /** When set, renders as a <input type="range"> slider (min..max) instead of a text input. */
  slider?: { max: number; step: number };
}

export const PARAM_META: Record<string, ParamMeta> = {
  resistance: { label: "저항값", unit: "Ω", min: 0.001 },
  seriesResistance: { label: "직렬 저항", unit: "Ω", min: 0 },
  capacitance: { label: "커패시턴스", unit: "F", min: 1e-15 },
  inductance: { label: "인덕턴스", unit: "H", min: 1e-9 },
  voltage: { label: "전압", unit: "V" },
  position: { label: "포텐셔미터 위치", unit: "", min: 0, slider: { max: 1, step: 0.01 } },
  openLoopGain: { label: "개루프 이득", unit: "", min: 1 },
  gbwpHz: { label: "이득대역폭곱 (GBWP)", unit: "Hz", min: 0 },
  slewRateVPerUs: { label: "슬루레이트", unit: "V/us", min: 0 },
  railPositive: { label: "양(+) 레일 전압", unit: "V" },
  railNegative: { label: "음(-) 레일 전압", unit: "V" },
  saturationCurrent: { label: "포화 전류 (Is)", unit: "A", min: 0 },
  thermalVoltage: { label: "열전압 (Vt)", unit: "V", min: 0 },
  emissionCoefficient: { label: "방출 계수 (N)", unit: "", min: 0.1 },
  forwardBeta: { label: "순방향 전류 이득 (hFE)", unit: "", min: 0 },
  reverseBeta: { label: "역방향 전류 이득", unit: "", min: 0 },
  idss: { label: "포화 드레인 전류 (Idss)", unit: "A", min: 0 },
  pinchOffVoltage: { label: "핀치오프 전압", unit: "V" },
};
