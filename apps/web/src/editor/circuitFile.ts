import { deserializeCircuit, serializeCircuit, type StoredCircuit } from "./circuitStorage";
import { PART_DEFS, type PartType } from "./partDefs";

export interface ParseResult {
  circuit: StoredCircuit | null;
  /** Korean message explaining why the file was rejected, or null when it was accepted. */
  error: string | null;
}

/** Pretty-printed so a saved circuit is readable and diffable, not one long line. */
export function circuitToFileText(circuit: StoredCircuit): string {
  return JSON.stringify(JSON.parse(serializeCircuit(circuit)), null, 2);
}

/**
 * Parses a circuit file, validating it hard enough to be safe to render.
 *
 * `deserializeCircuit` is deliberately forgiving because it reads back this app's own autosave. A
 * file the user picked could be anything, and the editor indexes `PART_DEFS[part.type].terminals`
 * on every render - so an unknown part type or a wire pointing at a terminal that does not exist
 * would take the whole canvas down rather than showing a message.
 */
export function parseCircuitFile(raw: string): ParseResult {
  const circuit = deserializeCircuit(raw);
  if (!circuit) return { circuit: null, error: "회로 파일로 읽을 수 없습니다. 이 앱에서 저장한 .json 파일인지 확인하세요." };

  const seen = new Set<string>();
  for (const part of circuit.parts) {
    if (typeof part?.id !== "string" || part.id === "") {
      return { circuit: null, error: "부품에 id가 없습니다. 파일이 손상됐을 수 있습니다." };
    }
    if (seen.has(part.id)) {
      return { circuit: null, error: `부품 id가 중복됩니다: ${part.id}. 배선이 어느 부품을 가리키는지 알 수 없습니다.` };
    }
    seen.add(part.id);
    if (!PART_DEFS[part.type as PartType]) {
      return { circuit: null, error: `알 수 없는 소자 종류입니다: ${String(part.type)} (${part.id}). 더 새 버전에서 저장한 파일일 수 있습니다.` };
    }
    if (!Number.isFinite(part.x) || !Number.isFinite(part.y)) {
      return { circuit: null, error: `부품 좌표가 올바르지 않습니다: ${part.id}.` };
    }
  }

  const partById = new Map(circuit.parts.map((p) => [p.id, p]));
  for (const wire of circuit.wires) {
    for (const end of [wire?.a, wire?.b]) {
      const part = end ? partById.get(end.partId) : undefined;
      if (!part) {
        return { circuit: null, error: `배선이 없는 부품을 가리킵니다: ${String(end?.partId)} (배선 ${String(wire?.id)}).` };
      }
      if (!PART_DEFS[part.type].terminals.some((t) => t.id === end!.terminalId)) {
        return { circuit: null, error: `${part.id}에 없는 단자를 가리키는 배선이 있습니다: ${String(end!.terminalId)}.` };
      }
    }
  }

  return { circuit, error: null };
}
