import type { PartType } from "./partDefs";

/** Position names per switch type. A switch has a handful of named states, not a continuous value,
 * so it gets a select rather than the numeric field the generic param loop would give it. */
export const SWITCH_POSITION_LABELS: Partial<Record<PartType, string[]>> = {
  spst: ["열림 (OFF)", "닫힘 (ON)"],
  spdt: ["위치 1 (단자 1)", "위치 2 (단자 2)"],
  dpdt: ["위치 1 (단자 a)", "위치 2 (단자 b)"],
  blade3: ["1 (입력 1)", "2 (입력 1+2)", "3 (입력 2)"],
  blade5: ["1 (입력 1)", "2 (입력 1+2)", "3 (입력 2)", "4 (입력 2+3)", "5 (입력 3)"],
  rotary6: ["1단", "2단", "3단", "4단", "5단", "6단"],
};
