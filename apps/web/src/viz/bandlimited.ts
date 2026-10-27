/** Lanczos kernel half-width: 3 lobes is the usual balance of sharpness and ringing. */
const LANCZOS_A = 3;

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/**
 * The signal at fractional sample position `t`, reconstructed band-limited (Lanczos-3) - what an
 * oscilloscope on the real circuit would draw between the simulator's samples, rather than straight
 * lines. Exact at sample positions.
 */
export function interpolate(data: ArrayLike<number>, t: number): number {
  const k0 = Math.floor(t);
  if (t === k0 && k0 >= 0 && k0 < data.length) return data[k0];
  let sum = 0;
  let weights = 0;
  for (let k = k0 - LANCZOS_A + 1; k <= k0 + LANCZOS_A; k++) {
    if (k < 0 || k >= data.length) continue;
    const x = t - k;
    const w = sinc(x) * sinc(x / LANCZOS_A);
    sum += data[k] * w;
    weights += w;
  }
  return weights !== 0 ? sum / weights : 0;
}
