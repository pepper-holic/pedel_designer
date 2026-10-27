import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DockContext } from "./dockContext";
import { Icon } from "../ui/Icon";

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
  /** Where the height (and the collapsed state) is remembered - one key per place the dock is used. */
  storageKey?: string;
  /** Lets the dock fold down to its tab row, so it does not take canvas space until asked for. */
  collapsible?: boolean;
}

const DEFAULT_KEY = "pedal-designer:dock-height";
const MIN_HEIGHT = 200;
/** The schematic above keeps at least this much height. */
const CANVAS_RESERVE = 200;
const STEP = 40;

/** Tallest the dock may get inside `column` (the canvas area it shares with the schematic). */
function maxHeight(column?: HTMLElement | null): number {
  const available = column?.clientHeight || (typeof window !== "undefined" ? window.innerHeight - 160 : 740);
  return Math.max(MIN_HEIGHT, available - CANVAS_RESERVE);
}

function defaultHeight(): number {
  // About a third of the window: room for a plot with readable axes without crowding the canvas.
  const h = typeof window !== "undefined" ? window.innerHeight : 900;
  return Math.min(460, Math.max(280, Math.round(h * 0.36)));
}

function readHeight(key: string): number {
  try {
    const stored = Number(localStorage.getItem(key));
    if (stored >= MIN_HEIGHT) return Math.min(stored, maxHeight());
  } catch {
    // storage unavailable - fall through to the default
  }
  return defaultHeight();
}

/** Tabbed dock for the analysis panels (frequency response, waveform, THD, tolerance, chain) so
 * they sit below the schematic canvas instead of stacking endlessly down a sidebar. Its height is
 * the user's: drag the top edge (or use the arrow keys on it), or expand it for a closer look. */
function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(`${key}:collapsed`) !== "0";
  } catch {
    return true;
  }
}

export function BottomDock({ tabs, storageKey = DEFAULT_KEY, collapsible = false }: BottomDockProps) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const [height, setHeightState] = useState(() => readHeight(storageKey));
  const [collapsed, setCollapsedState] = useState(() => collapsible && readCollapsed(storageKey));
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c);
    try {
      localStorage.setItem(`${storageKey}:collapsed`, c ? "1" : "0");
    } catch {
      // the state still applies for this session
    }
  };
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const limit = () => maxHeight(dockRef.current?.parentElement);

  const setHeight = (h: number) => {
    const clamped = Math.round(Math.min(limit(), Math.max(MIN_HEIGHT, h)));
    setHeightState(clamped);
    setExpanded(false);
    try {
      localStorage.setItem(storageKey, String(clamped));
    } catch {
      // the height still applies for this session
    }
  };

  // Keep the dock inside its column when the window shrinks (and once the column has a size).
  const [max, setMax] = useState(() => maxHeight());
  useEffect(() => {
    const onResize = () => {
      const m = maxHeight(dockRef.current?.parentElement);
      setMax(m);
      setHeightState((h) => Math.min(h, m));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const shown = expanded ? max : height;
  const context = useMemo(() => ({ expand: () => setExpanded(true) }), []);

  if (collapsed) {
    return (
      <div ref={dockRef} className="panel bottom-dock bottom-dock-collapsed">
        <div className="dock-tab-row" role="tablist" aria-label="분석 패널">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={false}
              className="dock-tab"
              onClick={() => {
                setActiveKey(tab.key);
                setCollapsed(false);
              }}
              title={tab.helpText}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="dock-expand" aria-expanded={false} onClick={() => setCollapsed(false)}>
          <Icon name="chevron-up" size={12} /> 펼치기
        </button>
      </div>
    );
  }

  return (
    <div ref={dockRef} className="panel bottom-dock" style={{ height: shown }}>
      <div
        className="dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="분석 패널 높이 조절"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={max}
        aria-valuenow={shown}
        tabIndex={0}
        title="끌어서 높이 조절 (더블클릭: 크게/원래대로)"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drag.current = { y: e.clientY, height: shown };
        }}
        onPointerMove={(e) => {
          if (drag.current) setHeight(drag.current.height + (drag.current.y - e.clientY));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setHeight(shown + STEP);
          else if (e.key === "ArrowDown") setHeight(shown - STEP);
          else return;
          e.preventDefault();
        }}
      />
      <div className="dock-actions">
        <button
          type="button"
          className="dock-expand"
          aria-pressed={expanded}
          onClick={() => setExpanded((v) => !v)}
          title="분석 패널을 크게 보기 / 원래 크기로"
        >
          <Icon name={expanded ? "collapse" : "expand"} size={12} /> {expanded ? "원래 크기" : "크게 보기"}
        </button>
        {collapsible && (
          <button
            type="button"
            className="dock-expand"
            aria-expanded={true}
            onClick={() => setCollapsed(true)}
            title="탭 줄만 남기고 접어 회로도를 넓게 봅니다"
          >
            <Icon name="chevron-down" size={12} /> 접기
          </button>
        )}
      </div>
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
        data-fit-container
        role="tabpanel"
        id="dock-tab-panel"
        aria-labelledby={activeTab ? `dock-tab-${activeTab.key}` : undefined}
      >
        <DockContext.Provider value={context}>{activeTab?.content}</DockContext.Provider>
      </div>
    </div>
  );
}
