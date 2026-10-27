export type WorkMode = "design" | "play" | "analyze" | "build";

/** The four work steps, in order - also their 1-4 keyboard shortcuts. */
export const MODES: { id: WorkMode; label: string; hint: string }[] = [
  { id: "design", label: "설계", hint: "회로를 불러오고, 블록·부품으로 조립하고, 값을 바꿉니다" },
  { id: "play", label: "연주", hint: "페달처럼 노브를 돌리며 소리와 스펙트럼을 확인합니다" },
  { id: "analyze", label: "분석", hint: "주파수 응답·파형·스펙트럼·THD·공차를 자세히 봅니다" },
  { id: "build", label: "제작", hint: "부품 목록, KiCad, 스트립보드, PCB, 인클로저" },
];
