import { useState, type ReactNode } from "react";
import type { PartType } from "../partDefs";
import type { PedalPreset, PresetVariant } from "../../core/library/presets";
import type { WiringPreset } from "../wiring";
import type { BlockDef } from "../blocks";
import type { UserBlock } from "../userBlocks";
import { PartPalette } from "../PartPalette";
import { LibraryExplorer } from "../LibraryExplorer";
import { QuickAddPalette } from "../QuickAddPalette";
import { Icon } from "../../ui/Icon";

import { LIBRARY_TABS, type LibraryTab } from "./libraryTabs";

export type { LibraryTab } from "./libraryTabs";

interface LibraryPanelProps {
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onAddPart: (type: PartType, paramsOverride?: Record<string, number | string>) => void;
  onAddBlock: (def: BlockDef) => void;
  presets: PedalPreset[];
  wiringPresets: WiringPreset[];
  loadedPresetId: string | null;
  onLoadTemplate: (preset: PedalPreset, variant?: PresetVariant) => void;
  onLoadWiring: (preset: WiringPreset) => void;
  userBlocks: { items: UserBlock[]; onAdd: (ub: UserBlock) => void; onDelete: (id: string) => void };
}

/** The library's tab strip - also the header the side column shows beside its dock controls. */
export function LibraryTabs({ tab, onTabChange }: Pick<LibraryPanelProps, "tab" | "onTabChange">) {
  return (
    <div className="library-tabs" role="tablist" aria-label="라이브러리 종류">
      {LIBRARY_TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => onTabChange(t.id)} title={t.hint}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The tabs again, as the folded column's rail: picking one reopens the column on that tab. */
export function LibraryRailTabs({ tab, onPick }: { tab: LibraryTab; onPick: (tab: LibraryTab) => void }) {
  return (
    <div className="side-rail-tabs">
      {LIBRARY_TABS.map((t) => (
        <button key={t.id} type="button" className={tab === t.id ? "side-rail-tab active" : "side-rail-tab"} onClick={() => onPick(t.id)} title={`${t.label} 펼치기`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The design step's left (or right) panel: everything you can put into a circuit, split by what it
 * does to the circuit - a preset replaces it, a block or a part adds to it. One search box serves
 * whichever tab is open.
 */
export function LibraryPanel(props: LibraryPanelProps): ReactNode {
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const current = LIBRARY_TABS.find((t) => t.id === props.tab)!;
  const explorerProps = {
    presets: props.presets,
    wiringPresets: props.wiringPresets,
    loadedPresetId: props.loadedPresetId,
    onLoadTemplate: props.onLoadTemplate,
    onLoadWiring: props.onLoadWiring,
    onAddBlock: props.onAddBlock,
    userBlocks: props.userBlocks,
    query,
  };

  return (
    <div className="library-panel-body">
      <div className="library-search">
        <Icon name="search" size={14} />
        <input type="search" placeholder={current.placeholder} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="템플릿 검색" />
      </div>
      {props.tab === "presets" && <LibraryExplorer key="presets" sections={["presets", "wiring"]} {...explorerProps} />}
      {props.tab === "blocks" && <LibraryExplorer key="blocks" sections={["blocks"]} {...explorerProps} />}
      {props.tab === "parts" && (
        <div className="library-scroll">
          <PartPalette onAdd={props.onAddPart} query={query} />
          <button type="button" className="template-category-header quick-add-toggle" aria-expanded={quickAddExpanded} onClick={() => setQuickAddExpanded((v) => !v)}>
            <span className={quickAddExpanded ? "template-category-chevron expanded" : "template-category-chevron"}>
              <Icon name="chevron-right" size={12} />
            </span>
            자주 쓰는 소자 값
          </button>
          {quickAddExpanded && <QuickAddPalette onAdd={props.onAddPart} />}
        </div>
      )}
    </div>
  );
}
