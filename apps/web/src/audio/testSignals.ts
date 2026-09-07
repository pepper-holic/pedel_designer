/**
 * Built-in signals to feed a circuit without hunting for an audio file.
 *
 * Uploading a WAV was the only way to run a simulation, which put a file-shaped obstacle in front of
 * the first thing a new user wants to do (docs/plan-ux-and-features.md §2-7). These are synthesised
 * at guitar level (peak ~0.8V) so the clipping thresholds in the presets behave as intended.
 */

export interface TestSignal {
  id: string;
  label: string;
  /** What the signal is for, shown next to the button. */
  hint: string;
}

export const TEST_SIGNALS: TestSignal[] = [
  { id: "note", label: "단음 (감쇠)", hint: "피킹 직후처럼 크게 시작해 줄어드는 한 음 - 클리핑이 어떻게 풀리는지 보기 좋습니다." },
  { id: "chord", label: "코드", hint: "여러 음이 동시에 울릴 때의 상호변조 - 드라이브가 강할수록 지저분해집니다." },
  { id: "sweep", label: "사인 스윕", hint: "저음에서 고음까지 훑는 신호 - 주파수별 동작을 파형으로 확인합니다." },
  { id: "impulse", label: "임펄스", hint: "한 샘플짜리 충격 - 회로의 임펄스 응답을 그대로 봅니다." },
];

const DURATION_SEC = 1.0;
/** Guitar-level peak. The presets' diode thresholds assume roughly this, so a hotter signal would
 * make every circuit look permanently clipped. */
const PEAK = 0.8;
/** Open-A-string-ish fundamental, low enough to show coupling-cap rolloff. */
const BASE_HZ = 110;

function decayingPartials(sampleRate: number, harmonics: { hz: number; gain: number }[], decayPerSec: number): Float64Array {
  const length = Math.floor(sampleRate * DURATION_SEC);
  const out = new Float64Array(length);
  let maxAbs = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-decayPerSec * t);
    let v = 0;
    for (const h of harmonics) v += h.gain * Math.sin(2 * Math.PI * h.hz * t);
    out[i] = v * envelope;
    maxAbs = Math.max(maxAbs, Math.abs(out[i]));
  }
  // Normalise after summing: the partial gains describe timbre, not level, and their sum depends on
  // how many there are.
  if (maxAbs > 0) for (let i = 0; i < length; i++) out[i] = (out[i] / maxAbs) * PEAK;
  return out;
}

/** Logarithmic sweep, so each octave gets the same amount of time - what the ear and a Bode plot
 * both expect, unlike a linear sweep that spends most of its length in the treble. */
function logSweep(sampleRate: number, fromHz: number, toHz: number): Float64Array {
  const length = Math.floor(sampleRate * DURATION_SEC);
  const out = new Float64Array(length);
  const k = Math.log(toHz / fromHz) / DURATION_SEC;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Phase is the integral of the instantaneous frequency fromHz * e^(k t).
    const phase = ((2 * Math.PI * fromHz) / k) * (Math.exp(k * t) - 1);
    out[i] = PEAK * Math.sin(phase);
  }
  return out;
}

export function generateTestSignal(id: string, sampleRate: number): Float64Array {
  switch (id) {
    case "note":
      // A plucked string is mostly fundamental with a handful of decaying harmonics above it.
      return decayingPartials(
        sampleRate,
        [
          { hz: BASE_HZ, gain: 1 },
          { hz: BASE_HZ * 2, gain: 0.45 },
          { hz: BASE_HZ * 3, gain: 0.22 },
          { hz: BASE_HZ * 4, gain: 0.12 },
        ],
        3,
      );
    case "chord":
      // Root, major third and fifth, each with a second harmonic - enough to hear intermodulation.
      return decayingPartials(
        sampleRate,
        [
          { hz: BASE_HZ, gain: 1 },
          { hz: BASE_HZ * 1.26, gain: 0.8 },
          { hz: BASE_HZ * 1.5, gain: 0.8 },
          { hz: BASE_HZ * 2, gain: 0.4 },
          { hz: BASE_HZ * 2.52, gain: 0.3 },
          { hz: BASE_HZ * 3, gain: 0.3 },
        ],
        2,
      );
    case "sweep":
      return logSweep(sampleRate, 40, 12000);
    case "impulse": {
      const out = new Float64Array(Math.floor(sampleRate * DURATION_SEC));
      out[0] = 1;
      return out;
    }
    default:
      return new Float64Array(0);
  }
}
