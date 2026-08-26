import type { PedalPreset } from "../../types";
import { ratStyleDistortionPreset } from "./rat-style-distortion";
import { klonStyleBlendPreset } from "./klon-style-blend";

/** Presets re-derived from publicly documented DIY circuit topologies - see docs/plan-circuit-archive.md. */
export const archivePresets: PedalPreset[] = [ratStyleDistortionPreset, klonStyleBlendPreset];

export { ratStyleDistortionPreset, klonStyleBlendPreset };
