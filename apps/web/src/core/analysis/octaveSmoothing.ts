/**
 * Fractional-octave smoothing onto a log-frequency grid - what makes an analyzer read like an ear
 * (and like FabFilter Pro-Q's) instead of a picket fence of FFT bins: at the top of the range
 * hundreds of bins fall into one pixel and are averaged; at the bottom a pixel lies between bins and
 * is interpolated, so the curve is smooth everywhere.
 */

/** `count` frequencies from `fMin` to `fMax`, evenly spaced on a log axis. */
export function logGrid(fMin: number, fMax: number, count: number): Float64Array {
  const grid = new Float64Array(Math.max(2, count));
  const lMin = Math.log(fMin);
  const step = (Math.log(fMax) - lMin) / (grid.length - 1);
  for (let i = 0; i < grid.length; i++) grid[i] = Math.exp(lMin + i * step);
  return grid;
}

/** Reusable scratch arrays, so a 60fps analyzer does not allocate per frame. */
export interface SmoothingScratch {
  power: Float64Array;
  integral: Float64Array;
}

export function makeScratch(bins: number): SmoothingScratch {
  return { power: new Float64Array(bins), integral: new Float64Array(bins) };
}

/**
 * Smooths a dB spectrum (bin k at k * binHz) to `grid`. Each grid point gets the mean power over a
 * band `1/fraction` octave wide around it (`fraction` 0 = no smoothing beyond the grid's own
 * spacing). Power is treated as piecewise-linear between bins, so a band narrower than a bin
 * returns the interpolated level rather than a step.
 */
export function smoothSpectrum(
  db: ArrayLike<number>,
  binHz: number,
  grid: Float64Array,
  fraction: number,
  out: Float64Array = new Float64Array(grid.length),
  scratch: SmoothingScratch = makeScratch(db.length),
): Float64Array {
  const n = db.length;
  const { power, integral } = scratch;
  for (let k = 0; k < n; k++) {
    const v = db[k];
    power[k] = Number.isFinite(v) ? 10 ** (v / 10) : 0;
  }
  integral[0] = 0;
  for (let k = 1; k < n; k++) integral[k] = integral[k - 1] + (power[k - 1] + power[k]) / 2;

  // Integral of the piecewise-linear power from bin 0 to fractional bin x.
  const cumulative = (x: number) => {
    if (x <= 0) return 0;
    if (x >= n - 1) return integral[n - 1];
    const k = Math.floor(x);
    const t = x - k;
    return integral[k] + power[k] * t + ((power[k + 1] - power[k]) * t * t) / 2;
  };
  const at = (x: number) => {
    const k = Math.min(n - 2, Math.max(0, Math.floor(x)));
    const t = Math.min(1, Math.max(0, x - k));
    return power[k] + (power[k + 1] - power[k]) * t;
  };

  const octaveHalf = fraction > 0 ? 2 ** (1 / (2 * fraction)) : 1;
  const gridHalf = grid.length > 1 ? Math.sqrt(grid[1] / grid[0]) : 1;
  // Never narrower than the grid spacing: otherwise bins between two grid points would be skipped.
  const half = Math.max(octaveHalf, gridHalf);
  for (let i = 0; i < grid.length; i++) {
    const f = grid[i];
    const lo = f / half / binHz;
    const hi = (f * half) / binHz;
    const width = hi - lo;
    const mean = width > 1e-9 ? (cumulative(hi) - cumulative(lo)) / width : at(f / binHz);
    out[i] = mean > 0 ? 10 * Math.log10(mean) : -200;
  }
  return out;
}

/** dB to add for a display tilt of `dbPerOctave` around 1kHz (Pro-Q's "slope"): with 4.5dB/oct, a
 * typical music spectrum - which falls with frequency - reads roughly flat. */
export function tiltDb(frequency: number, dbPerOctave: number): number {
  return dbPerOctave === 0 ? 0 : dbPerOctave * Math.log2(frequency / 1000);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** "A2 +3¢" - the note nearest a frequency and how far off it is, for the hover readout. */
export function noteName(frequency: number): string {
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = NOTE_NAMES[((nearest % 12) + 12) % 12] + (Math.floor(nearest / 12) - 1);
  return `${name} ${cents >= 0 ? "+" : ""}${cents}¢`;
}
