import {
  SILICON_DIODE_1N4148,
  GERMANIUM_DIODE,
  RED_LED,
  GREEN_LED,
  BLUE_LED,
  SCHOTTKY_1N5817,
  GENERIC_GERMANIUM_PNP,
  JRC4558_APPROX,
  TL072_APPROX,
  LM741_APPROX,
  LM308_APPROX,
  CA3130_APPROX,
  NE5532_APPROX,
  OP07_APPROX,
  JFET_J201,
  JFET_2N5457,
  JFET_MPF102,
} from "../deviceModels";

/**
 * Part number -> simulation model, for the parts that turn up in DIY kit boards. Silicon BJTs differ
 * here only in hFE (the value builders actually choose parts by - see deviceModels.ts); Darlingtons
 * are approximated as one very-high-hFE transistor, which gets the gain right but not their doubled
 * base-emitter drop. Matching is on the part number with any package/grade suffix tolerated
 * ("2SC1815-GR", "TL072CN").
 */
type Bjt = { polarity: "npn" | "pnp"; saturationCurrent: number; thermalVoltage: number; forwardBeta: number; reverseBeta: number };

const si = (polarity: "npn" | "pnp", forwardBeta: number): Bjt => ({ polarity, saturationCurrent: 1e-14, thermalVoltage: 0.02585, forwardBeta, reverseBeta: 1 });
const ge = (polarity: "npn" | "pnp", forwardBeta: number): Bjt => ({ polarity, ...GENERIC_GERMANIUM_PNP, forwardBeta });

const BJTS: [string, Bjt][] = [
  ["2N5088", si("npn", 1000)],
  ["2N5089", si("npn", 1500)],
  ["2N3904", si("npn", 100)],
  ["2N4401", si("npn", 150)],
  ["2N2222", si("npn", 150)],
  ["MPS2222", si("npn", 150)],
  ["2N5551", si("npn", 120)],
  ["PN3565", si("npn", 250)],
  ["2N3565", si("npn", 250)],
  ["2N4123", si("npn", 60)],
  ["2N2219", si("npn", 60)],
  ["2N2369", si("npn", 100)],
  ["BC183C", si("npn", 600)],
  ["BC183B", si("npn", 330)],
  ["BC183", si("npn", 250)],
  ["BC184", si("npn", 500)],
  ["BC108", si("npn", 450)],
  ["BC109", si("npn", 500)],
  ["BC239", si("npn", 400)],
  ["BC549", si("npn", 600)],
  ["BC550", si("npn", 600)],
  ["BC547", si("npn", 300)],
  ["BC337", si("npn", 250)],
  ["2SC828", si("npn", 200)],
  ["2SC829", si("npn", 200)],
  ["2SC536", si("npn", 200)],
  ["2SC644", si("npn", 250)],
  ["2SC1815", si("npn", 250)],
  ["MPSA18", si("npn", 1000)],
  ["MPSA13", si("npn", 10000)],
  ["MPSA14", si("npn", 15000)],
  ["2N3906", si("pnp", 120)],
  ["2N5087", si("pnp", 500)],
  ["2N4125", si("pnp", 100)],
  ["2N2907", si("pnp", 150)],
  ["AC128", ge("pnp", 80)],
  ["AC125", ge("pnp", 90)],
  ["OC44", ge("pnp", 70)],
  ["OC75", ge("pnp", 70)],
  ["NKT275", ge("pnp", 80)],
  ["2N404", ge("pnp", 60)],
  ["GE-PNP", ge("pnp", 80)],
  ["GE-NPN", ge("npn", 80)],
  ["AC187", ge("npn", 100)],
];

type Jfet = { idss: number; pinchOffVoltage: number; bodyDiode?: boolean };
/**
 * Enhancement MOSFETs ride on the JFET square law with a positive "pinch-off" (the threshold): the solver's
 * Id = Idss*(1 - Vgs/Vp)^2 equals K*(Vgs - Vth)^2 when Idss = K*Vth^2, and is zero below Vth. Saturation only
 * (no triode region); the source-drain body diode is added as a separate silicon diode by the converter, since the
 * OCD-style clippers use one MOSFET diode-connected and the other purely as its body diode.
 */
const mosfet = (vth: number, k: number): Jfet => ({ idss: k * vth * vth, pinchOffVoltage: vth, bodyDiode: true });
const JFETS: [string, Jfet][] = [
  ["2N7000", mosfet(2.1, 0.09)],
  ["2N7002", mosfet(2.1, 0.09)],
  ["BS170", mosfet(2.0, 0.12)],
  ["BS250", mosfet(2.0, 0.12)],
  ["J201", JFET_J201],
  ["MMBFJ201", JFET_J201],
  ["2N5457", JFET_2N5457],
  ["MMBF5457", JFET_2N5457],
  ["MPF102", JFET_MPF102],
  ["2N5484", { idss: 2.5e-3, pinchOffVoltage: -1.5 }],
  ["2N5952", { idss: 1.6e-3, pinchOffVoltage: -1.3 }],
  ["J309", { idss: 20e-3, pinchOffVoltage: -2.5 }],
  ["J310", { idss: 40e-3, pinchOffVoltage: -4.0 }],
  ["2SK30", { idss: 2.0e-3, pinchOffVoltage: -1.0 }],
  ["KSK30", { idss: 2.0e-3, pinchOffVoltage: -1.0 }],
  ["2SK209", { idss: 4.0e-3, pinchOffVoltage: -0.7 }], // GR grade (Idss 2.6-6.5mA)
];

