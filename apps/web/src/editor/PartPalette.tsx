import { useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import { PartSymbol } from "./symbols";
import { DIODE_MODELS, TRANSISTOR_MODELS, JFET_MODELS, PICKUP_MODELS } from "../core/library/deviceModels";

interface PartPaletteProps {
  onAdd: (type: PartType, paramsOverride?: Record<string, number | string>) => void;
}

/** Part types with more than one common real-world variant - clicking these opens a submenu of
 * named models instead of adding a single fixed default (diode/BJT/JFET are otherwise "one size
 * fits all" in the palette, which doesn't match how differently a 1N34A vs an LED, or a 2N5088 vs
 * an AC128, actually behaves in a circuit). */
const MODEL_MENUS: Partial<Record<PartType, Record<string, { label: string; params: Record<string, number | string> }>>> = {
  diode: DIODE_MODELS,
  bjt: TRANSISTOR_MODELS,
  jfet: JFET_MODELS,
  pickup: PICKUP_MODELS,
};

export function PartPalette({ onAdd }: PartPaletteProps) {
  const [openMenu, setOpenMenu] = useState<PartType | null>(null);

  return (
    <div className="part-palette">
      {Object.values(PART_DEFS).map((def) => {
        const menu = MODEL_MENUS[def.type];
        const isOpen = openMenu === def.type;

        if (!menu) {
          return (
            <button key={def.type} type="button" className="part-palette-item" onClick={() => onAdd(def.type)}>
              <svg width={30} height={20} viewBox="-40 -30 80 60" className="part-palette-icon">
                <PartSymbol part={{ id: "", type: def.type, x: 0, y: 0, rotation: 0, params: def.defaultParams }} />
              </svg>
              {def.label}
            </button>
          );
        }

        return (
          <div key={def.type} className="part-palette-menu-wrap">
            <button
              type="button"
              className="part-palette-item"
              aria-expanded={isOpen}
              onClick={() => setOpenMenu(isOpen ? null : def.type)}
            >
              <svg width={30} height={20} viewBox="-40 -30 80 60" className="part-palette-icon">
                <PartSymbol part={{ id: "", type: def.type, x: 0, y: 0, rotation: 0, params: def.defaultParams }} />
              </svg>
              {def.label}
              <span className={isOpen ? "template-category-chevron expanded" : "template-category-chevron"}>▸</span>
            </button>
            {isOpen && (
              <div className="part-palette-submenu">
                <button
                  type="button"
                  className="part-palette-submenu-item"
                  onClick={() => {
                    onAdd(def.type);
                    setOpenMenu(null);
                  }}
                >
                  기본값
                </button>
                {Object.entries(menu).map(([key, model]) => (
                  <button
                    key={key}
                    type="button"
                    className="part-palette-submenu-item"
                    onClick={() => {
                      onAdd(def.type, model.params);
                      setOpenMenu(null);
                    }}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
