import type { Shape } from "./stripboardDrawing";
import type { Hole } from "./stripboardTypes";

interface ShapeSvgProps {
  shapes: Shape[];
  width: number;
  height: number;
  /** Screen pixels per hole. */
  scale: number;
  label: string;
  onHoleClick?: (hole: Hole) => void;
  onPartPointerDown?: (ref: string, e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}

/** Renders a shape list (see stripboardDrawing.ts) as an on-screen SVG with hit targets. */
export function ShapeSvg({ shapes, width, height, scale, label, onHoleClick, onPartPointerDown, onPointerMove, onPointerUp }: ShapeSvgProps) {
  return (
    <svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: "none", maxWidth: "100%" }}
    >
      {shapes.map((s, i) => {
        const partProps = "part" in s && s.part && onPartPointerDown ? { "data-part": s.part, onPointerDown: (e: React.PointerEvent) => onPartPointerDown(s.part!, e), style: { cursor: "grab" } } : {};
        switch (s.kind) {
          case "rect":
            return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} rx={s.rx} opacity={s.opacity} {...partProps} />;
          case "circle": {
            const circle = <circle cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth={s.sw} {...partProps} />;
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
            return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.sw} strokeLinecap="round" {...partProps} />;
          case "text":
            return (
              <text key={i} x={s.x} y={s.y} fontSize={s.size} fill={s.fill} textAnchor={s.anchor} fontWeight={s.bold ? 600 : undefined} pointerEvents="none">
                {s.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
