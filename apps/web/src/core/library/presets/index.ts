import type { PedalPreset, PresetCategory, PresetVariant } from "../types";
import { bufferPreset } from "./buffer";
import { diodeClipperPreset } from "./diode-clipper";
import { asymmetricClipperPreset } from "./asymmetric-clipper";
import { opampDrivePreset } from "./opamp-drive";
import { ts9OverdrivePreset } from "./ts9-overdrive";
import { multiStageDrivePreset } from "./multi-stage-drive";
import { fuzzGermaniumPreset } from "./fuzz-germanium";
import { passiveToneTiltPreset } from "./passive-tone-tilt";
import { activeShelfEqPreset } from "./active-shelf-eq";
import { jfetBoostPreset } from "./jfet-boost";
import {
  archivePresets,
  ratStyleDistortionPreset,
  klonStyleBlendPreset,
  bigMuffStyleFuzzPreset,
  bossStyleOverdrivePreset,
  timmyStyleOverdrivePreset,
  bluesbreakerStyleOverdrivePreset,
  kingOfToneStyleOverdrivePreset,
  ocdStyleOverdrivePreset,
  lpb1StyleBoostPreset,
} from "./archive";

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
  jfetBoostPreset,
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
  jfetBoostPreset,
  archivePresets,
  ratStyleDistortionPreset,
  klonStyleBlendPreset,
  bigMuffStyleFuzzPreset,
  bossStyleOverdrivePreset,
  timmyStyleOverdrivePreset,
  bluesbreakerStyleOverdrivePreset,
  kingOfToneStyleOverdrivePreset,
  ocdStyleOverdrivePreset,
  lpb1StyleBoostPreset,
};
export type { PedalPreset, PresetCategory, PresetVariant };
