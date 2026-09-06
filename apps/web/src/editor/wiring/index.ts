import { singlePickupVolumeTone } from "./singlePickupVolumeTone";
import type { WiringCategory, WiringPreset } from "./types";

export const wiringPresets: WiringPreset[] = [singlePickupVolumeTone];

/** Display order for the wiring explorer tree - roughly "simplest first". */
export const WIRING_CATEGORY_ORDER: WiringCategory[] = ["픽업 기본", "셀렉터", "코일 스위칭", "톤 회로", "온보드 액티브"];

export type { WiringPreset, WiringCategory };