type Diode = typeof SILICON_DIODE_1N4148 & { breakdownVoltage?: number };
const DIODES: [string, Diode][] = [
  ["1N4148", SILICON_DIODE_1N4148],
  ["1N914", SILICON_DIODE_1N4148],
  ["1N916", SILICON_DIODE_1N4148],
  ["1S1588", SILICON_DIODE_1N4148],
  ["1S2473", SILICON_DIODE_1N4148],
  ["1N400", SILICON_DIODE_1N4148],
  ["BA282", SILICON_DIODE_1N4148],
  ["BA482", SILICON_DIODE_1N4148],
  ["MA856", SILICON_DIODE_1N4148],
  ["ZENER", SILICON_DIODE_1N4148], // bare "ZENER" (gate-protection parts whose voltage was not read): forward diode only, as before
  ["1N34", GERMANIUM_DIODE],
  ["1N60", GERMANIUM_DIODE],
  ["1N270", GERMANIUM_DIODE],
  ["D9", GERMANIUM_DIODE],
  ["BAT41", SCHOTTKY_1N5817],
  ["BAT43", SCHOTTKY_1N5817],
  ["BAT46", SCHOTTKY_1N5817],
  ["1N5817", SCHOTTKY_1N5817],
  ["1N5818", SCHOTTKY_1N5817],
  ["1N5819", SCHOTTKY_1N5817],
  ["LED-RED", RED_LED],
  ["LED-GREEN", GREEN_LED],
  ["LED-YELLOW", GREEN_LED],
  ["LED-BLUE", BLUE_LED],
  ["LED-WHITE", BLUE_LED],
];

