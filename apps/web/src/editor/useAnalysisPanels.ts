import { useState } from "react";
import type { GraphNetlist } from "./netlistFromGraph";
import type { LoadedSample } from "../audio/loadSample";
import type { CabinetVariant } from "../audio/cabinetIr";
import { playSamples } from "../audio/playback";
import { presets } from "../core/library/presets";
import { logFrequencySweep } from "../core/solver/ac";
import { measureThd } from "./thdMeasurement";
import type { ThdResult } from "../core/analysis/thd";
import { runMonteCarloAc, robustSpreadDb, type MonteCarloResult } from "../core/analysis/montecarlo";
import { runChainedTransient, type ChainStage } from "../core/analysis/chain";

const CURRENT_CIRCUIT_CHAIN_ID = "__current__";

interface UseAnalysisPanelsArgs {
  graph: GraphNetlist;
  outputNode: string;
  sample: LoadedSample | null;
  inputGain: number;
  getAudioContext: () => AudioContext;
  cabinetEnabled: boolean;
  cabinetVariant: CabinetVariant;
  /** Lifted up so the frequency-response chart can overlay the tolerance band. */
  onMonteCarloResultChange: (result: MonteCarloResult | null) => void;
}

/** THD measurement, component-tolerance Monte Carlo, and multi-stage pedal chaining - state and
 * handlers only, extracted so the bottom-dock tabs can render each result independently. */
export function useAnalysisPanels({
  graph,
  outputNode,
  sample,
  inputGain,
  getAudioContext,
  cabinetEnabled,
  cabinetVariant,
  onMonteCarloResultChange,
}: UseAnalysisPanelsArgs) {
  const [thdResult, setThdResult] = useState<ThdResult | null>(null);
  const [tolerancePercent, setTolerancePercent] = useState(5);
  const [monteCarloResult, setMonteCarloResultState] = useState<MonteCarloResult | null>(null);
  const [chain, setChain] = useState<string[]>([]);
  const [chainOutput, setChainOutput] = useState<Float64Array | null>(null);
  const [chainStatus, setChainStatus] = useState<string | null>(null);

  const setMonteCarloResult = (result: MonteCarloResult | null) => {
    setMonteCarloResultState(result);
    onMonteCarloResultChange(result);
  };

  const handleMeasureThd = () => {
    if (!outputNode || !graph.inputSourceId) return;
    setThdResult(measureThd(graph.netlist, graph.inputSourceId, outputNode));
  };

  const handleRunMonteCarlo = () => {
    if (!outputNode || !graph.inputSourceId) return;
    setMonteCarloResult(
      runMonteCarloAc(graph.netlist, graph.inputSourceId, outputNode, {
        tolerancePercent,
        iterations: 20,
        frequenciesHz: logFrequencySweep(20, 20000, 40),
      }),
    );
  };

  const chainOptions = [{ id: CURRENT_CIRCUIT_CHAIN_ID, name: "현재 회로 (캔버스)" }, ...presets.map((p) => ({ id: p.id, name: p.name }))];

  const handleAddChainStage = (id: string) => setChain((prev) => [...prev, id]);
  const handleRemoveChainStage = (index: number) => setChain((prev) => prev.filter((_, i) => i !== index));
  const handleMoveChainStage = (index: number, direction: -1 | 1) => {
    setChain((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const buildChainStage = (id: string): ChainStage | null => {
    if (id === CURRENT_CIRCUIT_CHAIN_ID) {
      if (!outputNode || !graph.inputSourceId) return null;
      return { netlist: graph.netlist, inputSourceId: graph.inputSourceId, outputNode };
    }
    const preset = presets.find((p) => p.id === id);
    if (!preset) return null;
    return { netlist: preset.build(preset.defaultParams), inputSourceId: preset.inputSourceId, outputNode: preset.outputNode };
  };

  const handleRunChain = () => {
    if (!sample || chain.length === 0) return;
    const stages = chain.map(buildChainStage);
    const missingIndex = stages.findIndex((s) => s === null);
    if (missingIndex >= 0) {
      setChainStatus(`${missingIndex + 1}번 스테이지를 구성할 수 없습니다 (현재 회로라면 출력 노드를 먼저 선택하세요).`);
      return;
    }
    const scaled = new Float64Array(sample.samples.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = sample.samples[i] * inputGain;
    const output = runChainedTransient(stages as ChainStage[], scaled, sample.sampleRate);
    setChainOutput(output);
    setChainStatus(`체인 ${chain.length}단 시뮬레이션 완료`);
  };

  const handlePlayChain = () => {
    if (!chainOutput || !sample) return;
    playSamples(chainOutput, sample.sampleRate, getAudioContext(), cabinetEnabled ? cabinetVariant : null, { post: chainOutput });
  };

  return {
    thd: { canMeasure: !!outputNode && !!graph.inputSourceId, result: thdResult, onMeasure: handleMeasureThd },
    monteCarlo: {
      canRun: !!outputNode && !!graph.inputSourceId,
      tolerancePercent,
      onTolerancePercentChange: setTolerancePercent,
      worstCaseSpreadDb: monteCarloResult ? robustSpreadDb(monteCarloResult) : null,
      onRun: handleRunMonteCarlo,
    },
    chain: {
      options: chainOptions,
      chain,
      onAddStage: handleAddChainStage,
      onRemoveStage: handleRemoveChainStage,
      onMoveStage: handleMoveChainStage,
      canRun: !!sample && chain.length > 0,
      onRun: handleRunChain,
      status: chainStatus,
      hasResult: chainOutput !== null,
      onPlayResult: handlePlayChain,
    },
  };
}
