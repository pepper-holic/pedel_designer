import { useEffect, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import { PartSymbol } from "./symbols";
import { DIODE_MODELS, TRANSISTOR_MODELS, JFET_MODELS, PICKUP_MODELS } from "../core/library/deviceModels";
import { Icon } from "../ui/Icon";
import "./library/partPalette.css";

interface PartPaletteProps {
  onAdd: (type: PartType, paramsOverride?: Record<string, number | string>) => void;
  /** Narrows the tiles to parts whose name matches (the panel's search box). */
  query?: string;
}

/** Part types with more than one common real-world variant - clicking these opens a menu of named
 * models instead of adding a single fixed default (diode/BJT/JFET are otherwise "one size fits all"
 * in the palette, which doesn't match how differently a 1N34A vs an LED, or a 2N5088 vs an AC128,
 * actually behaves in a circuit). */
const MODEL_MENUS: Partial<Record<PartType, Record<string, { label: string; params: Record<string, number | string> }>>> = {
  diode: DIODE_MODELS,
  bjt: TRANSISTOR_MODELS,
  jfet: JFET_MODELS,
  pickup: PICKUP_MODELS,
};

/** The palette in the order a builder reaches for things: passives, then semiconductors, then
 * sources and the guitar-side parts, then switches. */
const GROUPS: { label: string; types: PartType[] }[] = [
  { label: "수동 소자", types: ["resistor", "capacitor", "inductor", "potentiometer", "coupledInductors"] },
  { label: "반도체", types: ["diode", "bjt", "jfet", "opamp"] },
  { label: "전원·신호", types: ["vsource", "ground", "pickup"] },
  { label: "스위치", types: ["spst", "spdt", "dpdt", "blade3", "blade5", "rotary6"] },
];

/** Symbols are drawn at canvas scale (pins at +-30); the tile shows them a touch smaller. */
const TILE_VIEWBOX = "-44 -34 88 68";

export function PartPalette({ onAdd, query = "" }: PartPaletteProps) {
  const [openMenu, setOpenMenu] = useState<PartType | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // A model menu floats over the grid; a click anywhere else, or Escape, puts it away.
  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const q = query.trim().toLowerCase();
  const visible = GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => !q || PART_DEFS[t].label.toLowerCase().includes(q) || t.toLowerCase().includes(q)) })).filter((g) => g.types.length > 0);

  if (visible.length === 0) return <p className="template-empty">"{query}"에 맞는 부품이 없습니다.</p>;

  return (
    <div ref={rootRef}>
      {visible.map((group) => (
        <div key={group.label}>
          <div className="part-palette-heading">{group.label}</div>
          <div className="part-palette">
            {group.types.map((type) => {
              const def = PART_DEFS[type];
              const menu = MODEL_MENUS[type];
              const isOpen = openMenu === type;
              const tile = (
                <button
                  type="button"
                  className="part-palette-item"
                  aria-expanded={menu ? isOpen : undefined}
                  aria-haspopup={menu ? "menu" : undefined}
                  title={menu ? `${def.label} - 모델 고르기` : `${def.label} 더하기`}
                  onClick={() => (menu ? setOpenMenu(isOpen ? null : type) : onAdd(type))}
                >
                  <svg viewBox={TILE_VIEWBOX} className="part-palette-icon" aria-hidden="true" focusable="false">
                    <PartSymbol part={{ id: "", type, x: 0, y: 0, rotation: 0, params: def.defaultParams }} />
                  </svg>
                  <span className="part-palette-name">
                    <span className="part-palette-label">{def.label}</span>
                    {menu && (
                      <span className={isOpen ? "template-category-chevron expanded" : "template-category-chevron"}>
                        <Icon name="chevron-right" size={12} />
                      </span>
                    )}
                  </span>
                </button>
              );
              if (!menu) return <div key={type}>{tile}</div>;
              return (
                <div key={type} className="part-palette-menu-wrap">
                  {tile}
                  {isOpen && (
                    <div className="part-palette-submenu" role="menu" aria-label={`${def.label} 모델`}>
                      <button
                        type="button"
                        role="menuitem"
                        className="part-palette-submenu-item"
                        onClick={() => {
                          onAdd(type);
                          setOpenMenu(null);
                        }}
                      >
                        기본값
                      </button>
                      {Object.entries(menu).map(([key, model]) => (
                        <button
                          key={key}
                          type="button"
                          role="menuitem"
                          className="part-palette-submenu-item"
                          onClick={() => {
                            onAdd(type, model.params);
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
        </div>
      ))}
    </div>
  );
}
