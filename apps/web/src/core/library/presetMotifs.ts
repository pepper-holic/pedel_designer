/**
 * The real pedal a preset is modelled on, for the library listing: a short "XX 스타일" name and the
 * colour that pedal is known by, so the list reads like a pedalboard (green TS, black RAT, gold
 * Klon) instead of a column of long technical names. Presets without a motif are generic circuits
 * and list under their own name. Keyed by preset id, kept apart from the presets so the circuit
 * files stay about the circuit.
 */
export interface PresetMotif {
  /** The pedal, as a builder calls it: "TS9", "Big Muff", "Klon". */
  name: string;
  /** The enclosure colour, as a CSS colour. */
  color: string;
}

export const PRESET_MOTIFS: Record<string, PresetMotif> = {
  "ts9-overdrive": { name: "TS9", color: "#2f9e5b" },
  "rat-style-distortion": { name: "RAT", color: "#1c1c1c" },
  "klon-style-blend": { name: "Klon", color: "#d2b161" },
  "big-muff-style-fuzz": { name: "Big Muff", color: "#c6c7c9" },
  "boss-style-overdrive": { name: "Boss SD-1", color: "#f5c518" },
  "timmy-style-overdrive": { name: "Timmy", color: "#f7f7f5" },
  "bluesbreaker-style-overdrive": { name: "Bluesbreaker", color: "#a9adb3" },
  "king-of-tone-style-overdrive": { name: "King of Tone", color: "#d4a017" },
  "ocd-style-overdrive": { name: "OCD", color: "#f3eee0" },
  "lpb1-style-boost": { name: "LPB-1", color: "#7b8794" },
  "rangemaster-style-treble-boost": { name: "Rangemaster", color: "#8c7340" },
  "distortion-plus-style": { name: "Distortion+", color: "#f0b400" },
  "octave-fuzz-style": { name: "Octavia", color: "#3b7a3a" },
  "tonebender-mk3-style-fuzz": { name: "Tone Bender MkIII", color: "#c08a2e" },
  "fuzz-germanium": { name: "Fuzz Face", color: "#c9302c" },
  "ds1-style-distortion": { name: "DS-1", color: "#f26a1b" },
  "micro-amp-style-boost": { name: "Micro Amp", color: "#ece2c4" },
  "electra-style-distortion": { name: "Electra", color: "#6f7a86" },
  "bazz-fuss-style-fuzz": { name: "Bazz Fuss", color: "#8a5a2b" },
};

export function presetMotif(presetId: string): PresetMotif | undefined {
  return PRESET_MOTIFS[presetId];
}
