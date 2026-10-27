import type { PedalPreset } from "../../types";
import { GENERIC_GERMANIUM_PNP } from "../../deviceModels";

/**
 * Three-transistor germanium fuzz in the Tone Bender Mk III style.
 *
 * The defining move of this circuit's lineage is bolting a germanium PNP gain stage in front of a
 * direct-coupled Fuzz-Face-style feedback pair - the same two-transistor core `fuzz-germanium.ts`
 * already models on its own (Q2's collector feeds Q3's base directly, with the global bias-feedback
 * resistor running from Q3's collector back to Q2's base). Q2/Q3 are built exactly like that
 * existing preset's Q1/Q2, since it is the same validated stage; only Q1 (the extra pre-gain) and
 * the sustain control in front of it are new. The extra stage is what pushes the pair harder and
 * earlier than a bare two-transistor circuit does at the same input level, which is the thicker,
 * more sustained character this family is known for. See docs/plan-circuit-archive.md.
 */
export const tonebenderMk3StyleFuzzPreset: PedalPreset = {
  id: "tonebender-mk3-style-fuzz",
  name: "퍼즈 (3-트랜지스터 게르마늄, Tone Bender Mk III 스타일)",
  description: "게르마늄 부스트 단 + Fuzz Face 스타일 2-트랜지스터 직결 피드백 페어 - 앞단 부스트가 페어를 더 세게 밀어붙여 두꺼운 서스테인을 만듦",
  category: "퍼즈",
  inputSourceId: "V1",
  tapNodes: ["in", "q1coll", "outAC"],
  outputNode: "outAC",
  defaultParams: {
    /** "Sustain" control - sets how hard Q1 drives the pair. */
    sustainResistance: 22_000,
    // Same DC bias point as the verified rangemaster-style-treble-boost preset's Q1 (same divider
    // ratio, same Rc/Re) - reused rather than re-derived by hand, since a hand-picked divider here
    // first put Q1 right at the edge of saturation (Vec ~0.07V) with almost no headroom to swing.
    collector1Resistance: 3_900,
    feedbackResistance: 100_000,
  },
  archive: {
    sourceRefs: [
      { label: "geofex.com - R.G. Keen, 'Technology of the Tone Bender' (topology reference, not copied)", url: "https://www.geofex.com/article_folders/tonebend/tonebend.htm" },
    ],
    disclaimer: "대표값 근사치이며 특정 상용 제품의 실측 회로도가 아닙니다.",
  },
  // Functional decomposition (docs/plan-core-fundamentals.md B-5): loads as labelled blocks that can be
  // collapsed into black boxes; knobs load as real potentiometers.
  blocks: [
    { id: "power", label: "전원 (-9V)", category: "power", elements: ["Vcc", "Vdd"], ports: [{ kind: "supply", node: "vneg", label: "-9V" }] },
    { id: "stage1", label: "1단 증폭", category: "gain", elements: ["Cin", "Rb1a", "Rb1b", "Q1", "Rc1", "Re1"], ports: [{ kind: "in", node: "in" }, { kind: "out", node: "q1coll" }, { kind: "supply", node: "vneg", label: "-9V" }] },
    { id: "fuzz", label: "퍼즈 코어 (2-TR 피드백)", category: "fuzz", elements: ["Csustain", "Rsustain", "Rfb", "Q2", "Re2", "Rc2", "Q3", "Rc3", "Re3", "Ce3"], ports: [{ kind: "in", node: "q1coll" }, { kind: "out", node: "outc" }, { kind: "supply", node: "vneg", label: "-9V" }] },
    { id: "output", label: "출력 커플링", category: "output", elements: ["Cout", "Rload"], ports: [{ kind: "in", node: "outc" }, { kind: "out", node: "outAC" }] },
  ],
  build: (params) => ({
    elements: [
      { id: "V1", type: "vsource", nodes: ["in", "0"], voltage: 0 },
      { id: "Vcc", type: "vsource", nodes: ["0", "vneg"], voltage: 9, role: "supply" },

      // Q1: germanium common-emitter pre-gain stage. Unbypassed emitter, same reasoning as
      // lpb1-style-boost - a predictable gain fixed by Rc/Re rather than raw device gain, so the
      // sustain control that follows has something consistent to work with.
      { id: "Cin", type: "capacitor", nodes: ["in", "q1base"], capacitance: 2.2e-6 },
      // Same divider ratio as rangemaster-style-treble-boost's verified-working Q1 (68k/470k,
      // ground-side small) - an earlier, hand-picked 47k/470k pair here put the base too close to
      // the negative rail and drove Q1 into near-saturation with almost no headroom to swing.
      { id: "Rb1a", type: "resistor", nodes: ["0", "q1base"], resistance: 68_000 },
      { id: "Rb1b", type: "resistor", nodes: ["q1base", "vneg"], resistance: 470_000 },
      { id: "Q1", type: "bjt", nodes: ["q1base", "q1coll", "q1emit"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Rc1", type: "resistor", nodes: ["vneg", "q1coll"], resistance: params.collector1Resistance },
      { id: "Re1", type: "resistor", nodes: ["q1emit", "0"], resistance: 3_900 },

      // Sustain: feeds Q1's collector into the pair's input base, standing in for the pot on the
      // real pedal that sets how hard the pair is driven. Counterintuitively, *raising* this
      // resistance drives the pair harder here: a low value ties the sustain node close to q2base,
      // which gives the Q2/Q3 feedback loop (Rfb, below) a stiffer low-impedance point to return
      // its signal through and damps the loop's gain; a high value isolates q2base more, letting
      // the feedback loop swing further. Measured, not assumed - see tonebender-mk3-style-fuzz.test.ts.
      { id: "Csustain", type: "capacitor", nodes: ["q1coll", "sustain"], capacitance: 0.1e-6 },
      { id: "Rsustain", type: "resistor", nodes: ["sustain", "q2base"], resistance: params.sustainResistance },

      // Q2/Q3: the fuzz-germanium.ts pair, unchanged in shape - Q2's collector direct-couples into
      // Q3's base (no capacitor, the Fuzz-Face hallmark), and the global feedback resistor runs
      // from Q3's collector back to Q2's base.
      { id: "Rfb", type: "resistor", nodes: ["outc", "q2base"], resistance: params.feedbackResistance },
      { id: "Q2", type: "bjt", nodes: ["q2base", "q2coll", "q2emit"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Re2", type: "resistor", nodes: ["q2emit", "0"], resistance: 470 },
      { id: "Rc2", type: "resistor", nodes: ["vneg", "q2coll"], resistance: 33_000 },

      { id: "Q3", type: "bjt", nodes: ["q2coll", "outc", "e3"], polarity: "pnp", ...GENERIC_GERMANIUM_PNP },
      { id: "Rc3", type: "resistor", nodes: ["vneg", "outc"], resistance: 8_200 },
      { id: "Re3", type: "resistor", nodes: ["e3", "0"], resistance: 100 },
      { id: "Ce3", type: "capacitor", nodes: ["e3", "0"], capacitance: 22e-6 },

      { id: "Cout", type: "capacitor", nodes: ["outc", "outAC"], capacitance: 1e-6 },
      { id: "Rload", type: "resistor", nodes: ["outAC", "0"], resistance: 1_000_000 },
    ],
  }),
};
