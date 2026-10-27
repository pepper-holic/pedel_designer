import { fft } from "./fft";

export interface SpectrumOptions {
  /** Frame length, a power of 2. 8192 at 48kHz is ~5.9Hz per bin - enough to separate low-E
   * harmonics without smearing a short note across too few frames. */
  fftSize?: number;
  /** Fraction of a frame consecutive frames share (Welch averaging). */
  overlap?: number;
}

export interface Spectrum {
  frequenciesHz: Float64Array;
  /** Amplitude of a sinusoid at that bin, in dB re 1V peak (a 1V-peak sine reads 0dB). */
  magnitudeDb: Float64Array;
}

const DB_FLOOR = -160;

/**
 * Averaged magnitude spectrum of a signal (Welch's method with a Hann window).
 *
 * One FFT over a whole guitar note is dominated by its attack; averaging overlapping frames gives a
 * stable picture of which harmonics a clipping stage adds, which is the thing people look at a
 * spectrum for. The Hann window keeps a strong fundamental's leakage ~-100dB down a few bins away,
 * so the low-level harmonics next to it stay readable.
 *
 * The scale is corrected for the window's coherent gain, so a 1V-peak sine reads 0dB whatever the
 * frame length - the numbers line up with the waveform tab's peak voltages.
 */
export function computeSpectrum(signal: ArrayLike<number>, sampleRate: number, options: SpectrumOptions = {}): Spectrum {
  const requested = options.fftSize ?? 8192;
  // A signal shorter than one frame still gets a spectrum: shrink the frame to the largest power of
  // two that fits (min 64), rather than zero-padding a tiny signal into a meaningless smear.
  let fftSize = requested;
  while (fftSize > 64 && fftSize > signal.length) fftSize >>= 1;
  const hop = Math.max(1, Math.round(fftSize * (1 - (options.overlap ?? 0.5))));
  const bins = fftSize / 2 + 1;

  const window = new Float64Array(fftSize);
  let windowSum = 0;
  for (let i = 0; i < fftSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
    windowSum += window[i];
  }

  const power = new Float64Array(bins);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let frames = 0;
  for (let start = 0; start + fftSize <= Math.max(signal.length, fftSize); start += hop) {
    for (let i = 0; i < fftSize; i++) {
      const index = start + i;
      re[i] = index < signal.length ? signal[index] * window[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
    if (start + fftSize >= signal.length) break;
  }

  const frequenciesHz = new Float64Array(bins);
  const magnitudeDb = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    frequenciesHz[k] = (k * sampleRate) / fftSize;
    // RMS over frames of the single-sided amplitude: |X| * 2 / sum(window) is the peak amplitude of
    // a sinusoid centred on bin k (DC and Nyquist are not doubled).
    const single = k === 0 || k === bins - 1 ? 1 : 2;
    const amplitude = (Math.sqrt(power[k] / Math.max(frames, 1)) * single) / windowSum;
    magnitudeDb[k] = amplitude > 0 ? Math.max(DB_FLOOR, 20 * Math.log10(amplitude)) : DB_FLOOR;
  }
  return { frequenciesHz, magnitudeDb };
}

export interface SpectrumPeak {
  frequencyHz: number;
  magnitudeDb: number;
}

/**
 * The strongest local maxima in [minHz, maxHz], loudest first. A peak must beat every bin within
 * `guardBins` either side, so one sinusoid's window lobe is not reported as three neighbouring peaks.
 */
export function findSpectrumPeaks(spectrum: Spectrum, count: number, minHz = 20, maxHz = 20000, guardBins = 3): SpectrumPeak[] {
  const { frequenciesHz, magnitudeDb } = spectrum;
  const peaks: SpectrumPeak[] = [];
  for (let k = 1; k < frequenciesHz.length - 1; k++) {
    const f = frequenciesHz[k];
    if (f < minHz || f > maxHz) continue;
    let isPeak = true;
    for (let d = 1; d <= guardBins && isPeak; d++) {
      if ((k - d >= 0 && magnitudeDb[k - d] > magnitudeDb[k]) || (k + d < magnitudeDb.length && magnitudeDb[k + d] >= magnitudeDb[k])) isPeak = false;
    }
    if (isPeak) peaks.push({ frequencyHz: f, magnitudeDb: magnitudeDb[k] });
  }
  return peaks.sort((a, b) => b.magnitudeDb - a.magnitudeDb).slice(0, count);
}
