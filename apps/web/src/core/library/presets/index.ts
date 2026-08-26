import type { PedalPreset } from "../types";
import { bufferPreset } from "./buffer";
import { diodeClipperPreset } from "./diode-clipper";
import { asymmetricClipperPreset } from "./asymmetric-clipper";
import { opampDrivePreset } from "./opamp-drive";
import { ts9OverdrivePreset } from "./ts9-overdrive";
import { multiStageDrivePreset } from "./multi-stage-drive";
import { fuzzGermaniumPreset } from "./fuzz-germanium";
import { passiveToneTiltPreset } from "./passive-tone-tilt";
import { activeShelfEqPreset } from "./active-shelf-eq";
import { archivePresets, ratStyleDistortionPreset, klonStyleBlendPreset } from "./archive";

export const presets: PedalPreset[] = [
  bufferPreset,
  diodeClipperPreset,
  asymmetricClipperPreset,
  opampDrivePreset,
  ts9OverdrivePreset,
  multiStageDrivePreset,
  fuzzGermaniumPreset,
  passiveToneTiltPreset,
  activeShelfEqPreset,
  ...archivePresets,
];

export {
  bufferPreset,
  diodeClipperPreset,
  asymmetricClipperPreset,
  opampDrivePreset,
  ts9OverdrivePreset,
  multiStageDrivePreset,
  fuzzGermaniumPreset,
  passiveToneTiltPreset,
  activeShelfEqPreset,
  archivePresets,
  ratStyleDistortionPreset,
  klonStyleBlendPreset,
};
export type { PedalPreset };
