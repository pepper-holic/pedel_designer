import type { ReactNode } from "react";

interface LibraryRowProps {
  /** The item's full name - its accessible name and tooltip, whatever the row shows. */
  name: string;
  /** What the row shows in bold: the pedal it is styled after ("TS9 스타일"), else the name itself. */
  primary: string;
  /** Shown after the primary text, dimmer: the genre, or the name's qualifier. */
  secondary?: string;
  /** The enclosure colour of the pedal this item is modelled on; none for a generic circuit. */
  color?: string;
  active?: boolean;
  /** Small tag at the right: 아카이브, 내 블록. */
  badge?: string;
  /** What the main click does, for the tooltip: 불러오기 / 더하기. */
  verb: string;
  onClick: () => void;
  /** Controls under the row (topology variants) - siblings of the main button, so they stay valid
   * HTML and keyboard-reachable. */
  footer?: ReactNode;
  /** A control beside the row (a delete button for a user block). */
  aside?: ReactNode;
}

/**
 * One library item as a row: a colour chip standing for the pedal it is modelled on (a blank chip
 * for a generic circuit), its short name in bold, its genre or qualifier after it. The whole row
 * is one button; anything else sits beside or under it.
 */
export function LibraryRow({ name, primary, secondary, color, active, badge, verb, onClick, footer, aside }: LibraryRowProps) {
  return (
    <div className={active ? "library-row active" : "library-row"}>
      <div className="library-row-line">
        <button type="button" className="library-row-face" onClick={onClick} title={`${name} ${verb}`} aria-label={name} aria-pressed={active}>
          <span className={color ? "library-chip" : "library-chip library-chip-generic"} style={color ? { background: color } : undefined} aria-hidden="true" />
          <span className="library-row-text">
            <span className="library-row-primary">{primary}</span>
            {secondary && <span className="library-row-secondary">{secondary}</span>}
          </span>
          {badge && <span className="library-row-badge">{badge}</span>}
        </button>
        {aside}
      </div>
      {footer && <div className="library-row-footer">{footer}</div>}
    </div>
  );
}