/** Zener series whose part number carries no voltage: nominal voltages in order from the first number of each series. */
const zenerSeries = (prefix: string, first: number, volts: number[]): [string, number][] => volts.map((v, i) => [`${prefix}${first + i}`, v]);
const ZENERS: [string, number][] = [
  // 1N4728A..1N4749A (1W)
  ...zenerSeries("1N47", 28, [3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10, 11, 12, 13, 15, 16, 18, 20, 22, 24]),
  // 1N5226B..1N5250B (500mW)
  ...zenerSeries("1N52", 26, [3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.0, 6.2, 6.8, 7.5, 8.2, 8.7, 9.1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
];

/**
 * Zener voltage from how a map writes the part: the silk-style "3V3" / "9V1" / "12V", "ZENER3V3" / "ZENER3.3" / "ZD9V1", a
 * BZX55/BZX79/BZX85/BZV55 code ("BZX55C3V3", "BZX79-C9V1"), or a 1N47xx/1N52xx number. Bare "ZENER" has no voltage.
 */
function zenerVoltage(part: string): number | undefined {
  const key = part.toUpperCase().replace(/[\s-]/g, "");
  const m = /^(?:ZENER|ZD|BZ[XV]\d+[ABC]?)?(\d+)(?:V(\d*)|\.(\d+)V?)$/.exec(key);
  if (m) return Number(`${m[1]}.${m[2] || m[3] || "0"}`);
  return ZENERS.find(([prefix]) => key.startsWith(prefix))?.[1];
}

/** A zener as a silicon diode with reverse breakdown at its nominal voltage (1mA at the knee; see components/diode.ts). */
export const zenerModel = (part: string): Diode | undefined => {
  const breakdownVoltage = zenerVoltage(part);
  return breakdownVoltage === undefined ? undefined : { ...SILICON_DIODE_1N4148, breakdownVoltage };
};

type OpAmp = typeof TL072_APPROX;
type OpAmpPinout = { channels: readonly { out: string; inMinus: string; inPlus: string }[]; vPlus: string; vMinus: string };

/** Toshiba TA7136AP, the early Boss DS-1's preamp: one op-amp in a 7-pin SIP, pin 1 at the ringed end. Toshiba lists the
 * supply between pins 7 and 4; the DS ONE board puts the signal (biased from Vref) on pin 2, the gain divider on pin 3 and
 * the clipper feed on pin 6, so + and - in sit the other way round from an 8-pin single. Pin 1 takes the compensation cap
 * to the output and pin 5 a bias resistor to V+ - neither is simulated. */
const TA7136_PINOUT: OpAmpPinout = { channels: [{ out: "6", inMinus: "3", inPlus: "2" }], vPlus: "7", vMinus: "4" };

/** [prefix, model, channels in the package: 1 or 2 for 8-pin, 4 for 14-pin quads, pinout when not the standard one] */
const OPAMPS: [string, OpAmp, 1 | 2 | 4, OpAmpPinout?][] = [
  ["TL074", TL072_APPROX, 4],
  ["TL084", TL072_APPROX, 4],
  ["TL064", TL072_APPROX, 4],
  ["LM324", JRC4558_APPROX, 4],
  ["JRC3403", JRC4558_APPROX, 4],
  ["RC3403", JRC4558_APPROX, 4],
  ["LM3403", JRC4558_APPROX, 4],
  ["TL072", TL072_APPROX, 2],
  ["TL082", TL072_APPROX, 2],
  ["TL062", TL072_APPROX, 2],
  ["TL022", TL072_APPROX, 2],
  ["NJM072", TL072_APPROX, 2],
  ["LF353", TL072_APPROX, 2],
  ["LF442", TL072_APPROX, 2],
  ["TL071", TL072_APPROX, 1],
  ["TL081", TL072_APPROX, 1],
  ["TL061", TL072_APPROX, 1],
  ["LF351", TL072_APPROX, 1],
  ["JRC4558", JRC4558_APPROX, 2],
  ["RC4558", JRC4558_APPROX, 2],
  ["NJM4558", JRC4558_APPROX, 2],
  ["JRC4559", JRC4558_APPROX, 2],
  ["JRC4580", JRC4558_APPROX, 2],
  ["NJM4580", JRC4558_APPROX, 2],
  ["MC1458", JRC4558_APPROX, 2],
  ["LM1458", JRC4558_APPROX, 2],
  ["LM358", JRC4558_APPROX, 2],
  ["NE5532", NE5532_APPROX, 2],
  ["UPC4570", NE5532_APPROX, 2],
  ["NJM4570", NE5532_APPROX, 2],
  ["NJM4565", JRC4558_APPROX, 2],
  ["JRC4565", JRC4558_APPROX, 2],
  ["LM833", NE5532_APPROX, 2],
  ["MC33178", NE5532_APPROX, 2],
  ["OPA2134", TL072_APPROX, 2],
  ["LM741", LM741_APPROX, 1],
  ["UA741", LM741_APPROX, 1],
  ["CA741", LM741_APPROX, 1],
  ["LM308", LM308_APPROX, 1],
  ["LM301", LM741_APPROX, 1],
  ["CA3130", CA3130_APPROX, 1],
  ["CA3240", CA3130_APPROX, 2],
  ["OP07", OP07_APPROX, 1],
  // An externally compensated bipolar preamp (150p on pin 1 in the DS-1): about as slow as a 741.
  ["TA7136", LM741_APPROX, 1, TA7136_PINOUT],
];

const lookup = <T>(table: [string, T][], part: string): T | undefined => {
  const key = part.toUpperCase().replace(/\s+/g, "");
  return table.find(([prefix]) => key.startsWith(prefix))?.[1];
};

export const bjtModel = (part: string): Bjt | undefined => lookup(BJTS, part);
export const jfetModel = (part: string): Jfet | undefined => lookup(JFETS, part);
export const diodeModel = (part: string): Diode | undefined => zenerModel(part) ?? lookup(DIODES, part);

export function opAmpModel(part: string): { model: OpAmp; channels: 1 | 2 | 4; pinout: OpAmpPinout } | undefined {
  const key = part.toUpperCase().replace(/\s+/g, "");
  const hit = OPAMPS.find(([prefix]) => key.startsWith(prefix));
  return hit ? { model: hit[1], channels: hit[2], pinout: hit[3] ?? OPAMP_PINOUT[hit[2]] } : undefined;
}

type Transformer = { primaryInductance: number; secondaryInductance: number; coupling: number };
/**
 * Audio transformers: full-winding inductances in henries (primary as the maker marks it) and the coupling coefficient.
 * Xicon 42TM022 is 1.5K CT : 600R CT, three pins a side. Electrokit's listing gives 570mH and 195mH, a 1.71 turns ratio
 * (sqrt(570/195)) that matches its quoted 1.725. Leakage is not published; k = 0.99 is usual for a small EI-core part.
 */
const TRANSFORMERS: [string, Transformer][] = [["42TM022", { primaryInductance: 0.57, secondaryInductance: 0.195, coupling: 0.99 }]];

export const transformerModel = (part: string): Transformer | undefined => lookup(TRANSFORMERS, part);

/** Standard op-amp pinouts (8-pin single/dual, 14-pin quad): which package pin is which input/output of each channel. */
export const OPAMP_PINOUT = {
  1: { channels: [{ out: "6", inMinus: "2", inPlus: "3" }], vPlus: "7", vMinus: "4" },
  2: {
    channels: [
      { out: "1", inMinus: "2", inPlus: "3" },
      { out: "7", inMinus: "6", inPlus: "5" },
    ],
    vPlus: "8",
    vMinus: "4",
  },
  4: {
    channels: [
      { out: "1", inMinus: "2", inPlus: "3" },
      { out: "7", inMinus: "6", inPlus: "5" },
      { out: "8", inMinus: "9", inPlus: "10" },
      { out: "14", inMinus: "13", inPlus: "12" },
    ],
    vPlus: "4",
    vMinus: "11",
  },
} as const;
