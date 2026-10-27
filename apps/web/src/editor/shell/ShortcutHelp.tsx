import { useEffect, useRef } from "react";
import { Icon } from "../../ui/Icon";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "전체",
    items: [
      ["1 / 2 / 3 / 4", "설계 · 연주 · 분석 · 제작"],
      ["Space", "실시간 재생 켜기/끄기"],
      ["Ctrl+Z / Ctrl+Shift+Z", "실행 취소 / 다시 실행"],
      ["?", "이 도움말"],
    ],
  },
  {
    title: "회로도",
    items: [
      ["단자 클릭 → 단자 클릭", "배선"],
      ["드래그", "부품 이동 (옮긴 부품은 자동 정렬에서 고정)"],
      ["빈 곳 드래그 · 휠", "화면 이동 · 확대/축소"],
      ["Shift+드래그", "범위 선택"],
      ["R · Delete", "회전 · 삭제"],
      ["Ctrl+C / V / D", "복사 · 붙여넣기 · 복제"],
      ["방향키 (Shift: 크게)", "선택한 부품 이동"],
      ["[ ]", "부품 순서대로 선택"],
      ["Ctrl+G / Ctrl+Shift+G", "블록으로 묶기 / 풀기"],
      ["블록 더블클릭", "블랙박스로 접기/펼치기"],
      ["P", "프로브(측정 지점) 모드"],
      ["선택한 배선의 네모 손잡이", "배선 경로 옮기기"],
      ["Esc", "선택 해제"],
    ],
  },
];

/** Keyboard and mouse reference, on demand (?) instead of a paragraph permanently above the canvas. */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="단축키와 도움말">
        <div className="modal-head">
          <h2>단축키와 조작</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        <div className="shortcut-groups">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.items.map(([keys, what]) => (
                  <div key={keys} className="shortcut-row">
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
