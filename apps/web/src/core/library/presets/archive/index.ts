import type { PedalPreset } from "../../types";
import { ratStyleDistortionPreset } from "./rat-style-distortion";
import { klonStyleBlendPreset } from "./klon-style-blend";
import { bigMuffStyleFuzzPreset } from "./big-muff-style-fuzz";
import { bossStyleOverdrivePreset } from "./boss-style-overdrive";

/** Presets re-derived from publicly documented DIY circuit topologies - see docs/plan-circuit-archive.md. */
export const archivePresets: PedalPreset[] = [ratStyleDistortionPreset, klonStyleBlendPreset, bigMuffStyleFuzzPreset, bossStyleOverdrivePreset];

export { ratStyleDistortionPreset, klonStyleBlendPreset, bigMuffStyleFuzzPreset, bossStyleOverdrivePreset };
