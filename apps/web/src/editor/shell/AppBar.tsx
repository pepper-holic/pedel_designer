import { useEffect, useRef, useState } from "react";
import { MODES, type WorkMode } from "./modes";

interface AppBarProps {
  title: string;
  mode: WorkMode;
  onModeChange: (mode: WorkMode) => void;
  /** Modes that have nothing to show yet (an empty circuit) are dimmed but still reachable. */
  hasCircuit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNew: () => void;
  /** Asks for a circuit file (the editor owns the file input, so the start cards can ask too). */
  onOpen: () => void;
  onSave: () => void;
  onHelp: () => void;
}

/**
 * The one bar along the top: which circuit this is, the four work steps (the app's main
 * navigation - press 1-4), and the whole-document actions. Replaces the old header, toolbar and
 * the 회로도/연주 toggle.
 */
export function AppBar(props: AppBarProps) {
  const [fileOpen, setFileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setFileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFileOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [fileOpen]);

  const item = (label: string, onClick: () => void, disabled = false, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        setFileOpen(false);
        onClick();
      }}
    >
      {label}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  return (
    <header className="appbar">
      <div className="appbar-brand">
        <span className="mark" />
        PEDAL DESIGNER
      </div>
      <div className="appbar-doc" title="회로는 이 브라우저에 자동으로 저장됩니다">
        <span className="appbar-title">{props.title}</span>
        <span className="appbar-saved">자동 저장됨</span>
      </div>

      <nav className="appbar-modes" aria-label="작업 단계">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={props.mode === m.id ? "appbar-mode active" : "appbar-mode"}
            aria-current={props.mode === m.id ? "page" : undefined}
            onClick={() => props.onModeChange(m.id)}
            title={`${m.hint} (단축키 ${i + 1})`}
            data-empty={!props.hasCircuit && m.id !== "design" ? "true" : undefined}
          >
            <span className="appbar-mode-num">{i + 1}</span>
            {m.label}
          </button>
        ))}
      </nav>

      <div className="appbar-actions">
        <button type="button" className="appbar-icon" onClick={props.onUndo} disabled={!props.canUndo} aria-label="실행 취소" title="실행 취소 (Ctrl+Z)">
          ↶
        </button>
        <button type="button" className="appbar-icon" onClick={props.onRedo} disabled={!props.canRedo} aria-label="다시 실행" title="다시 실행 (Ctrl+Shift+Z)">
          ↷
        </button>
        <div className="appbar-menu" ref={menuRef}>
          <button type="button" aria-haspopup="menu" aria-expanded={fileOpen} onClick={() => setFileOpen((v) => !v)}>
            파일 ▾
          </button>
          {fileOpen && (
            <div className="appbar-menu-list" role="menu" aria-label="파일">
              {item("새 회로", props.onNew, !props.hasCircuit)}
              {item("회로 열기…", props.onOpen)}
              {item("회로 저장 (.json)", props.onSave, !props.hasCircuit)}
            </div>
          )}
        </div>
        <button type="button" className="appbar-icon" onClick={props.onHelp} aria-label="단축키와 도움말" title="단축키와 도움말 (?)">
          ?
        </button>
      </div>
    </header>
  );
}
