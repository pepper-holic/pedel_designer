import { useState, type ReactNode } from "react";
import type { DockTab } from "../dockTabs";
import { Icon } from "../../ui/Icon";

interface AnalyzeWorkspaceProps {
  /** The schematic, for placing probes while looking at the plots. */
  canvas: ReactNode;
  probePanel: ReactNode;
  tabs: DockTab[];
  run: {
    canRun: boolean;
    running: boolean;
    onRun: () => void;
    /** Why it cannot run, when it cannot. */
    blocker: string | null;
    /** The traces were simulated before the circuit's last edit. */
    stale: boolean;
    hasResult: boolean;
    sourceLabel: string | null;
    useTrapezoidal: boolean;
    onUseTrapezoidalChange: (on: boolean) => void;
  };
}

const TAB_KEY = "pedal-designer:analysis-tab";

function readTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

/**
 * The analysis step: the circuit on the left (click terminals to probe), the plots on the right at
 * full height instead of in a slot under the canvas. The transient run lives in this header - it is
 * only needed for the waveform, spectrum and THD views, and its result says when it has gone stale.
 */
export function AnalyzeWorkspace({ canvas, probePanel, tabs, run }: AnalyzeWorkspaceProps) {
  const [activeKey, setActiveKeyState] = useState(() => readTab() ?? tabs[0]?.key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const setActiveKey = (key: string) => {
    setActiveKeyState(key);
    try {
      localStorage.setItem(TAB_KEY, key);
    } catch {
      // remembered for this session only
    }
  };

  return (
    <div className="analyze-workspace">
      <div className="analyze-circuit">
        {canvas}
        {probePanel}
      </div>
      <section className="panel analysis-panel" aria-label="분석">
        <div className="analysis-head">
          <div className="dock-tab-row" role="tablist" aria-label="분석 패널">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`analysis-tab-${tab.key}`}
                aria-selected={tab.key === active?.key}
                aria-controls="analysis-tab-panel"
                className={tab.key === active?.key ? "dock-tab active" : "dock-tab"}
                onClick={() => setActiveKey(tab.key)}
                title={tab.helpText}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="analysis-run">
            <button
              type="button"
              className="primary"
              onClick={run.onRun}
              disabled={!run.canRun}
              title={run.blocker ?? "입력 신호를 회로에 통과시켜 모든 지점의 파형을 계산합니다"}
            >
              <Icon name="play" size={12} />
              {run.running ? "계산 중…" : run.hasResult ? "다시 계산" : "시뮬레이션 실행"}
            </button>
            <span className="analysis-run-info">
              {run.blocker ??
                (run.stale ? (
                  <span className="stale-badge" title="결과를 계산한 뒤 회로가 바뀌었습니다">
                    회로가 바뀜 · 다시 실행하세요
                  </span>
                ) : run.hasResult ? (
                  `입력: ${run.sourceLabel ?? "-"}`
                ) : (
                  `입력: ${run.sourceLabel ?? "-"} · 파형·스펙트럼·THD에 쓰입니다`
                ))}
            </span>
            <label
              className="analysis-option"
              title="기본값(backward Euler)은 어떤 회로에도 안정적입니다. 켜면 고음역이 더 정확하지만 피드백이 강한 회로에서는 진동이 생길 수 있습니다."
            >
              <input type="checkbox" checked={run.useTrapezoidal} onChange={(e) => run.onUseTrapezoidalChange(e.target.checked)} /> 정밀 적분
            </label>
          </div>
        </div>
        <div
          className="analysis-body"
          role="tabpanel"
          id="analysis-tab-panel"
          aria-labelledby={active ? `analysis-tab-${active.key}` : undefined}
          data-fit-container
        >
          {active?.content}
        </div>
      </section>
    </div>
  );
}
