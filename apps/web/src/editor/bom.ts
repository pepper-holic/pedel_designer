import type { PartInstance } from "./types";
import { PART_DEFS, type PartType } from "./partDefs";
import { DIODE_MODELS } from "../core/library/deviceModels";
import { partValueLabel } from "./valueLabel";
import { footprintFor } from "./pcb/footprintAssign";

export interface BomRow {
  label: string;
  /** Physical package (footprint), so a 100nF film box and a 100nF ceramic are separate lines. */
  package: string;
  quantity: number;
  partIds: string[];
}

/** Signal-source and ground symbols aren't physical components to buy - they represent the test
 * input and the reference net, not a part that goes on the stripboard/PCB. */
const NON_PURCHASABLE_TYPES: PartType[] = ["vsource", "ground"];

const DIODE_MATCH_TOLERANCE = 1e-6;

function diodeModelLabel(part: PartInstance): string {
  const match = Object.values(DIODE_MODELS).find(
    (m) =>
      Math.abs(Number(part.params.saturationCurrent) - m.params.saturationCurrent) < DIODE_MATCH_TOLERANCE &&
      Math.abs(Number(part.params.emissionCoefficient) - m.params.emissionCoefficient) < DIODE_MATCH_TOLERANCE,
  );
  return match ? match.label : "다이오드 (커스텀)";
}

function bomKeyAndLabel(part: PartInstance): { key: string; label: string } {
  const def = PART_DEFS[part.type];
  switch (part.type) {
    case "resistor":
    case "capacitor":
    case "inductor":
    case "potentiometer": {
      const value = partValueLabel(part) ?? "";
      return { key: `${part.type}:${value}`, label: `${def.label} ${value}`.trim() };
    }
    case "diode": {
      const label = diodeModelLabel(part);
      return { key: `diode:${label}`, label };
    }
    case "bjt": {
      const polarity = String(part.params.polarity ?? "npn").toUpperCase();
      return { key: `bjt:${polarity}`, label: `트랜지스터 (${polarity})` };
    }
    default:
      return { key: part.type, label: def.label };
  }
}

/** Aggregates placed parts into a bill of materials: one row per (type, value/model) with the
 * placed part ids that make it up, sorted alphabetically by label. */
export function buildBom(parts: PartInstance[]): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const part of parts) {
    if (NON_PURCHASABLE_TYPES.includes(part.type)) continue;
    const { key, label } = bomKeyAndLabel(part);
    const pkg = footprintFor(part)?.label ?? "";
    const rowKey = `${key}|${pkg}`;
    if (!rows.has(rowKey)) rows.set(rowKey, { label, package: pkg, quantity: 0, partIds: [] });
    const row = rows.get(rowKey)!;
    row.quantity += 1;
    row.partIds.push(part.id);
  }
  return Array.from(rows.values()).sort((a, b) => a.label.localeCompare(b.label, "ko") || a.package.localeCompare(b.package, "ko"));
}

/** Tab-separated text (label, package, quantity, part ids) suitable for pasting into a spreadsheet. */
export function bomToText(rows: BomRow[]): string {
  const header = "부품\t패키지\t수량\t소자 ID";
  const lines = rows.map((r) => `${r.label}\t${r.package}\t${r.quantity}\t${r.partIds.join(", ")}`);
  return [header, ...lines].join("\n");
}
