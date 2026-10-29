/**
 * A circuit read off a DIY kit's board layout (see .claude/skills/pcb-to-netlist): the parts as sold
 * in the kit's parts list, each with the nets its leads land on. Net names are "in", "out", "vcc"
 * (the board's 9V pad), "0" (ground) and n1, n2 ... for everything else.
 *
 * It records the board as built - part numbers and printed values - rather than solver elements;
 * kitToPreset turns it into a PedalPreset, choosing a simulation model for each part number.
 */
import type { LayoutSpot } from "../types";

export type KitPartKind = "R" | "C" | "L" | "D" | "Q" | "POT" | "IC";

export interface KitPart {
  ref: string;
  kind: KitPartKind;
  /** Printed value: "4.7K", "470R", "220n", "22uF", "500mH", pots with taper "B100K". */
  value?: string;
  /** Part number for semiconductors: "2N5088", "1N4148", "TL072". */
  part?: string;
  /**
   * Two-lead parts: [a, b]; diodes {a, k}; transistors {b, c, e} or JFETs {g, d, s};
   * pots [lug1, wiper, lug3]; ICs {"1": net, "2": net, ...} by package pin.
   */
  nodes: string[] | Record<string, string>;
}

export interface KitCircuit {
  id: string;
  /** pedalparts.co.kr product number of the kit the board belongs to. */
  goodsNo: string;
  kitName: string;
  /** The pedal the kit reproduces, as builders call it ("Colorsound Overdriver"). */
  motif: string;
  /** Effect family, as in references/pcb-kits/index.json ("overdrive", "fuzz", ...). */
  type: string;
  description: string;
  /** Supply voltage on the "vcc" net. */
  supply: number;
  parts: KitPart[];
  /** Functional stages in signal order (input, preamp, controls, clipper, output...), each listing
   * part refs - loaded as blocks so the schematic reads left to right by stage. */
  stages?: KitStage[];
  /** Hand-drawn schematic placement by part ref (plus V1, VCC, RLOAD; op-amp channels as U1A/U1B). */
  layout?: Record<string, LayoutSpot>;
}

export interface KitStage {
  id: string;
  /** A BlockCategory: input, buffer, gain, clipping, fuzz, tone, output, power, custom. */
  category: string;
  label: string;
  parts: string[];
}

/** What a kit preset carries beyond an ordinary preset, for the library to list it as a kit. */
export interface KitMeta {
  goodsNo: string;
  kitName: string;
  motif: string;
  family: string;
}
