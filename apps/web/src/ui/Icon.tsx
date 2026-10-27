/**
 * The app's icon set: one 16px grid, one 1.5px stroke, square caps and mitred joins to match the
 * square controls. Drawn here rather than borrowed from Unicode glyphs (▶ ▾ ✕ ⓘ), which come in
 * whatever size, weight and baseline the fallback font gives them.
 */
const PATHS = {
  undo: "M5.5 3.5 2.5 6.5l3 3M3 6.5h6.5a4 4 0 0 1 0 8H7",
  redo: "M10.5 3.5l3 3-3 3M13 6.5H6.5a4 4 0 0 0 0 8H9",
  play: "M4.5 3v10l8.5-5z",
  stop: "M4 4h8v8H4z",
  "chevron-down": "M4 6l4 4 4-4",
  "chevron-up": "M4 10l4-4 4 4",
  "chevron-right": "M6 4l4 4-4 4",
  close: "M4 4l8 8M12 4l-8 8",
  check: "M3 8.5l3 3 7-7",
  alert: "M8 2.5 14 13H2zM8 6.5v3M8 11v.5",
  info: "M8 1.75a6.25 6.25 0 1 0 0 12.5A6.25 6.25 0 1 0 8 1.75zM8 7v4.5M8 4.75v.5",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  help: "M8 1.75a6.25 6.25 0 1 0 0 12.5A6.25 6.25 0 1 0 8 1.75zM6.25 6.25a1.75 1.75 0 1 1 2.5 1.6c-.5.25-.75.6-.75 1.15v.5M8 11v.5",
  expand: "M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9",
  collapse: "M13.5 6.5h-4v-4M9.5 6.5 14 2M2.5 9.5h4v4M6.5 9.5 2 14",
} as const;

export type IconName = keyof typeof PATHS;

/** Filled where the shape reads as a solid mark (play, stop); stroked everywhere else. */
const FILLED: ReadonlySet<IconName> = new Set(["play", "stop"]);

export function Icon({ name, size = 14, className }: { name: IconName; size?: number; className?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
