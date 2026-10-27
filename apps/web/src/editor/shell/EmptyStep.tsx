import { MODES, type WorkMode } from "./modes";

/** What a step shows before there is a circuit to play, analyse or build: the way back to design. */
export function EmptyStep({ mode, onGoDesign }: { mode: WorkMode; onGoDesign: () => void }) {
  const label = MODES.find((m) => m.id === mode)?.label ?? "";
  return (
    <div className="empty-step" role="region" aria-label={`${label} - 회로 없음`}>
      <h2>아직 {label}할 회로가 없습니다</h2>
      <p>설계 단계에서 완성된 페달 프리셋을 불러오거나 블록·부품으로 회로를 만들면 여기서 바로 이어집니다.</p>
      <button type="button" className="primary" onClick={onGoDesign}>
        <b>1</b> 설계로 가기
      </button>
    </div>
  );
}
