interface EditorToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasParts: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSaveFile: () => void;
  onOpenFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNewCircuit: () => void;
  /** Schematic (engineering) or player (the pedal's face) view. */
  view: "schematic" | "player";
  onViewChange: (view: "schematic" | "player") => void;
}

/** Top strip: history on the left, whole-circuit actions on the right. */
export function EditorToolbar({ canUndo, canRedo, hasParts, onUndo, onRedo, onSaveFile, onOpenFile, onNewCircuit, view, onViewChange }: EditorToolbarProps) {
  return (
    <div className="toolbar">
      <button type="button" onClick={onUndo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
        ↶ 실행 취소
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">
        ↷ 다시 실행
      </button>
      <div className="view-toggle" role="group" aria-label="보기">
        <button type="button" aria-pressed={view === "schematic"} onClick={() => onViewChange("schematic")} title="부품과 배선을 편집하는 회로도">
          회로도
        </button>
        <button type="button" aria-pressed={view === "player"} onClick={() => onViewChange("player")} title="노브만 보이는 페달 전면 - 돌리면서 듣기">
          연주
        </button>
      </div>
      <div className="spacer" />
      <button type="button" onClick={onSaveFile} disabled={!hasParts} title="지금 회로를 .json 파일로 내려받습니다">
        회로 저장
      </button>
      {/* The native file input cannot be restyled, so the real control is hidden inside this label. */}
      <label className="toolbar-file-button" title="이 앱에서 저장한 .json 회로 파일을 불러옵니다">
        회로 열기
        <input type="file" accept="application/json,.json" onChange={onOpenFile} className="visually-hidden" />
      </label>
      <button type="button" onClick={onNewCircuit} disabled={!hasParts} title="캔버스를 비우고 처음부터 다시 시작합니다">
        새 회로
      </button>
    </div>
  );
}
