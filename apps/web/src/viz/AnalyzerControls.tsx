import { setAnalyzerSettings, type AnalyzerSettings } from "./analyzerSettings";

/** Compact analyzer settings for a plot toolbar. */
export function AnalyzerControls({ settings }: { settings: AnalyzerSettings }) {
  const select = <K extends keyof AnalyzerSettings>(key: K, label: string, options: [AnalyzerSettings[K], string][], title: string) => (
    <label className="analyzer-control" title={title}>
      {label}
      <select
        value={String(settings[key])}
        onChange={(e) => {
          const picked = options.find(([v]) => String(v) === e.target.value);
          if (picked) setAnalyzerSettings({ [key]: picked[0] } as Partial<AnalyzerSettings>);
        }}
      >
        {options.map(([v, text]) => (
          <option key={String(v)} value={String(v)}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="analyzer-controls">
      {select(
        "smoothing",
        "스무딩",
        [
          [0, "없음"],
          [24, "1/24 oct"],
          [12, "1/12 oct"],
          [6, "1/6 oct"],
          [3, "1/3 oct"],
        ],
        "분수 옥타브 스무딩 - 촘촘할수록 배음 하나하나가, 넓을수록 전체 음색 경향이 보입니다",
      )}
      {select(
        "resolution",
        "해상도",
        [
          [4096, "낮음"],
          [8192, "보통"],
          [16384, "높음"],
          [32768, "최대"],
        ],
        "FFT 길이 - 높을수록 저음역이 정밀하지만 실시간 반응은 느려집니다",
      )}
      {select(
        "speed",
        "속도",
        [
          ["fast", "빠름"],
          ["medium", "보통"],
          ["slow", "느림"],
        ],
        "실시간(RTA) 곡선이 소리를 따라가는 속도",
      )}
      {select(
        "tilt",
        "틸트",
        [
          [0, "0"],
          [3, "3 dB/oct"],
          [4.5, "4.5 dB/oct"],
        ],
        "1kHz 기준 기울기 - 4.5dB/oct면 보통의 음악 스펙트럼이 대략 평평하게 보입니다 (Pro-Q 기본값)",
      )}
      {select(
        "range",
        "범위",
        [
          [60, "60 dB"],
          [90, "90 dB"],
          [120, "120 dB"],
        ],
        "그래프 맨 위에서 아래로 보여 줄 dB 폭",
      )}
      <label className="analyzer-control" title="주파수마다 최근 최댓값을 천천히 떨어지는 선으로 표시">
        <input type="checkbox" checked={settings.peakHold} onChange={(e) => setAnalyzerSettings({ peakHold: e.target.checked })} /> 피크
      </label>
    </div>
  );
}
