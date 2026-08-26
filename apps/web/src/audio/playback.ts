import { generateCabinetIr, type CabinetVariant } from "./cabinetIr";

/** Rescales simulated volt-domain samples to a safe [-1, 1] playback range, preserving relative peak. */
export function normalizeForPlayback(samples: Float64Array): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 1e-9 ? 0.98 / peak : 1;

  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

/** Plays back simulated samples, optionally routed through a synthetic generic-cabinet IR convolution. */
export function playSamples(samples: Float64Array, sampleRate: number, audioContext: AudioContext, cabinetVariant?: CabinetVariant | null): AudioBufferSourceNode {
  const normalized = normalizeForPlayback(samples);
  const buffer = audioContext.createBuffer(1, normalized.length, sampleRate);
  buffer.copyToChannel(normalized, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;

  if (cabinetVariant) {
    const ir = generateCabinetIr(audioContext.sampleRate, cabinetVariant);
    const irBuffer = audioContext.createBuffer(1, ir.length, audioContext.sampleRate);
    irBuffer.copyToChannel(ir, 0);
    const convolver = audioContext.createConvolver();
    convolver.normalize = true;
    convolver.buffer = irBuffer;
    source.connect(convolver);
    convolver.connect(audioContext.destination);
  } else {
    source.connect(audioContext.destination);
  }

  source.start();
  return source;
}
