import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";

interface LibraryGroupProps {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** A top-level section (페달 프리셋, 기능 블록) rather than a category inside one. */
  top?: boolean;
  children: ReactNode;
}

/** A collapsible run of the library: a heading row with a chevron and a count, then its cards. */
export function LibraryGroup({ label, count, expanded, onToggle, top, children }: LibraryGroupProps) {
  return (
    <div className={top ? "library-section" : "template-category-group"}>
      <button type="button" className={top ? "template-category-header library-top-header" : "template-category-header"} aria-expanded={expanded} onClick={onToggle}>
        <span className={expanded ? "template-category-chevron expanded" : "template-category-chevron"}>
          <Icon name="chevron-right" size={12} />
        </span>
        {label}
        <span className="template-category-count">{count}</span>
      </button>
      {expanded && children}
    </div>
  );
}
