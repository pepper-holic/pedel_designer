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

type Jfet = { idss: number; pinchOffVoltage: number };
const JFETS: [string, Jfet][] = [
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
];

type Diode = typeof SILICON_DIODE_1N4148;
const DIODES: [string, Diode][] = [
  ["1N4148", SILICON_DIODE_1N4148],
  ["1N914", SILICON_DIODE_1N4148],
  ["1S1588", SILICON_DIODE_1N4148],
  ["1S2473", SILICON_DIODE_1N4148],
  ["1N400", SILICON_DIODE_1N4148],
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

type OpAmp = typeof TL072_APPROX;
/** [prefix, model, channels in the 8-pin package] */
const OPAMPS: [string, OpAmp, 1 | 2][] = [
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
  ["JRC3403", JRC4558_APPROX, 2],
  ["MC1458", JRC4558_APPROX, 2],
  ["LM1458", JRC4558_APPROX, 2],
  ["LM358", JRC4558_APPROX, 2],
  ["NE5532", NE5532_APPROX, 2],
  ["LM833", NE5532_APPROX, 2],
  ["LM741", LM741_APPROX, 1],
  ["UA741", LM741_APPROX, 1],
  ["CA741", LM741_APPROX, 1],
  ["LM308", LM308_APPROX, 1],
  ["LM301", LM741_APPROX, 1],
  ["CA3130", CA3130_APPROX, 1],
  ["OP07", OP07_APPROX, 1],
];

const lookup = <T>(table: [string, T][], part: string): T | undefined => {
  const key = part.toUpperCase().replace(/\s+/g, "");
  return table.find(([prefix]) => key.startsWith(prefix))?.[1];
};

export const bjtModel = (part: string): Bjt | undefined => lookup(BJTS, part);
export const jfetModel = (part: string): Jfet | undefined => lookup(JFETS, part);
export const diodeModel = (part: string): Diode | undefined => lookup(DIODES, part);

export function opAmpModel(part: string): { model: OpAmp; channels: 1 | 2 } | undefined {
  const key = part.toUpperCase().replace(/\s+/g, "");
  const hit = OPAMPS.find(([prefix]) => key.startsWith(prefix));
  return hit ? { model: hit[1], channels: hit[2] } : undefined;
}

/** Standard 8-pin op-amp pinouts: which package pin is which input/output of each channel. */
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
} as const;
