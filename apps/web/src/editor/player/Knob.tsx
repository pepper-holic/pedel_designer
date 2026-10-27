import { useEffect, useRef } from "react";

interface KnobProps {
  label: string;
  /** 0..1 */
  value: number;
  onChange: (value: number) => void;
  size?: number;
}

/** The pointer sweep from 7 o'clock to 5 o'clock, like a real pot. */
const SWEEP_DEGREES = 270;
/** Pixels of vertical drag for the full sweep; shift divides the speed by FINE. */
const DRAG_PIXELS = 160;
const FINE = 5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

function polar(cx: number, cy: number, r: number, degrees: number) {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * A rotary pot: drag up/down (shift for fine), scroll, or use the keyboard (arrows, PageUp/Down,
 * Home/End). Vertical drag rather than circular because it is what every audio plugin does and
 * it works the same on a touchpad.
 */
export function Knob({ label, value, onChange, size = 72 }: KnobProps) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ y: number; value: number } | null>(null);
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  // React's onWheel is passive, so it cannot stop the page from scrolling under the knob.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = (e.shiftKey ? 0.01 : 0.03) * Math.sign(-e.deltaY);
      latest.current.onChange(round(clamp01(latest.current.value + step)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const set = (v: number) => {
    const next = round(clamp01(v));
    if (next !== value) onChange(next);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 };
    if (e.key in steps) set(value + steps[e.key] * (e.shiftKey ? 0.25 : 1));
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const c = size / 2;
  const r = size / 2 - 6;
  const start = -SWEEP_DEGREES / 2;
  const angle = start + SWEEP_DEGREES * value;
  const arcFrom = polar(c, c, r + 3, start);
  const arcTo = polar(c, c, r + 3, angle);
  const tip = polar(c, c, r - 6, angle);
  const large = SWEEP_DEGREES * value > 180 ? 1 : 0;

  return (
    <svg
      ref={ref}
      className="knob"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="slider"
      tabIndex={0}
      aria-label={`${label} 노브`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      onKeyDown={handleKey}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        drag.current = { y: e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const pixels = DRAG_PIXELS * (e.shiftKey ? FINE : 1);
        set(drag.current.value + (drag.current.y - e.clientY) / pixels);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => set(0.5)}
    >
      <circle className="knob-body" cx={c} cy={c} r={r} />
      {value > 0.001 && <path className="knob-arc" d={`M ${arcFrom.x} ${arcFrom.y} A ${r + 3} ${r + 3} 0 ${large} 1 ${arcTo.x} ${arcTo.y}`} />}
      <line className="knob-pointer" x1={c} y1={c} x2={tip.x} y2={tip.y} />
    </svg>
  );
}
