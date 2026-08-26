/** Reusable SPICE-style device parameter sets, shared by presets and the schematic editor's part defaults. */

export const SILICON_DIODE_1N4148 = {
  saturationCurrent: 4.352e-9,
  thermalVoltage: 0.02585,
  emissionCoefficient: 1.906,
};

export const GERMANIUM_DIODE = {
  // 1N34A-style germanium: turns on earlier and leaks more than silicon (higher Is, lower knee voltage).
  saturationCurrent: 2e-7,
  thermalVoltage: 0.02585,
  emissionCoefficient: 1.2,
};

export const RED_LED = {
  // Wide bandgap: much higher forward voltage (~1.8V) than silicon/germanium at the same current.
  saturationCurrent: 1e-18,
  thermalVoltage: 0.02585,
  emissionCoefficient: 2.5,
};

/** Selectable diode models for the schematic editor's property inspector. */
export const DIODE_MODELS: Record<string, { label: string; params: typeof SILICON_DIODE_1N4148 }> = {
  "1N4148": { label: "1N4148 (실리콘)", params: SILICON_DIODE_1N4148 },
  "1N34A": { label: "1N34A (저마늄)", params: GERMANIUM_DIODE },
  RED_LED: { label: "레드 LED", params: RED_LED },
};

export const GENERIC_SILICON_NPN = {
  saturationCurrent: 1e-14,
  thermalVoltage: 0.02585,
  forwardBeta: 100,
  reverseBeta: 1,
};

/** JRC4558-style dual op-amp approximation: GBWP ~3MHz, modest slew rate, and rails clamped to the
 * usable swing around a 9V-pedal virtual-ground bias (~+-4V here rather than the raw supply rails). */
export const JRC4558_APPROX = {
  gbwpHz: 3_000_000,
  slewRateVPerUs: 1.5,
  railPositive: 4,
  railNegative: -4,
};

export const GENERIC_GERMANIUM_PNP = {
  // Higher Is and lower beta are typical of vintage germanium fuzz transistors (e.g. AC128/NKT275).
  saturationCurrent: 5e-6,
  thermalVoltage: 0.02585,
  forwardBeta: 80,
  reverseBeta: 3,
};
