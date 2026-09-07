import { useState, type ReactNode } from "react";

export interface DockTab {
  key: string;
  label: string;
  content: ReactNode;
  /** Plain-language explanation shown as a tooltip - helps first-time users who don't know what
   * "THD" or "부품 공차" mean yet. */
  helpText?: string;
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
      {/* A real tablist, so a screen reader announces "tab 3 of 10" and arrow keys behave as
          users expect, rather than reading ten unrelated buttons. */}
      <div className="dock-tab-row" role="tablist" aria-label="분석 패널">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`dock-tab-${tab.key}`}
            aria-selected={tab.key === activeTab?.key}
            aria-controls="dock-tab-panel"
            className={tab.key === activeTab?.key ? "dock-tab active" : "dock-tab"}
            onClick={() => setActiveKey(tab.key)}
            title={tab.helpText}
            aria-label={tab.label}
            aria-describedby={tab.helpText ? `dock-tab-help-${tab.key}` : undefined}
          >
            {tab.label}
          </button>
        ))}
        {tabs.map(
          (tab) =>
            tab.helpText && (
              <span key={tab.key} id={`dock-tab-help-${tab.key}`} className="visually-hidden">
                {tab.helpText}
              </span>
            ),
        )}
      </div>
      <div
        className="bottom-dock-content"
        role="tabpanel"
        id="dock-tab-panel"
        aria-labelledby={activeTab ? `dock-tab-${activeTab.key}` : undefined}
      >
        {activeTab?.content}
      </div>
    </div>
  );
}
