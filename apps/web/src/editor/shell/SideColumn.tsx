import { useRef, type ReactNode } from "react";
import { Icon } from "../../ui/Icon";
import type { DockSide } from "./useWorkspaceLayout";

interface SideColumnProps {
  /** The column's name, read by screen readers and shown on the rail when folded. */
  title: string;
  side: DockSide;
  width: number;
  min: number;
  max: number;
  collapsed: boolean;
  onWidthChange: (width: number) => void;
  onResetWidth: () => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onSwapSide: () => void;
  /** Left part of the column's own header (tabs, a title) - the dock controls sit after it. */
  header: ReactNode;
  /** Shown on the folded rail under the reopen control, e.g. the tabs as icons. */
  rail?: ReactNode;
  children: ReactNode;
  className?: string;
}

const KEY_STEP = 24;

/**
 * One of the workspace's two side columns: a header with the column's own controls and two dock
 * controls (send to the other side, fold to a rail), a drag handle on its inner edge to resize it,
 * and the folded rail that takes its place when collapsed. The handle always faces the schematic,
 * so dragging toward the centre widens the column on either side.
 */
export function SideColumn({ title, side, width, min, max, collapsed, onWidthChange, onResetWidth, onCollapsedChange, onSwapSide, header, rail, children, className }: SideColumnProps) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  // Toward the centre is +x for a left column and -x for a right one.
  const direction = side === "left" ? 1 : -1;

  if (collapsed) {
    return (
      <aside className={`side-column side-column-collapsed side-${side}${className ? ` ${className}` : ""}`} aria-label={title}>
        <button type="button" className="side-rail-open" onClick={() => onCollapsedChange(false)} title={`${title} 펼치기`} aria-label={`${title} 펼치기`} aria-expanded={false}>
          <Icon name={side === "left" ? "chevron-right" : "chevron-left"} size={12} />
        </button>
        <span className="side-rail-title" aria-hidden="true">
          {title}
        </span>
        {rail}
      </aside>
    );
  }

  return (
    <aside className={`side-column side-${side}${className ? ` ${className}` : ""}`} aria-label={title} style={{ width }}>
      <div className="side-column-head">
        <div className="side-column-head-main">{header}</div>
        <div className="side-column-dock" role="group" aria-label={`${title} 패널 배치`}>
          <button type="button" className="side-dock-button" onClick={onSwapSide} title={side === "left" ? "오른쪽으로 보내기" : "왼쪽으로 보내기"} aria-label={side === "left" ? `${title} 오른쪽으로 보내기` : `${title} 왼쪽으로 보내기`}>
            <Icon name="swap" size={12} />
          </button>
          <button type="button" className="side-dock-button" onClick={() => onCollapsedChange(true)} title="접기" aria-label={`${title} 접기`} aria-expanded={true}>
            <Icon name={side === "left" ? "panel-left" : "panel-right"} size={12} />
          </button>
        </div>
      </div>
      <div className="side-column-body">{children}</div>
      <div
        className="side-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${title} 너비 조절`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        tabIndex={0}
        title="끌어서 너비 조절 (더블클릭: 기본 너비)"
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, width };
        }}
        onPointerMove={(e) => {
          if (drag.current) onWidthChange(drag.current.width + direction * (e.clientX - drag.current.x));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={onResetWidth}
        onKeyDown={(e) => {
          // Arrow toward the centre widens, away narrows - the same sense as the drag.
          if (e.key === "ArrowRight") onWidthChange(width + direction * KEY_STEP);
          else if (e.key === "ArrowLeft") onWidthChange(width - direction * KEY_STEP);
          else if (e.key === "Home") onResetWidth();
          else return;
          e.preventDefault();
        }}
      />
    </aside>
  );
}
