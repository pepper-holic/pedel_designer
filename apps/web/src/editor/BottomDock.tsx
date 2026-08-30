import { useState, type ReactNode } from "react";

export interface DockTab {
  key: string;
  label: string;
  content: ReactNode;
}

interface BottomDockProps {
  tabs: DockTab[];
}

/** Tabbed dock for the analysis panels (frequency response, waveform, THD, tolerance, chain) so
 * they sit below the schematic canvas instead of stacking endlessly down a sidebar. */
export function BottomDock({ tabs }: BottomDockProps) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];

  return (
    <div className="panel bottom-dock">
      <div className="dock-tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === activeTab?.key ? "dock-tab active" : "dock-tab"}
            onClick={() => setActiveKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="bottom-dock-content">{activeTab?.content}</div>
    </div>
  );
}
