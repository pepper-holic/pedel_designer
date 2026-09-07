import { netlistFromGraph } from "./netlistFromGraph";
import { PART_DEFS, type PartType } from "./partDefs";
import type { PartInstance, Wire } from "./types";

export type DrcSeverity = "error" | "warning";

export interface DrcIssue {
  code: string;
  severity: DrcSeverity;
  message: string;
  /** Parts the issue is about, so the UI can offer to select them on the canvas. */
  partIds: string[];
}

/**
 * Parts whose every terminal must be connected for them to do anything. A resistor with one leg in
 * the air carries no current; a pot or a switch with one lug open is ordinary wiring (a tone pot's
 * third lug, a push-pull's unused throw), so those are only worth a warning.
 */
const TWO_TERMINAL_TYPES: PartType[] = ["resistor", "capacitor", "inductor", "diode", "pickup", "spst"];

/**
 * Design rule check over a placed circuit.
 *
 * The point is to say *why* nothing is happening. Until now a circuit with no ground, no source or
 * a floating node simply produced empty analysis panels or a solver error, and working out which of
 * those it was meant reading the schematic by eye - the single biggest wall for a beginner
 * (docs/plan-ux-and-features.md §1-4).
 */
export function runDrc(parts: PartInstance[], wires: Wire[], outputNode: string): DrcIssue[] {
  const issues: DrcIssue[] = [];
  if (parts.length === 0) return issues;

  const graph = netlistFromGraph(parts, wires);

  if (!parts.some((p) => p.type === "ground")) {
    issues.push({
      code: "no-ground",
      severity: "error",
      message: "접지가 없습니다. 모든 회로에는 기준이 되는 접지가 최소 하나 필요합니다.",
      partIds: [],
    });
  }

  if (graph.inputSourceId === null) {
    issues.push({
      code: "no-signal-source",
      severity: "error",
      message: "입력 신호원이 없습니다. 전압원(입력)이나 픽업을 추가하고 배선하세요.",
      partIds: [],
    });
  }

  // How many terminals share each net. A net with exactly one terminal on it connects to nothing.
  const terminalsPerNet = new Map<string, number>();
  for (const net of graph.terminalNet.values()) terminalsPerNet.set(net, (terminalsPerNet.get(net) ?? 0) + 1);

  const isolated: string[] = [];
  const dangling: string[] = [];
  const openLug: string[] = [];

  for (const part of parts) {
    const terminals = PART_DEFS[part.type].terminals;
    const unconnected = terminals.filter((t) => (terminalsPerNet.get(graph.terminalNet.get(`${part.id}:${t.id}`) ?? "") ?? 0) < 2);
    if (unconnected.length === 0) continue;

    if (unconnected.length === terminals.length) {
      isolated.push(part.id);
    } else if (TWO_TERMINAL_TYPES.includes(part.type)) {
      dangling.push(part.id);
    } else {
      openLug.push(part.id);
    }
  }

  if (isolated.length > 0) {
    issues.push({
      code: "isolated-part",
      severity: "error",
      message: `배선이 하나도 없는 부품이 있습니다: ${isolated.join(", ")}. 단자를 클릭해 연결하세요.`,
      partIds: isolated,
    });
  }
  if (dangling.length > 0) {
    issues.push({
      code: "dangling-lead",
      severity: "error",
      message: `한쪽 단자가 떠 있는 부품이 있습니다: ${dangling.join(", ")}. 전류가 흐르지 않아 회로에 영향을 주지 않습니다.`,
      partIds: dangling,
    });
  }
  if (openLug.length > 0) {
    issues.push({
      code: "open-lug",
      severity: "warning",
      message: `연결되지 않은 단자가 있는 부품: ${openLug.join(", ")}. 톤 포트의 남는 러그나 푸시풀의 미사용 접점처럼 의도적인 경우도 많습니다.`,
      partIds: openLug,
    });
  }

  const shorted = parts.filter(
    (p) =>
      p.type === "vsource" &&
      graph.terminalNet.get(`${p.id}:positive`) !== undefined &&
      graph.terminalNet.get(`${p.id}:positive`) === graph.terminalNet.get(`${p.id}:negative`),
  );
  if (shorted.length > 0) {
    issues.push({
      code: "shorted-source",
      severity: "error",
      message: `전압원의 양 단자가 같은 넷에 연결돼 단락됐습니다: ${shorted.map((p) => p.id).join(", ")}.`,
      partIds: shorted.map((p) => p.id),
    });
  }

  if (!outputNode) {
    issues.push({
      code: "no-output-node",
      severity: "warning",
      message: "출력 노드가 선택되지 않아 분석 탭이 비어 있습니다. 오른쪽 '출력 노드'에서 고르세요.",
      partIds: [],
    });
  }

  return issues;
}
