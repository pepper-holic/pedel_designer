import type { PedalPreset } from "../../types";
import { ratStyleDistortionPreset } from "./rat-style-distortion";
import { klonStyleBlendPreset } from "./klon-style-blend";
import { bigMuffStyleFuzzPreset } from "./big-muff-style-fuzz";
import { bossStyleOverdrivePreset } from "./boss-style-overdrive";
import { timmyStyleOverdrivePreset } from "./timmy-style-overdrive";
import { bluesbreakerStyleOverdrivePreset } from "./bluesbreaker-style-overdrive";
import { kingOfToneStyleOverdrivePreset } from "./king-of-tone-style-overdrive";
import { ocdStyleOverdrivePreset } from "./ocd-style-overdrive";
import { lpb1StyleBoostPreset } from "./lpb1-style-boost";
import { rangemasterStyleTrebleBoostPreset } from "./rangemaster-style-treble-boost";
import { distortionPlusStylePreset } from "./distortion-plus-style";
import { octaveFuzzStylePreset } from "./octave-fuzz-style";

/** Presets re-derived from publicly documented DIY circuit topologies - see docs/plan-circuit-archive.md. */
export const archivePresets: PedalPreset[] = [
  ratStyleDistortionPreset,
  klonStyleBlendPreset,
  bigMuffStyleFuzzPreset,
  bossStyleOverdrivePreset,
  timmyStyleOverdrivePreset,
  bluesbreakerStyleOverdrivePreset,
  kingOfToneStyleOverdrivePreset,
  ocdStyleOverdrivePreset,
  lpb1StyleBoostPreset,
  rangemasterStyleTrebleBoostPreset,
  distortionPlusStylePreset,
  octaveFuzzStylePreset,
];

export {
  ratStyleDistortionPreset,
  klonStyleBlendPreset,
  bigMuffStyleFuzzPreset,
  bossStyleOverdrivePreset,
  timmyStyleOverdrivePreset,
  bluesbreakerStyleOverdrivePreset,
  kingOfToneStyleOverdrivePreset,
  ocdStyleOverdrivePreset,
  lpb1StyleBoostPreset,
  rangemasterStyleTrebleBoostPreset,
  distortionPlusStylePreset,
  octaveFuzzStylePreset,
};
