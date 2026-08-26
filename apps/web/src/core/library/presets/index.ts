import type { PedalPreset } from "../types";
import { bufferPreset } from "./buffer";
import { diodeClipperPreset } from "./diode-clipper";
import { asymmetricClipperPreset } from "./asymmetric-clipper";
import { opampDrivePreset } from "./opamp-drive";
import { multiStageDrivePreset } from "./multi-stage-drive";
import { fuzzGermaniumPreset } from "./fuzz-germanium";
import { passiveToneTiltPreset } from "./passive-tone-tilt";
import { activeShelfEqPreset } from "./active-shelf-eq";

export const presets: PedalPreset[] = [
  bufferPreset,
  diodeClipperPreset,
  asymmetricClipperPreset,
  opampDrivePreset,
  multiStageDrivePreset,
  fuzzGermaniumPreset,
  passiveToneTiltPreset,
  activeShelfEqPreset,
];

export {
  bufferPreset,
  diodeClipperPreset,
  asymmetricClipperPreset,
  opampDrivePreset,
  multiStageDrivePreset,
  fuzzGermaniumPreset,
  passiveToneTiltPreset,
  activeShelfEqPreset,
};
export type { PedalPreset };
