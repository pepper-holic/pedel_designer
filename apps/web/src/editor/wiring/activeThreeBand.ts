import type { WiringPreset } from "./types";

/**
 * Three-band onboard preamp: the Baxandall bass/treble stage with a gyrator mid section after it.
 *
 * The two halves are cascaded rather than folded into one op-amp loop. A mid band inside the
 * feedback network needs the resonant branch to return to the summing node, but a gyrator is a
 * *grounded* simulated inductor - putting it there means reasoning about two grounds at once.
 * Cascading keeps each half exactly the circuit that was already verified on its own
 * (docs/plan-guitar-wiring.md §15), and plenty of real onboard preamps are built this way.
 *
 * Consequence worth knowing: the mid knob cuts only. Bass and treble boost and cut around centre,
 * the mid goes from "no notch" at 1 to a deep notch at 0.
 */
export const activeThreeBandEq: WiringPreset = {
  id: "wiring-active-3band-eq",
  name: "온보드 액티브 3밴드 (베이스/미드/트레블)",
  description:
    "Baxandall 베이스·트레블 단 뒤에 자이레이터 미드 섹션을 직렬로 붙인 구성. 베이스/트레블은 부스트·컷 양쪽, 미드는 컷 전용입니다(1 = 컷 없음, 0 = 최대 컷).",
  category: "온보드 액티브",
  outputTerminal: { partId: "Rmid_s", terminalId: "b" },
  snapshot: {
    blocks: [],
    parts: [
      { id: "V1", type: "vsource", x: 100, y: 320, rotation: 0, params: { voltage: 0 }, role: "signalSource" },
      // --- Baxandall bass / treble stage ---
      { id: "Rin_bass", type: "resistor", x: 260, y: 220, rotation: 0, params: { resistance: 10_000 } },
      { id: "Rf_bass", type: "resistor", x: 660, y: 220, rotation: 0, params: { resistance: 10_000 } },
      { id: "BASS", type: "potentiometer", x: 460, y: 160, rotation: 0, params: { resistance: 100_000, position: 0.5, taper: "B" } },
      { id: "Cbass", type: "capacitor", x: 460, y: 270, rotation: 0, params: { capacitance: 4.7e-9 } },
      { id: "Cin_treble", type: "capacitor", x: 260, y: 430, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "Cf_treble", type: "capacitor", x: 660, y: 430, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "TREBLE", type: "potentiometer", x: 460, y: 490, rotation: 0, params: { resistance: 100_000, position: 0.5, taper: "B" } },
      { id: "U1", type: "opamp", x: 810, y: 320, rotation: 0, params: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
      // --- Gyrator mid section, fed through a series resistor so the shunt has something to work
      //     against (an ideal op-amp output on its own is a stiff zero ohms). ---
      { id: "Rmid_s", type: "resistor", x: 960, y: 320, rotation: 0, params: { resistance: 10_000 } },
      { id: "Cmid", type: "capacitor", x: 1080, y: 420, rotation: 0, params: { capacitance: 100e-9 } },
      { id: "MID", type: "potentiometer", x: 1080, y: 510, rotation: 0, params: { resistance: 100_000, position: 1, taper: "B" } },
      { id: "Cg", type: "capacitor", x: 1080, y: 610, rotation: 0, params: { capacitance: 10e-9 } },
      { id: "R1g", type: "resistor", x: 1080, y: 700, rotation: 0, params: { resistance: 100_000 } },
      { id: "U2", type: "opamp", x: 1260, y: 610, rotation: 0, params: { openLoopGain: 1e5, gbwpHz: 0, slewRateVPerUs: 0, railPositive: 0, railNegative: 0 } },
      { id: "R2g", type: "resistor", x: 1260, y: 500, rotation: 0, params: { resistance: 1_000 } },
      { id: "Rload", type: "resistor", x: 1120, y: 300, rotation: 0, params: { resistance: 1_000_000 } },
      { id: "G1", type: "ground", x: 100, y: 410, rotation: 0, params: {} },
      { id: "G2", type: "ground", x: 780, y: 250, rotation: 0, params: {} },
      { id: "G3", type: "ground", x: 1110, y: 780, rotation: 0, params: {} },
      { id: "G5", type: "ground", x: 1150, y: 380, rotation: 0, params: {} },
    ],
    wires: [
      { id: "w3b1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Rin_bass", terminalId: "a" } },
      { id: "w3b2", a: { partId: "V1", terminalId: "negative" }, b: { partId: "G1", terminalId: "gnd" } },
      { id: "w3b3", a: { partId: "Rin_bass", terminalId: "b" }, b: { partId: "BASS", terminalId: "b" } },
      { id: "w3b4", a: { partId: "Rf_bass", terminalId: "a" }, b: { partId: "BASS", terminalId: "a" } },
      { id: "w3b5", a: { partId: "BASS", terminalId: "wiper" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3b6", a: { partId: "Cbass", terminalId: "a" }, b: { partId: "BASS", terminalId: "b" } },
      { id: "w3b7", a: { partId: "Cbass", terminalId: "b" }, b: { partId: "BASS", terminalId: "a" } },
      { id: "w3b8", a: { partId: "V1", terminalId: "positive" }, b: { partId: "Cin_treble", terminalId: "a" } },
      { id: "w3b9", a: { partId: "Cin_treble", terminalId: "b" }, b: { partId: "TREBLE", terminalId: "b" } },
      { id: "w3b10", a: { partId: "Cf_treble", terminalId: "a" }, b: { partId: "TREBLE", terminalId: "a" } },
      { id: "w3b11", a: { partId: "TREBLE", terminalId: "wiper" }, b: { partId: "U1", terminalId: "inMinus" } },
      { id: "w3b12", a: { partId: "U1", terminalId: "inPlus" }, b: { partId: "G2", terminalId: "gnd" } },
      { id: "w3b13", a: { partId: "Rf_bass", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
      { id: "w3b14", a: { partId: "Cf_treble", terminalId: "b" }, b: { partId: "U1", terminalId: "out" } },
      // Mid section
      { id: "w3b15", a: { partId: "U1", terminalId: "out" }, b: { partId: "Rmid_s", terminalId: "a" } },
      { id: "w3b16", a: { partId: "Rmid_s", terminalId: "b" }, b: { partId: "Cmid", terminalId: "a" } },
      // The mid pot sits in series with the resonant branch, so it sets how hard the notch bites.
      { id: "w3b17", a: { partId: "Cmid", terminalId: "b" }, b: { partId: "MID", terminalId: "a" } },
      { id: "w3b18", a: { partId: "MID", terminalId: "wiper" }, b: { partId: "Cg", terminalId: "a" } },
      { id: "w3b19", a: { partId: "Cg", terminalId: "b" }, b: { partId: "R1g", terminalId: "a" } },
      { id: "w3b20", a: { partId: "R1g", terminalId: "b" }, b: { partId: "G3", terminalId: "gnd" } },
      { id: "w3b21", a: { partId: "Cg", terminalId: "b" }, b: { partId: "U2", terminalId: "inPlus" } },
      { id: "w3b22", a: { partId: "U2", terminalId: "out" }, b: { partId: "U2", terminalId: "inMinus" } },
      { id: "w3b23", a: { partId: "U2", terminalId: "out" }, b: { partId: "R2g", terminalId: "b" } },
      { id: "w3b24", a: { partId: "R2g", terminalId: "a" }, b: { partId: "MID", terminalId: "wiper" } },
      { id: "w3b25", a: { partId: "Rmid_s", terminalId: "b" }, b: { partId: "Rload", terminalId: "a" } },
      { id: "w3b26", a: { partId: "Rload", terminalId: "b" }, b: { partId: "G5", terminalId: "gnd" } },
    ],
  },
};
