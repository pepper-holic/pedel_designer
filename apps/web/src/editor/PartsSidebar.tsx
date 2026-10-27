import { useState } from "react";
import type { PartType } from "./partDefs";
import type { PedalPreset, PresetVariant } from "../core/library/presets";
import type { WiringPreset } from "./wiring";
import type { BlockDef } from "./blocks";
import type { UserBlock } from "./userBlocks";
import { PartPalette } from "./PartPalette";
import { LibraryExplorer } from "./LibraryExplorer";
import { QuickAddPalette } from "./QuickAddPalette";

type LeftTab = "parts" | "library";

interface PartsSidebarProps {
  activeTab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  onAddPart: (type: PartType, paramsOverride?: Record<string, number | string>) => void;
  onAddBlock: (def: BlockDef) => void;
  presets: PedalPreset[];
  wiringPresets: WiringPreset[];
  loadedPresetId: string | null;
  onLoadTemplate: (preset: PedalPreset, variant?: PresetVariant) => void;
  onLoadWiring: (preset: WiringPreset) => void;
  userBlocks: { items: UserBlock[]; onAdd: (ub: UserBlock) => void; onDelete: (id: string) => void };
}

/** Left dock: switches between the part palette (drag-to-add components) and the combined
 * template/block library - complete pedal presets and empty functional blocks are both ways to
 * start a circuit, so they share one explorer instead of separate tabs. */
export function PartsSidebar({
  activeTab,
  onTabChange,
  onAddPart,
  onAddBlock,
  presets,
  wiringPresets,
  loadedPresetId,
  onLoadTemplate,
  onLoadWiring,
  userBlocks,
}: PartsSidebarProps) {
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);

  return (
    <div className="panel sidebar-left">
      <div className="dock-tab-row">
        <button type="button" className={activeTab === "parts" ? "dock-tab active" : "dock-tab"} onClick={() => onTabChange("parts")}>
          소자 팔레트
        </button>
        <button type="button" className={activeTab === "library" ? "dock-tab active" : "dock-tab"} onClick={() => onTabChange("library")}>
          템플릿/블록
        </button>
      </div>

      {activeTab === "parts" && (
        <>
          <PartPalette onAdd={onAddPart} />
          <button
            type="button"
            className="template-category-header quick-add-toggle"
            aria-expanded={quickAddExpanded}
            onClick={() => setQuickAddExpanded((v) => !v)}
          >
            <span className={quickAddExpanded ? "template-category-chevron expanded" : "template-category-chevron"}>▸</span>
            자주 쓰는 소자 값
          </button>
          {quickAddExpanded && <QuickAddPalette onAdd={onAddPart} />}
        </>
      )}

      {activeTab === "library" && (
        <LibraryExplorer
          userBlocks={userBlocks}
          presets={presets}
          wiringPresets={wiringPresets}
          loadedPresetId={loadedPresetId}
          onLoadTemplate={onLoadTemplate}
          onLoadWiring={onLoadWiring}
          onAddBlock={onAddBlock}
        />
      )}
    </div>
  );
}
