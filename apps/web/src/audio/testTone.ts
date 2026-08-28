/** Synthesizes a pure sine test tone, used to drive the circuit for THD measurement (a real audio
 * sample isn't a steady single tone, so THD needs a synthesized reference instead). */
export function generateSineWave(frequencyHz: number, amplitude: number, sampleRate: number, durationSec: number): Float64Array {
  const n = Math.round(sampleRate * durationSec);
  const samples = new Float64Array(n);
  for (let i = 0; i < n; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
  return samples;
}
