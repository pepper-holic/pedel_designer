import { jazzBassTwoVolumes, pjBlendWiring } from "./bassWiring";
import { fiftiesWiring, modernWiring } from "./fiftiesVsModern";
import { humbuckerCoilSplit } from "./humbuckerCoilSplit";
import { humbuckerSeriesParallel } from "./humbuckerSeriesParallel";
import {
  activePickupLongCable,
  activeTwoBandEq,
  midCutGyrator,
  midCutRealInductor,
  passivePickupLongCable,
} from "./onboardActive";
import { outOfPhaseSwitch } from "./outOfPhase";
import { singlePickupVolumeTone } from "./singlePickupVolumeTone";
import { stratStyleFiveWay } from "./stratStyleFiveWay";
import { killSwitchAndNoLoadTone, rotaryToneCapSelector } from "./switchMods";
import { trebleBleedCapOnly, trebleBleedCapParallelResistor, trebleBleedCapSeriesResistor, trebleBleedNone } from "./trebleBleed";
import { lesPaulStyleThreeWay, teleStyleThreeWay } from "./twoPickupThreeWay";
import type { WiringCategory, WiringPreset } from "./types";

export const wiringPresets: WiringPreset[] = [
  singlePickupVolumeTone,
  teleStyleThreeWay,
  lesPaulStyleThreeWay,
  stratStyleFiveWay,
  humbuckerCoilSplit,
  humbuckerSeriesParallel,
  outOfPhaseSwitch,
  trebleBleedNone,
  trebleBleedCapOnly,
  trebleBleedCapParallelResistor,
  trebleBleedCapSeriesResistor,
  modernWiring,
  fiftiesWiring,
  rotaryToneCapSelector,
  killSwitchAndNoLoadTone,
  jazzBassTwoVolumes,
  pjBlendWiring,
  midCutRealInductor,
  midCutGyrator,
  activeTwoBandEq,
  activePickupLongCable,
  passivePickupLongCable,
];

/** Display order for the wiring explorer tree - roughly "simplest first". */
export const WIRING_CATEGORY_ORDER: WiringCategory[] = ["픽업 기본", "셀렉터", "코일 스위칭", "톤 회로", "베이스", "온보드 액티브"];

export type { WiringPreset, WiringCategory };
