import { DEFAULT_APPEARANCE, FONT_OPTIONS, type PedalAppearance } from "./pedalAppearance";

interface PedalAppearanceEditorProps {
  appearance: PedalAppearance;
  onChange: (next: PedalAppearance) => void;
}

/** The pedal face's look is cosmetic, not electrical - a colour/font pass over the player view and
 * (via the same stored value) the enclosure art, with no effect on the circuit itself. */
export function PedalAppearanceEditor({ appearance, onChange }: PedalAppearanceEditorProps) {
  const set = (patch: Partial<PedalAppearance>) => onChange({ ...appearance, ...patch });
  return (
    <div className="pedal-appearance" aria-label="외관 설정">
      <label className="pedal-appearance-swatch" title="몸체 색">
        <input type="color" value={appearance.bodyColor} onChange={(e) => set({ bodyColor: e.target.value })} aria-label="몸체 색" />
        <span>몸체</span>
      </label>
      <label className="pedal-appearance-swatch" title="글자 색">
        <input type="color" value={appearance.textColor} onChange={(e) => set({ textColor: e.target.value })} aria-label="글자 색" />
        <span>글자</span>
      </label>
      <label className="pedal-appearance-swatch" title="포인트 색 (노브·LED)">
        <input type="color" value={appearance.accentColor} onChange={(e) => set({ accentColor: e.target.value })} aria-label="포인트 색" />
        <span>포인트</span>
      </label>
      <select aria-label="글꼴" value={appearance.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
        {FONT_OPTIONS.map((f) => (
          <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>
            {f.label}
          </option>
        ))}
      </select>
      <button type="button" className="pedal-appearance-reset" onClick={() => onChange(DEFAULT_APPEARANCE)}>
        기본값
      </button>
    </div>
  );
}
