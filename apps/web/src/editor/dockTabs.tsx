import { FrequencyResponseTab } from "./FrequencyResponseTab";
import { WaveformTab } from "./WaveformTab";
import { SpectrumTab } from "./SpectrumTab";
import type { ResolvedProbe } from "./probes";
import { SweepTab } from "./SweepTab";
import { DrcPanel } from "./DrcPanel";
import { ImpedancePanel } from "./ImpedancePanel";
import { ThdPanel } from "./ThdPanel";
import { MonteCarloPanel } from "./MonteCarloPanel";
import { ChainPanel } from "./ChainPanel";
import { BomPanel } from "./BomPanel";
import { PcbExportPanel } from "./PcbExportPanel";
import { StripboardPanel } from "./pcb/StripboardPanel";
import { PcbLayoutPanel } from "./pcb/PcbLayoutPanel";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import type { GraphNetlist } from "./netlistFromGraph";
import type { PartInstance, Wire } from "./types";
import type { useAnalysisPanels } from "./useAnalysisPanels";
import type { useAudioRun } from "./useAudioRun";
import type { FrequencyResponseResult } from "./useFrequencyResponse";

export interface DockTab {
  key: string;
  label: string;
  /** Plain-language explanation shown as the tab's tooltip, for users who don't know the term. */
  helpText: string;
  content: React.ReactNode;
}

interface DockTabsInput {
  parts: PartInstance[];
  wires: Wire[];
  graph: GraphNetlist;
  outputNode: string;
  onSelectPart: (id: string) => void;
  acResult: FrequencyResponseResult;
  probes: ResolvedProbe[];
  monteCarloResult: MonteCarloResult | null;
  audio: ReturnType<typeof useAudioRun>;
  analysis: ReturnType<typeof useAnalysisPanels>;
}

/**
 * The bottom dock's tabs, in the order they are meant to be reached: check the circuit first, then
 * look at what it does, then at what it costs to build.
 *
 * Kept out of SchematicEditor so that component stays about editing - the tab list is pure
 * configuration and grows every time an analysis is added.
 */
export function buildDockTabs({
  parts,
  wires,
  graph,
  outputNode,
  onSelectPart,
  acResult,
  probes,
  monteCarloResult,
  audio,
  analysis,
}: DockTabsInput): DockTab[] {
  const inputElement = graph.netlist.elements.find((e) => e.id === graph.inputSourceId);
  const inputNet = inputElement ? inputElement.nodes[0] : null;
  return [
  {
    key: "drc",
    label: "검사",
    helpText: "접지 누락, 떠 있는 단자처럼 회로가 동작하지 않는 원인을 찾아 알려줍니다. 분석 결과가 비어 있으면 먼저 여기를 보세요.",
    content: <DrcPanel parts={parts} wires={wires} outputNode={outputNode} onSelectPart={onSelectPart} />,
  },
  {
    key: "response",
    label: `주파수 응답${outputNode ? ` (→ ${outputNode})` : ""}`,
    helpText: "이 회로가 저음/고음을 얼마나 통과시키거나 깎는지 주파수별로 보여줍니다. 프로브를 찍으면 지점마다 곡선을 겹쳐 그립니다.",
    content: (
      <FrequencyResponseTab
        status={acResult.status}
        error={acResult.error}
        points={acResult.points}
        probeSeries={acResult.probeSeries}
        outputNode={outputNode}
        band={monteCarloResult}
      />
    ),
  },
  {
    key: "waveform",
    label: "파형",
    helpText: "오디오 파일을 넣고 시뮬레이션을 실행하면 입력/출력 파형을 비교하고 소리로 들어볼 수 있습니다.",
    content: (
      <WaveformTab
        traces={audio.waveTraces}
        probes={probes}
        onPlay={audio.handlePlay}
        onCompare={audio.handleCompare}
        cabinetEnabled={audio.cabinetEnabled}
        onCabinetEnabledChange={audio.setCabinetEnabled}
        cabinetVariant={audio.cabinetVariant}
        onCabinetVariantChange={audio.setCabinetVariant}
      />
    ),
  },
  {
    key: "spectrum",
    label: "스펙트럼",
    helpText: "시뮬레이션 결과에 어떤 주파수(배음)가 얼마나 들어 있는지 보여줍니다. 클리핑은 입력에 없던 배음 사다리로, 톤 회로는 기울기로 나타납니다.",
    content: (
      <SpectrumTab traces={audio.waveTraces} sampleRate={audio.sample?.sampleRate ?? null} probes={probes} outputNode={outputNode} inputNet={inputNet} />
    ),
  },
  {
    key: "sweep",
    label: "노브 스윕",
    helpText: "톤/볼륨 노브나 셀렉터를 위치별로 돌렸을 때의 주파수 응답을 한 그래프에 겹쳐서 비교합니다.",
    content: <SweepTab parts={parts} wires={wires} outputNode={outputNode} />,
  },
  {
    key: "impedance",
    label: "임피던스",
    helpText: "이 회로가 앞단(픽업이나 이전 페달)에 얼마나 무거운 부하인지 보여줍니다. 값이 낮으면 앞단의 음량과 톤을 함께 끌어내립니다.",
    content: <ImpedancePanel graph={graph} />,
  },
  {
    key: "thd",
    label: "THD",
    helpText: "총고조파왜곡(THD): 원래 신호에 없던 배음이 얼마나 섞여 나오는지 - 숫자가 클수록 더 찌그러진(드라이브가 강한) 소리입니다.",
    content: <ThdPanel {...analysis.thd} />,
  },
  {
    key: "montecarlo",
    label: "부품 공차",
    helpText: "실제 부품은 표시값과 오차가 있습니다(예: 저항 5%). 이 오차 범위 안에서 소리가 얼마나 달라질 수 있는지 시뮬레이션합니다.",
    content: <MonteCarloPanel {...analysis.monteCarlo} />,
  },
  {
    key: "chain",
    label: "페달 체인",
    helpText: "지금 만든 회로를 다른 프리셋과 직렬로 연결했을 때(예: 부스트 → 오버드라이브) 결과를 시뮬레이션합니다.",
    content: <ChainPanel {...analysis.chain} />,
  },
  {
    key: "bom",
    label: "BOM",
    helpText: "부품 목록(Bill of Materials): 이 회로를 실제로 만들 때 구매해야 할 부품과 값을 정리해줍니다.",
    content: <BomPanel parts={parts} graph={graph} />,
  },
  {
    key: "pcb",
    label: "PCB",
    helpText: "실제 기판으로 만들기: 풋프린트가 지정된 KiCad 넷리스트, 역검증되는 스트립보드 레이아웃, 자동 배치·배선 PCB(.kicad_pcb, 1:1 인쇄).",
    content: (
      <>
        <PcbExportPanel parts={parts} graph={graph} outputNode={outputNode} />
        <StripboardPanel parts={parts} graph={graph} outputNode={outputNode} />
        <PcbLayoutPanel parts={parts} graph={graph} outputNode={outputNode} />
      </>
    ),
  },
  ];
}
