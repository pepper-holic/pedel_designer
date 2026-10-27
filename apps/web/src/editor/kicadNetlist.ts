import type { PartInstance } from "./types";
import type { GraphNetlist } from "./netlistFromGraph";
import { buildBoardNetlist } from "./pcb/boardNetlist";

function escapeQuotes(text: string): string {
  return text.replace(/"/g, '\\"');
}

/**
 * Renders the circuit as a KiCad netlist (the classic `(export (components ...) (nets ...))` shape
 * KiCad's PCB editor reads via File > Import > Netlist). Every component carries a real KiCad
 * footprint and a symbol whose pin numbers match its pads (see pcb/boardNetlist.ts), so the board
 * opens with nothing left unassigned. The board's added connectors (output jack, op-amp power)
 * are included; ground is a net, not a component.
 */
export function buildKicadNetlist(parts: PartInstance[], graph: GraphNetlist, projectName: string, outputNode = ""): string {
  const board = buildBoardNetlist(parts, graph, outputNode);

  const components = board.components
    .map((c) =>
      [
        `    (comp (ref "${escapeQuotes(c.ref)}")`,
        `      (value "${escapeQuotes(c.value)}")`,
        `      (footprint "${escapeQuotes(c.footprint.kicadName)}")`,
        `      (libsource (lib "${c.symbol.lib}") (part "${c.symbol.part}") (description ""))`,
        `      (sheetpath (names "/") (tstamps "/")))`,
      ].join("\n"),
    )
    .join("\n");

  const nets = board.nets
    .map((net, index) => {
      const nodeLines = board.components
        .flatMap((c) => c.pads.filter((p) => p.net === net).map((p) => `      (node (ref "${escapeQuotes(c.ref)}") (pin "${p.number}"))`))
        .join("\n");
      return `    (net (code "${index + 1}") (name "${escapeQuotes(net)}")\n${nodeLines})`;
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
