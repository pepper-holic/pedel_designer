/** Effect families of kit circuits (references/pcb-kits/index.json "type"), in library order. */
export const KIT_FAMILY_ORDER: [family: string, label: string][] = [
  ["buffer-boost", "부스트·버퍼"],
  ["overdrive", "오버드라이브"],
  ["distortion", "디스토션"],
  ["fuzz", "퍼즈"],
  ["preamp", "프리앰프"],
  ["eq", "톤·EQ"],
  ["compressor", "컴프레서"],
  ["filter", "필터·와우"],
  ["pitch", "옥타브"],
  ["modulation", "모듈레이션"],
  ["delay", "딜레이"],
  ["reverb", "리버브"],
  ["noise-gate", "노이즈 게이트"],
  ["utility", "유틸리티"],
  ["amp", "앰프"],
  ["unknown", "기타"],
];

export function kitFamilyOf(family: string): string {
  return KIT_FAMILY_ORDER.some(([f]) => f === family) ? family : "unknown";
}
