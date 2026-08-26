import { useMemo, useState } from "react";
import { PART_DEFS } from "./partDefs";
import { PartSymbol } from "./symbols";
import { terminalPosition, orthogonalPath } from "./geometry";
import type { PartInstance, TerminalRef, Wire } from "./types";

interface SchematicCanvasProps {
  parts: PartInstance[];
  wires: Wire[];
  selectedPartId: string | null;
  onMovePart: (id: string, x: number, y: number) => void;
  onSelectPart: (id: string | null) => void;
  onAddWire: (a: TerminalRef, b: TerminalRef) => void;
  width?: number;
  height?: number;
}

function terminalKey(ref: TerminalRef): string {
  return `${ref.partId}:${ref.terminalId}`;
}

/** SVG schematic canvas: drag parts by their body, click two terminals in sequence to wire them together. */
export function SchematicCanvas({ parts, wires, selectedPartId, onMovePart, onSelectPart, onAddWire, width = 900, height = 460 }: SchematicCanvasProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pendingTerminal, setPendingTerminal] = useState<TerminalRef | null>(null);

  const svgPoint = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleBodyMouseDown = (part: PartInstance, e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    setDragId(part.id);
    setDragOffset({ x: e.clientX - rect.left - part.x, y: e.clientY - rect.top - part.y });
    onSelectPart(part.id);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragId) return;
    const p = svgPoint(e);
    onMovePart(dragId, p.x - dragOffset.x, p.y - dragOffset.y);
  };

  const handleTerminalClick = (ref: TerminalRef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!pendingTerminal) {
      setPendingTerminal(ref);
      return;
    }
    if (pendingTerminal.partId === ref.partId && pendingTerminal.terminalId === ref.terminalId) {
      setPendingTerminal(null);
      return;
    }
    onAddWire(pendingTerminal, ref);
    setPendingTerminal(null);
  };

  // A junction dot is drawn wherever 3+ wire ends meet at the same terminal - a real electrical
  // junction, as opposed to a plain 2-wire pass-through or two wires merely crossing visually.
  const junctionPoints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wire of wires) {
      counts.set(terminalKey(wire.a), (counts.get(terminalKey(wire.a)) ?? 0) + 1);
      counts.set(terminalKey(wire.b), (counts.get(terminalKey(wire.b)) ?? 0) + 1);
    }
    const points: { x: number; y: number }[] = [];
    for (const [key, count] of counts) {
      if (count < 3) continue;
      const [partId, terminalId] = key.split(":");
      const part = parts.find((p) => p.id === partId);
      if (part) points.push(terminalPosition(part, terminalId));
    }
    return points;
  }, [wires, parts]);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", cursor: dragId ? "grabbing" : "default" }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragId(null)}
      onMouseLeave={() => setDragId(null)}
      onClick={() => onSelectPart(null)}
    >
      <rect width={width} height={height} fill="var(--bg-inset)" />

      {wires.map((wire) => {
        const partA = parts.find((p) => p.id === wire.a.partId);
        const partB = parts.find((p) => p.id === wire.b.partId);
        if (!partA || !partB) return null;
        const pa = terminalPosition(partA, wire.a.terminalId);
        const pb = terminalPosition(partB, wire.b.terminalId);
        return <path key={wire.id} d={orthogonalPath(pa, pb)} stroke="var(--wire)" strokeWidth={2} fill="none" />;
      })}

      {junctionPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="var(--wire)" />
      ))}

      {parts.map((part) => {
        const def = PART_DEFS[part.type];
        const isSelected = part.id === selectedPartId;
        return (
          <g key={part.id} transform={`translate(${part.x},${part.y}) rotate(${part.rotation})`}>
            {isSelected && (
              <rect x={-40} y={-38} width={80} height={76} rx={6} fill="none" stroke="var(--accent)" strokeWidth={1.2} strokeDasharray="3 2" />
            )}
            <rect
              x={-40}
              y={-38}
              width={80}
              height={76}
              fill="transparent"
              onMouseDown={(e) => handleBodyMouseDown(part, e)}
              style={{ cursor: "grab", pointerEvents: "all" }}
            />
            <PartSymbol part={part} />
            <text textAnchor="middle" y={-30} fill="var(--text-dim)" fontSize={10} fontFamily="var(--font-mono)" pointerEvents="none">
              {part.id}
            </text>
            {def.terminals.map((t) => (
              <circle
                key={t.id}
                cx={t.dx}
                cy={t.dy}
                r={4}
                fill={pendingTerminal?.partId === part.id && pendingTerminal.terminalId === t.id ? "var(--accent)" : "var(--wire)"}
                onClick={(e) => handleTerminalClick({ partId: part.id, terminalId: t.id }, e)}
                style={{ cursor: "crosshair" }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
