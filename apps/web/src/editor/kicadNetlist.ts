import type { PartInstance } from "./types";
import type { GraphNetlist } from "./netlistFromGraph";
import { PART_DEFS, type PartType } from "./partDefs";
import { partValueLabel } from "./valueLabel";

interface KicadSymbol {
  lib: string;
  part: string;
}

/** Maps this app's part types to a plausible KiCad `Device`/`Connector` library symbol, so the
 * exported netlist opens as *something* recognizable in KiCad rather than an unresolved reference.
 * Footprints are intentionally left blank - this tool has no footprint library, so assigning real
 * footprints (and double-checking these symbol choices) is a step the user still does in KiCad. */
function kicadSymbol(part: PartInstance): KicadSymbol {
  switch (part.type) {
    case "resistor":
      return { lib: "Device", part: "R" };
    case "capacitor":
      return { lib: "Device", part: "C" };
    case "inductor":
      return { lib: "Device", part: "L" };
    case "diode":
      return { lib: "Device", part: "D" };
    case "bjt":
      return { lib: "Device", part: String(part.params.polarity) === "pnp" ? "Q_PNP_BCE" : "Q_NPN_BCE" };
    case "jfet":
      return { lib: "Device", part: "Q_NJFET_DGS" };
    case "opamp":
      return { lib: "Amplifier_Operational", part: "OPAMP" };
    case "potentiometer":
      return { lib: "Device", part: "R_POT" };
    case "spst":
      return { lib: "Switch", part: "SW_SPST" };
    case "spdt":
      return { lib: "Switch", part: "SW_SPDT" };
    case "dpdt":
      return { lib: "Switch", part: "SW_DPDT_x2" };
    case "pickup":
      // KiCad has no guitar-pickup symbol; a 2-pin connector is the honest stand-in for "the coil
      // leads enter the circuit here", same reasoning as the vsource case below.
      return { lib: "Connector", part: "Conn_01x02" };
    case "vsource":
      // Not a real component on the board - this stands in for wherever the input signal actually
      // enters the circuit (an input jack, a send from a previous pedal, ...).
      return { lib: "Connector", part: "Conn_01x02" };
    case "ground":
      return { lib: "power", part: "GND" };
  }
}

function kicadValue(part: PartInstance): string {
  if (part.type === "vsource") return "입력 신호원 (예: 입력 잭)";
  if (part.type === "bjt") return String(part.params.polarity ?? "npn").toUpperCase();
  if (part.type === "ground") return "GND";
  return partValueLabel(part) ?? PART_DEFS[part.type].label;
}

const EXCLUDED_FROM_COMPONENTS: PartType[] = ["ground"];

function escapeQuotes(text: string): string {
  return text.replace(/"/g, '\\"');
}

/**
 * Renders placed parts + their resolved connectivity as a KiCad-style S-expression netlist
 * (the classic `(export (components ...) (nets ...))` shape KiCad's PCB editor reads via
 * File > Import > Netlist). Component footprints are left blank and symbol choices above are a
 * best-effort guess, not a guarantee they exactly match KiCad's bundled libraries - review both
 * before routing a board from this. Ground gets no component entry (it's a net name, not a part).
 */
export function buildKicadNetlist(parts: PartInstance[], graph: GraphNetlist, projectName: string): string {
  const includedParts = parts.filter((p) => !EXCLUDED_FROM_COMPONENTS.includes(p.type));

  const components = includedParts
    .map((part) => {
      const symbol = kicadSymbol(part);
      return [
        `    (comp (ref "${escapeQuotes(part.id)}")`,
        `      (value "${escapeQuotes(kicadValue(part))}")`,
        `      (footprint "")`,
        `      (libsource (lib "${symbol.lib}") (part "${symbol.part}") (description ""))`,
        `      (sheetpath (names "/") (tstamps "/")))`,
      ].join("\n");
    })
    .join("\n");

  const nodesByNet = new Map<string, { ref: string; pin: string }[]>();
  for (const part of includedParts) {
    const terminals = PART_DEFS[part.type].terminals;
    terminals.forEach((terminal, i) => {
      const netName = graph.terminalNet.get(`${part.id}:${terminal.id}`);
      if (!netName) return;
      if (!nodesByNet.has(netName)) nodesByNet.set(netName, []);
      nodesByNet.get(netName)!.push({ ref: part.id, pin: String(i + 1) });
    });
  }

  const netEntries = Array.from(nodesByNet.entries()).filter(([, nodes]) => nodes.length > 0);
  const nets = netEntries
    .map(([netName, nodes], index) => {
      const nodeLines = nodes.map((n) => `      (node (ref "${escapeQuotes(n.ref)}") (pin "${n.pin}"))`).join("\n");
      return `    (net (code "${index + 1}") (name "${escapeQuotes(netName === "0" ? "GND" : netName)}")\n${nodeLines})`;
    })
    .join("\n");

  return [
    `(export (version "D")`,
    `  (design`,
    `    (source "${escapeQuotes(projectName)}")`,
    `    (tool "Pedal Designer"))`,
    `  (components`,
    components,
    `  )`,
    `  (nets`,
    nets,
    `  )`,
    `)`,
  ].join("\n");
}
