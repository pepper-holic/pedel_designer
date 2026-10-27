import { useState } from "react";
import type { PartType } from "../partDefs";
import type { PedalPreset, PresetVariant } from "../../core/library/presets";
import type { WiringPreset } from "../wiring";
import type { BlockDef } from "../blocks";
import type { UserBlock } from "../userBlocks";
import { PartPalette } from "../PartPalette";
import { LibraryExplorer } from "../LibraryExplorer";
import { QuickAddPalette } from "../QuickAddPalette";
import { Icon } from "../../ui/Icon";

export type LibraryTab = "presets" | "blocks" | "parts";

const TABS: { id: LibraryTab; label: string; hint: string }[] = [
  { id: "presets", label: "프리셋", hint: "완성된 페달 회로와 기타 배선 - 불러오면 지금 회로를 바꿉니다" },
  { id: "blocks", label: "블록", hint: "미리 배선된 기능 단위 - 지금 회로에 더합니다" },
  { id: "parts", label: "부품", hint: "저항·커패시터·트랜지스터 같은 낱개 소자" },
];

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

/**
 * The design step's left panel: everything you can put into a circuit, split by what it does to
 * the circuit - a preset replaces it, a block or a part adds to it.
 */
export function LibraryPanel(props: LibraryPanelProps) {
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  return (
    <aside className="panel library-panel" aria-label="라이브러리">
      <div className="segmented library-tabs" role="tablist" aria-label="라이브러리 종류">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={props.tab === t.id}
            className={props.tab === t.id ? "active" : ""}
            onClick={() => props.onTabChange(t.id)}
            title={t.hint}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="library-body">
        {props.tab === "presets" && (
          <LibraryExplorer
            sections={["presets", "wiring"]}
            presets={props.presets}
            wiringPresets={props.wiringPresets}
            loadedPresetId={props.loadedPresetId}
            onLoadTemplate={props.onLoadTemplate}
            onLoadWiring={props.onLoadWiring}
            onAddBlock={props.onAddBlock}
            userBlocks={props.userBlocks}
          />
        )}
        {props.tab === "blocks" && (
          <LibraryExplorer
            sections={["blocks"]}
            presets={props.presets}
            wiringPresets={props.wiringPresets}
            loadedPresetId={props.loadedPresetId}
            onLoadTemplate={props.onLoadTemplate}
            onLoadWiring={props.onLoadWiring}
            onAddBlock={props.onAddBlock}
            userBlocks={props.userBlocks}
          />
        )}
        {props.tab === "parts" && (
          <>
            <PartPalette onAdd={props.onAddPart} />
            <button
              type="button"
              className="template-category-header quick-add-toggle"
              aria-expanded={quickAddExpanded}
              onClick={() => setQuickAddExpanded((v) => !v)}
            >
              <span className={quickAddExpanded ? "template-category-chevron expanded" : "template-category-chevron"}>
                <Icon name="chevron-right" size={12} />
              </span>
              자주 쓰는 소자 값
            </button>
            {quickAddExpanded && <QuickAddPalette onAdd={props.onAddPart} />}
          </>
        )}
      </div>
    </aside>
  );
}
