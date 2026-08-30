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

// Green/yellow/amber LEDs (GaAs family) and blue/white LEDs (SiC/InGaN, wider bandgap still) fitted
// from published datasheet I-V curves - source: "Turning diode (and LED) datasheet IV plots into
// SPICE models", codeinsecurity.wordpress.com (2024). N intentionally exceeds the textbook 1-2 range,
// which the same source notes is normal for LED fits (the SPICE diode equation is being pressed into
// service for a device whose physics isn't a simple PN junction).
export const GREEN_LED = {
  saturationCurrent: 93.1e-12,
  thermalVoltage: 0.02585,
  emissionCoefficient: 4.61,
};

export const BLUE_LED = {
  saturationCurrent: 93.1e-12,
  thermalVoltage: 0.02585,
  emissionCoefficient: 7.47,
};

// 1N5817 Schottky - published manufacturer SPICE model (diodes.com): IS=870uA, N=1.81, RS=81.3mOhm.
// Schottkys clip much earlier (~0.3-0.4V) than silicon (~0.6V) - used in some asymmetric-clipping
// overdrive mods paired with a silicon or LED leg for a softer, earlier-breaking knee.
export const SCHOTTKY_1N5817 = {
  saturationCurrent: 870e-6,
  thermalVoltage: 0.02585,
  emissionCoefficient: 1.81,
  seriesResistance: 0.0813,
};

