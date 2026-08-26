/** Rescales simulated volt-domain samples to a safe [-1, 1] playback range, preserving relative peak. */
export function normalizeForPlayback(samples: Float64Array): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 1e-9 ? 0.98 / peak : 1;

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

export function playSamples(samples: Float64Array, sampleRate: number, audioContext: AudioContext): AudioBufferSourceNode {
  const normalized = normalizeForPlayback(samples);
  const buffer = audioContext.createBuffer(1, normalized.length, sampleRate);
  buffer.copyToChannel(normalized, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
  return source;
}
