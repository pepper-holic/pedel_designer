/** Decodes an uploaded audio file into mono Float64 samples plus its sample rate. */
export interface LoadedSample {
  samples: Float64Array;
  sampleRate: number;
}

export async function loadSampleFromFile(file: File, audioContext: AudioContext): Promise<LoadedSample> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return { samples: toMono(audioBuffer), sampleRate: audioBuffer.sampleRate };
}

function toMono(buffer: AudioBuffer): Float64Array {
  const length = buffer.length;
  const mono = new Float64Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}