/** Selectable diode models for the schematic editor's property inspector. */
export const DIODE_MODELS: Record<string, { label: string; params: typeof SILICON_DIODE_1N4148 }> = {
  "1N4148": { label: "1N4148 (실리콘)", params: SILICON_DIODE_1N4148 },
  "1N34A": { label: "1N34A (저마늄)", params: GERMANIUM_DIODE },
  RED_LED: { label: "레드 LED", params: RED_LED },
  GREEN_LED: { label: "그린 LED", params: GREEN_LED },
  BLUE_LED: { label: "블루/화이트 LED", params: BLUE_LED },
  "1N5817": { label: "1N5817 (쇼트키)", params: SCHOTTKY_1N5817 },
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

// Bipolar-input op-amps typically can't swing all the way to their supply rails (the output stage
// needs headroom) - all the bipolar/JFET-input models below share the same +-4V approximate swing
// limit as JRC4558_APPROX for a virtual-ground 9V pedal supply. CA3130 is the exception: its CMOS
// output stage is close to rail-to-rail, so it gets a wider swing.

/** TL072 (dual)/TL071 (single) JFET-input - the other extremely common pedal op-amp alongside the
 * 4558, chosen when a builder wants a snappier, less-compressed voicing than the 4558's slower GBWP.
 * Datasheet: GBWP 3MHz, slew rate 13V/us (TI TL072/TL071 datasheets). */
export const TL072_APPROX = {
  gbwpHz: 3_000_000,
  slewRateVPerUs: 13,
  railPositive: 4,
  railNegative: -4,
};

/** LM741 - the classic general-purpose op-amp, notably slow by modern standards. Datasheet: GBWP
 * ~1MHz, slew rate 0.5V/us. */
export const LM741_APPROX = {
  gbwpHz: 1_000_000,
  slewRateVPerUs: 0.5,
  railPositive: 4,
  railNegative: -4,
};

/** LM308 - the ProCo RAT's op-amp, and a defining part of its sound: unusually slow even for a
 * vintage chip (datasheet GBWP ~1MHz but usable slew rate only ~0.3V/us), which audibly softens
 * the RAT's clipping edge compared to a 4558/TL072 substitution - a well-documented mod topic. */
export const LM308_APPROX = {
  gbwpHz: 1_000_000,
  slewRateVPerUs: 0.3,
  railPositive: 4,
  railNegative: -4,
};

/** CA3130 - BiMOS (MOSFET input, CMOS output) op-amp used in some Big Muff Pi variants. Datasheet:
 * unity-gain crossover 15MHz uncompensated, slew rate 30V/us. CMOS output stage swings much closer
 * to the rails than a bipolar output, hence the wider rail approximation here. */
export const CA3130_APPROX = {
  gbwpHz: 15_000_000,
  slewRateVPerUs: 30,
  railPositive: 4.3,
  railNegative: -4.3,
};

/** NE5532 - low-noise audio op-amp favored in boutique/hi-fi-leaning pedal designs. Datasheet: GBWP
 * 10MHz, slew rate 9V/us. */
export const NE5532_APPROX = {
  gbwpHz: 10_000_000,
  slewRateVPerUs: 9,
  railPositive: 4,
  railNegative: -4,
};

/** OP07 - precision low-offset op-amp, occasionally seen in buffer/bias stages. Datasheet: GBWP
 * 0.6MHz, slew rate 0.3V/us - one of the slowest common op-amps, close to the LM308. */
export const OP07_APPROX = {
  gbwpHz: 600_000,
  slewRateVPerUs: 0.3,
  railPositive: 4,
  railNegative: -4,
};

/** Selectable op-amp models for the schematic editor's property inspector - all approximations of
 * real parts' GBWP/slew-rate/rail-swing datasheet specs, not full transistor-level SPICE models
 * (this app's op-amp is a macromodel - see docs/plan-editor-implementation-history.md pt.2). */
export const OPAMP_MODELS: Record<string, { label: string; params: typeof JRC4558_APPROX }> = {
  IDEAL: { label: "이상적 (비이상성 없음)", params: { gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
  JRC4558: { label: "JRC4558 (TS9/OD-1 계열)", params: JRC4558_APPROX },
  TL072: { label: "TL072/TL071 (JFET 입력)", params: TL072_APPROX },
  LM741: { label: "LM741 (범용)", params: LM741_APPROX },
  LM308: { label: "LM308 (RAT 계열)", params: LM308_APPROX },
  CA3130: { label: "CA3130 (Big Muff 계열, BiMOS)", params: CA3130_APPROX },
  NE5532: { label: "NE5532 (저노이즈 오디오)", params: NE5532_APPROX },
  OP07: { label: "OP07 (정밀, 저속)", params: OP07_APPROX },
};

/** Generic n-channel JFET (e.g. 2N5457/J201-class) representative of common audio buffer/boost parts. */
export const GENERIC_NCHANNEL_JFET = {
  idss: 2e-3,
  pinchOffVoltage: -2.5,
};

export const GENERIC_GERMANIUM_PNP = {
  // Higher Is and lower beta are typical of vintage germanium fuzz transistors (e.g. AC128/NKT275).
  saturationCurrent: 5e-6,
  thermalVoltage: 0.02585,
  forwardBeta: 80,
  reverseBeta: 3,
};

// Named BJT models for the part palette. hFE (forwardBeta) is the value worth naming precisely here
// - it drives bias point and gain in a way builders actually swap parts to chase - while Is/reverseBeta
// stay at this app's existing generic-silicon/generic-germanium representative values (this simulator
// isn't fitting full manufacturer SPICE decks, see docs/ROADMAP.md's simulation-core audit).
export const BJT_2N3904 = { polarity: "npn", saturationCurrent: 1e-14, thermalVoltage: 0.02585, forwardBeta: 100, reverseBeta: 1 };
/** 2N5088 - unusually high-hFE NPN, the LPB-1's transistor and a common choice for clean boost circuits. */
export const BJT_2N5088 = { polarity: "npn", saturationCurrent: 1e-14, thermalVoltage: 0.02585, forwardBeta: 1000, reverseBeta: 1 };
/** BC549 - common in European-style fuzz/booster clones (e.g. Rangemaster-adjacent builds). */
export const BJT_BC549 = { polarity: "npn", saturationCurrent: 1e-14, thermalVoltage: 0.02585, forwardBeta: 600, reverseBeta: 1 };
export const BJT_2N3906 = { polarity: "pnp", saturationCurrent: 1e-14, thermalVoltage: 0.02585, forwardBeta: 120, reverseBeta: 1 };
/** AC128 - the vintage germanium PNP the original Fuzz Face used; same representative values as
 * GENERIC_GERMANIUM_PNP, exposed here as a named choice in the palette. */
export const BJT_AC128 = { polarity: "pnp", ...GENERIC_GERMANIUM_PNP };

export const TRANSISTOR_MODELS: Record<string, { label: string; params: typeof BJT_2N3904 }> = {
  "2N3904": { label: "2N3904 (NPN 실리콘, 범용)", params: BJT_2N3904 },
  "2N5088": { label: "2N5088 (NPN 실리콘, 고이득 부스트)", params: BJT_2N5088 },
  BC549: { label: "BC549 (NPN 실리콘, 유럽식 퍼즈/부스터)", params: BJT_BC549 },
  "2N3906": { label: "2N3906 (PNP 실리콘, 범용)", params: BJT_2N3906 },
  AC128: { label: "AC128 (PNP 저마늄, Fuzz Face)", params: BJT_AC128 },
};

// Named JFET models. idss/pinchOffVoltage are the datasheet-typical values that actually distinguish
// these parts in circuit (bias point and available gain) - averaged from published characterization
// data since individual units vary widely part-to-part even within one part number.
/** J201 - low Idss/low Vp, low-noise - common in buffer and low-bias JFET boost circuits. */
export const JFET_J201 = { idss: 0.64e-3, pinchOffVoltage: -0.83 };
/** 2N5457 - the mid-range default this app already shipped as GENERIC_NCHANNEL_JFET, named here too. */
export const JFET_2N5457 = { idss: 3.27e-3, pinchOffVoltage: -1.58 };
/** MPF102 - higher Idss/Vp, more current and headroom than the other two. */
export const JFET_MPF102 = { idss: 5.65e-3, pinchOffVoltage: -2.34 };

export const JFET_MODELS: Record<string, { label: string; params: typeof JFET_2N5457 }> = {
  J201: { label: "J201 (저잡음, 저바이어스)", params: JFET_J201 },
  "2N5457": { label: "2N5457 (표준)", params: JFET_2N5457 },
  MPF102: { label: "MPF102 (고전류)", params: JFET_MPF102 },
};
