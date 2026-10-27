interface StartCardsProps {
  onPresets: () => void;
  onBlocks: () => void;
  onParts: () => void;
  onOpenFile: () => void;
}

const CARDS: { key: keyof StartCardsProps; title: string; body: string }[] = [
  { key: "onPresets", title: "완성된 페달에서 시작", body: "TS9·Big Muff·Klon 같은 23가지 페달 회로를 불러와 바로 듣고 고쳐 봅니다." },
  { key: "onBlocks", title: "블록으로 조립", body: "버퍼·게인·클리핑·톤 같은 기능 블록을 이어 붙여 나만의 페달을 만듭니다." },
  { key: "onParts", title: "부품부터 배치", body: "저항·커패시터·트랜지스터를 하나씩 놓고 단자를 이어 회로를 그립니다." },
  { key: "onOpenFile", title: "저장한 회로 열기", body: "이 앱에서 저장한 .json 회로 파일을 불러옵니다." },
];

/** What an empty circuit shows: the ways to start, instead of a blank grid and one line of text. */
export function StartCards(props: StartCardsProps) {
  return (
    <div className="start-cards" role="region" aria-label="시작하기">
      <h2>무엇부터 시작할까요?</h2>
      <div className="start-card-grid">
        {CARDS.map((c, i) => (
          <button key={c.key} type="button" className="start-card" onClick={props[c.key]}>
            <span className="start-card-num">{i + 1}</span>
            <strong>{c.title}</strong>
            <span>{c.body}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
