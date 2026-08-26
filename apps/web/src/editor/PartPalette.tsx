import { PART_DEFS, type PartType } from "./partDefs";
import { PartSymbol } from "./symbols";

interface PartPaletteProps {
  onAdd: (type: PartType) => void;
}

export function PartPalette({ onAdd }: PartPaletteProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Object.values(PART_DEFS).map((def) => (
        <button
          key={def.type}
          type="button"
          onClick={() => onAdd(def.type)}
          style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}
        >
          <svg width={30} height={20} viewBox="-40 -30 80 60" style={{ flexShrink: 0, overflow: "visible" }}>
            <PartSymbol part={{ id: "", type: def.type, x: 0, y: 0, rotation: 0, params: def.defaultParams }} />
          </svg>
          {def.label}
        </button>
      ))}
    </div>
  );
}
