import { type ReactNode } from "react";
import { SchematicThumbnail } from "./SchematicThumbnail";
import type { ThumbnailScene } from "./thumbnails";

interface LibraryCardProps {
  label: string;
  /** Built on demand, so a card that never renders never lays its circuit out. */
  scene: () => ThumbnailScene;
  active?: boolean;
  /** Small tag after the name: 아카이브, 내 블록. */
  badge?: string;
  /** What the main click does, for the tooltip: 불러오기 / 더하기. */
  verb: string;
  onClick: () => void;
  /** Extra controls under the name (topology variants, delete) - siblings of the main button, so
   * they stay valid HTML and keyboard-reachable. */
  footer?: ReactNode;
  /** Right-aligned control beside the name (a delete button for a user block). */
  aside?: ReactNode;
}

/**
 * One library item: its circuit drawn small over its name. The thumbnail is the point - a fuzz, a
 * clipper and a tone stack are told apart by shape before the name is read. The whole face is one
 * button; anything else in the card sits beside or under it.
 */
export function LibraryCard({ label, scene, active, badge, verb, onClick, footer, aside }: LibraryCardProps) {
  return (
    <div className={active ? "library-card active" : "library-card"}>
      <button type="button" className="library-card-face" onClick={onClick} title={`${label} ${verb}`} aria-pressed={active}>
        <span className="library-card-thumb">
          <SchematicThumbnail scene={scene()} className="schematic-thumb" />
        </span>
        <span className="library-card-name">
          <span className="library-card-label">{label}</span>
          {badge && <span className="library-card-badge">{badge}</span>}
        </span>
      </button>
      {aside}
      {footer && <div className="library-card-footer">{footer}</div>}
    </div>
  );
}
