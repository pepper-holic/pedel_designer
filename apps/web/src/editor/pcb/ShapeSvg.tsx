import { useRef } from "react";
import type { Shape } from "./stripboardDrawing";
import type { Hole } from "./stripboardTypes";

interface ShapeSvgProps {
  shapes: Shape[];
  width: number;
  height: number;
  /** Screen pixels per drawing unit. */
  scale: number;
  label: string;
  onHoleClick?: (hole: Hole) => void;
  /**
   * Dragging a part: `onDrag` with the movement so far, in drawing units (holes, millimetres) -
   * independent of how far the view is zoomed - and `onDragEnd` with the final movement.
   */
  onDrag?: (ref: string, dx: number, dy: number) => void;
  onDragEnd?: (ref: string, dx: number, dy: number) => void;
}

/** Renders a shape list (see stripboardDrawing.ts) as an on-screen SVG with hit targets. */
export function ShapeSvg({ shapes, width, height, scale, label, onHoleClick, onDrag, onDragEnd }: ShapeSvgProps) {
  const drag = useRef<{ ref: string; x: number; y: number } | null>(null);
  const movement = (e: React.PointerEvent) => (drag.current ? { dx: (e.clientX - drag.current.x) / scale, dy: (e.clientY - drag.current.y) / scale } : { dx: 0, dy: 0 });
  const draggable = !!(onDrag || onDragEnd);
  return (
    <svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      onPointerDown={(e) => {
        // One handler for every part: the shape under the pointer says which part it belongs to.
        const ref = draggable ? (e.target as Element).closest?.("[data-part]")?.getAttribute("data-part") : null;
        if (!ref) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        drag.current = { ref, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const { dx, dy } = movement(e);
        onDrag?.(drag.current.ref, dx, dy);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const { dx, dy } = movement(e);
        const ref = drag.current.ref;
        drag.current = null;
        onDragEnd?.(ref, dx, dy);
      }}
      style={{ touchAction: "none", display: "block" }}
    >
      {shapes.map((s, i) => {
        const partProps = "part" in s && s.part && draggable ? { "data-part": s.part, style: { cursor: "grab" } } : {};
        switch (s.kind) {
          case "rect":
            return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} rx={s.rx} opacity={s.opacity} {...partProps} />;
          case "circle": {
            const circle = <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} opacity={s.opacity} {...partProps} />;
            if (!s.hole || !onHoleClick) return <g key={i}>{circle}</g>;
            // Holes are tiny; a transparent disc on top gives them a usable click target.
            return (
              <g key={i}>
                {circle}
                <circle cx={s.cx} cy={s.cy} r={0.42} fill="transparent" data-hole={`${s.hole.row},${s.hole.col}`} onClick={() => onHoleClick(s.hole!)} style={{ cursor: "pointer" }} />
              </g>
            );
          }
          case "line":
            return (
              <line
                key={i}
                x1={s.x1}
                y1={s.y1}
                x2={s.x2}
                y2={s.y2}
                stroke={s.stroke}
                strokeWidth={s.sw}
                strokeLinecap="round"
                strokeDasharray={s.dash ? `${s.dash} ${s.dash}` : undefined}
                {...partProps}
              />
            );
          case "text":
            return (
              <text
                key={i}
                x={s.x}
                y={s.y}
                fontSize={s.size}
                fill={s.fill}
                textAnchor={s.anchor}
                fontWeight={s.bold ? 600 : undefined}
                fontFamily={s.fontFamily}
                pointerEvents="none"
              >
                {s.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
