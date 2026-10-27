import { DIODE_MODELS, TRANSISTOR_MODELS } from "../../core/library/deviceModels";
import type { PartType } from "../partDefs";
import type { PartInstance } from "../types";
import { FOOTPRINTS, type FootprintDef } from "./footprints";

/** Footprints a part type may use, default first where there is no value-dependent default. */
const OPTIONS: Record<PartType, string[]> = {
  resistor: ["r-axial-10", "r-axial-7", "r-vertical"],
  capacitor: ["c-film-5", "c-film-2.5", "c-film-7.5", "c-disc-2.5", "cp-5", "cp-6.3", "cp-8"],
  inductor: ["l-radial", "wire2"],
  diode: ["d-do35", "d-do41", "led-3", "led-5"],
  bjt: ["to92-ebc", "to92-cbe", "to92-ecb", "to92-bce"],
  jfet: ["to92-dsg", "to92-gsd", "to92-sgd"],
  opamp: ["dip8-single"],
  potentiometer: ["pot-16", "pot-9", "pot-panel"],
  spst: ["wire2"],
  spdt: ["wire3"],
  dpdt: ["wire6"],
  blade3: ["wire3"],
  blade5: ["wire4"],
  rotary6: ["wire7"],
  pickup: ["wire2"],
  vsource: ["wire2"],
  coupledInductors: ["wire4"],
  ground: [],
};

export function footprintOptions(type: PartType): FootprintDef[] {
  return OPTIONS[type].map((id) => FOOTPRINTS[id]);
}

/** True when every numeric value of `model` matches the part's params (a named model from the palette). */
function matchesModel(params: Record<string, number | string>, model: Record<string, number | string>): boolean {
  return Object.entries(model).every(([key, value]) =>
    typeof value === "number" ? Math.abs(Number(params[key]) - value) <= Math.abs(value) * 1e-6 : params[key] === value,
  );
}

const LED_MODELS = ["RED_LED", "GREEN_LED", "BLUE_LED"].map((k) => DIODE_MODELS[k].params);
/** TO-92 parts whose legs are not in the 2N3904's E-B-C order. */
const CBE_TRANSISTORS = [TRANSISTOR_MODELS.BC549.params];

function capacitorDefault(farads: number): string {
  if (farads < 1e-9) return "c-disc-2.5";
  if (farads < 330e-9) return "c-film-5";
  if (farads < 1e-6) return "c-film-7.5";
  if (farads <= 10e-6) return "cp-5";
  if (farads <= 47e-6) return "cp-6.3";
  return "cp-8";
}

/** What a part gets when nobody has chosen: the common DIY choice for its type and value. */
export function defaultFootprintId(part: PartInstance): string | null {
  switch (part.type) {
    case "capacitor":
      return capacitorDefault(Number(part.params.capacitance));
    case "diode":
      if (LED_MODELS.some((m) => matchesModel(part.params, m))) return "led-5";
      if (matchesModel(part.params, DIODE_MODELS["1N5817"].params)) return "d-do41";
      return "d-do35";
    case "bjt":
      return CBE_TRANSISTORS.some((m) => matchesModel(part.params, m)) ? "to92-cbe" : "to92-ebc";
    default:
      return OPTIONS[part.type][0] ?? null;
  }
}

/** The part's footprint: its own choice when valid for its type, else the default. Null for ground. */
export function footprintFor(part: PartInstance): FootprintDef | null {
  if (part.footprintId && OPTIONS[part.type].includes(part.footprintId)) return FOOTPRINTS[part.footprintId];
  const id = defaultFootprintId(part);
  return id ? FOOTPRINTS[id] : null;
}
