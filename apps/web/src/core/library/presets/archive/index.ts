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
import { tonebenderMk3StyleFuzzPreset } from "./tonebender-mk3-style-fuzz";
import { ds1StyleDistortionPreset } from "./ds1-style-distortion";
import { microAmpStyleBoostPreset } from "./micro-amp-style-boost";
import { electraStyleDistortionPreset } from "./electra-style-distortion";
import { bazzFussStyleFuzzPreset } from "./bazz-fuss-style-fuzz";

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
  tonebenderMk3StyleFuzzPreset,
  ds1StyleDistortionPreset,
  microAmpStyleBoostPreset,
  electraStyleDistortionPreset,
  bazzFussStyleFuzzPreset,
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
  tonebenderMk3StyleFuzzPreset,
  ds1StyleDistortionPreset,
  microAmpStyleBoostPreset,
  electraStyleDistortionPreset,
  bazzFussStyleFuzzPreset,
};
