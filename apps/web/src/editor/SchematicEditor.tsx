import { useEffect, useMemo, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import type { TerminalRef } from "./types";
import { netlistFromGraph } from "./netlistFromGraph";
import { graphFromNetlist, findEquivalentNode } from "./graphFromNetlist";
import { snapToGrid, rotateClockwise } from "./geometry";
import type { BlockDef } from "./blockDefs";
import { instantiateBlock } from "./blockInstance";
import { SchematicCanvas } from "./SchematicCanvas";
import { PartsSidebar } from "./PartsSidebar";
import { InspectorPanel } from "./InspectorPanel";
import { OutputAudioPanel } from "./OutputAudioPanel";
import { BottomDock } from "./BottomDock";
import { FrequencyResponseTab, type AcStatus } from "./FrequencyResponseTab";
import { WaveformTab } from "./WaveformTab";
import { ThdPanel } from "./ThdPanel";
import { MonteCarloPanel } from "./MonteCarloPanel";
import { ChainPanel } from "./ChainPanel";
import { BomPanel } from "./BomPanel";
import { PcbExportPanel } from "./PcbExportPanel";
import { useAnalysisPanels } from "./useAnalysisPanels";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { presets, type PedalPreset, type PresetVariant } from "../core/library/presets";
import { wiringPresets, type WiringPreset } from "./wiring";
import { PARAM_META } from "./paramMeta";
import { loadSampleFromFile, type LoadedSample } from "../audio/loadSample";
import { playSamples } from "../audio/playback";
import { type CabinetVariant } from "../audio/cabinetIr";
import { runTransientAsync } from "../core/solver/runTransientAsync";
import { runAcAnalysis, logFrequencySweep, type AcPoint } from "../core/solver/ac";
import { type WaveformTrace } from "../viz/Waveform";
import { canRedo, canUndo, commitPrevious, createHistory, pushSnapshot, redo, replacePresent, undo, type CircuitSnapshot } from "./historyStack";
import { loadCircuitFromStorage, saveCircuitToStorage, CURRENT_SCHEMA_VERSION } from "./circuitStorage";

let partCounter = 0;
let blockCounter = 0;
const AUTOSAVE_DEBOUNCE_MS = 400;

type LeftTab = "parts" | "library";

function loadInitialState(): { snapshot: CircuitSnapshot; outputNode: string; inputGain: number } {
  const stored = loadCircuitFromStorage(localStorage);
  if (!stored) return { snapshot: { parts: [], wires: [], blocks: [] }, outputNode: "", inputGain: 0.5 };
  return { snapshot: { parts: stored.parts, wires: stored.wires, blocks: stored.blocks }, outputNode: stored.outputNode, inputGain: stored.inputGain };
}

export function SchematicEditor() {
  const initial = useMemo(loadInitialState, []);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  const [history, setHistory] = useState(() => createHistory(initial.snapshot));
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  // Parts and wires share one logical selection - selecting either clears the other, so Delete and
  // the inspector always act on exactly one thing.
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [outputNode, setOutputNode] = useState<string>(initial.outputNode);
  const [inputGain, setInputGain] = useState(initial.inputGain);
  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [status, setStatus] = useState("");
  const [waveTraces, setWaveTraces] = useState<WaveformTrace[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [circuitVersion, setCircuitVersion] = useState(0);
  const [cabinetEnabled, setCabinetEnabled] = useState(false);
  const [cabinetVariant, setCabinetVariant] = useState<CabinetVariant>("brightCab4x12");
  const audioContextRef = useRef<AudioContext | null>(null);
  const dragStartSnapshotRef = useRef<CircuitSnapshot | null>(null);

  const parts = history.present.parts;
  const wires = history.present.wires;
  const blocks = history.present.blocks;

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  };

  const graph = useMemo(() => netlistFromGraph(parts, wires), [parts, wires]);
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;
  const selectedWire = wires.find((w) => w.id === selectedWireId) ?? null;

  const handleSelectPart = (id: string | null) => {
    setSelectedPartId(id);
    setSelectedWireId(null);
  };

  const handleSelectWire = (id: string | null) => {
    setSelectedWireId(id);
    setSelectedPartId(null);
  };

  const canvasSize = useMemo(() => {
    const margin = 120;
    const maxX = parts.reduce((max, p) => Math.max(max, p.x), 0);
    const maxY = parts.reduce((max, p) => Math.max(max, p.y), 0);
    return { width: Math.max(900, maxX + margin), height: Math.max(460, maxY + margin) };
  }, [parts]);

  const acResult = useMemo((): { points: AcPoint[]; status: AcStatus; error: string | null } => {
    if (!outputNode) return { points: [], status: "no-output", error: null };
    if (!graph.inputSourceId || graph.netlist.elements.length === 0) return { points: [], status: "no-source", error: null };
    try {
      return {
        points: runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId, outputNode, frequenciesHz: logFrequencySweep(20, 20000, 40) }),
        status: "ok",
        error: null,
      };
    } catch (err) {
      return { points: [], status: "error", error: err instanceof Error ? err.message : "알 수 없는 오류" };
    }
  }, [graph, outputNode]);
  const acPoints = acResult.points;

  useEffect(() => {
    const timer = setTimeout(() => {
      saveCircuitToStorage(localStorage, { schemaVersion: CURRENT_SCHEMA_VERSION, parts, wires, blocks, outputNode, inputGain });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [parts, wires, blocks, outputNode, inputGain]);

  const commit = (next: CircuitSnapshot) => setHistory((h) => pushSnapshot(h, next));

  const handleUndo = () => setHistory((h) => undo(h));
  const handleRedo = () => setHistory((h) => redo(h));

  const handleNewCircuit = () => {
    if (parts.length > 0 && !window.confirm("현재 회로를 지우고 새로 시작할까요? 저장되지 않은 작업은 undo(Ctrl+Z)로만 복구할 수 있습니다.")) return;
    commit({ parts: [], wires: [], blocks: [] });
    setSelectedPartId(null);
    setSelectedWireId(null);
    setLoadedPresetId(null);
    setOutputNode("");
    setWaveTraces(null);
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus("새 회로");
  };

  const handleLoadTemplate = (preset: PedalPreset, variant?: PresetVariant) => {
    // Variant params override the defaults, which is what makes a preset's non-default topology
    // branch (King of Tone's clipMode, OCD's brightSwitch) reachable at all.
    const originalNetlist = preset.build({ ...preset.defaultParams, ...(variant?.params ?? {}) });
    const { parts: newParts, wires: newWires } = graphFromNetlist(originalNetlist, preset.inputSourceId, preset.layout);
    const roundTripped = netlistFromGraph(newParts, newWires);
    const equivalentOutput = findEquivalentNode(originalNetlist, preset.outputNode, roundTripped.netlist);

    commit({ parts: newParts, wires: newWires, blocks: [] });
    setSelectedPartId(null);
    setSelectedWireId(null);
    setLoadedPresetId(preset.id);
    setOutputNode(equivalentOutput ?? "");
    setWaveTraces(null);
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus(`템플릿 로드됨: ${preset.name}${variant ? ` - ${variant.label}` : ""}`);
  };

  /** Wiring presets are stored as a part-level snapshot (see wiring/types.ts), so loading one is
   * just a commit - no netlist round-trip, and composite parts (pickup, pots) stay composite.
   * The arrays are module-level constants, so they are copied before entering the undo stack. */
  const handleLoadWiring = (preset: WiringPreset) => {
    const newParts = preset.snapshot.parts.map((p) => ({ ...p, params: { ...p.params } }));
    const newWires = preset.snapshot.wires.map((w) => ({ ...w, a: { ...w.a }, b: { ...w.b } }));
    const outputKey = `${preset.outputTerminal.partId}:${preset.outputTerminal.terminalId}`;

    commit({ parts: newParts, wires: newWires, blocks: [...preset.snapshot.blocks] });
    setSelectedPartId(null);
    setSelectedWireId(null);
    setLoadedPresetId(preset.id);
    setOutputNode(netlistFromGraph(newParts, newWires).terminalNet.get(outputKey) ?? "");
    setWaveTraces(null);
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus(`배선 로드됨: ${preset.name}`);
  };

  const handleAddPart = (type: PartType, paramsOverride?: Record<string, number | string>) => {
    partCounter += 1;
    const id = `${type}${partCounter}`;
    const col = partCounter % 6;
    const row = Math.floor(partCounter / 6);
    commit({
      parts: [
        ...parts,
        {
          id,
          type,
          x: snapToGrid(80 + col * 130),
          y: snapToGrid(80 + row * 100),
          rotation: 0,
          params: { ...PART_DEFS[type].defaultParams, ...paramsOverride },
        },
      ],
      wires,
      blocks,
    });
  };

  const handleAddBlock = (def: BlockDef) => {
    blockCounter += 1;
    const instanceId = `blk${blockCounter}`;
    const col = (blockCounter - 1) % 3;
    const row = Math.floor((blockCounter - 1) / 3);
    const { parts: blockParts, wires: blockWires, block } = instantiateBlock(def, instanceId, { x: 100 + col * 420, y: 100 + row * 260 });
    commit({ parts: [...parts, ...blockParts], wires: [...wires, ...blockWires], blocks: [...blocks, block] });
  };

  const handleMovePart = (id: string, x: number, y: number) => {
    if (dragStartSnapshotRef.current === null) dragStartSnapshotRef.current = history.present;
    setHistory((h) => replacePresent(h, { parts: parts.map((p) => (p.id === id ? { ...p, x: snapToGrid(x), y: snapToGrid(y) } : p)), wires, blocks }));
  };

  const handleDragEnd = () => {
    const preDrag = dragStartSnapshotRef.current;
    dragStartSnapshotRef.current = null;
    if (preDrag) setHistory((h) => commitPrevious(h, preDrag));
  };

  const handleAddWire = (a: TerminalRef, b: TerminalRef) => {
    commit({ parts, wires: [...wires, { id: `w${wires.length + 1}_${Date.now()}`, a, b }], blocks });
  };

  const handleDeleteSelected = () => {
    if (selectedWireId) {
      commit({ parts, wires: wires.filter((w) => w.id !== selectedWireId), blocks });
      setSelectedWireId(null);
      return;
    }
    if (!selectedPartId) return;
    const nextParts = parts.filter((p) => p.id !== selectedPartId);
    const remainingBlockIds = new Set(nextParts.map((p) => p.blockId).filter((id): id is string => id !== undefined));
    commit({
      parts: nextParts,
      wires: wires.filter((w) => w.a.partId !== selectedPartId && w.b.partId !== selectedPartId),
      blocks: blocks.filter((b) => remainingBlockIds.has(b.id)),
    });
    setSelectedPartId(null);
  };

  const handleDeleteBlock = (blockId: string) => {
    commit({
      parts: parts.filter((p) => p.blockId !== blockId),
      wires: wires.filter((w) => w.a.partId.split("_")[0] !== blockId || w.b.partId.split("_")[0] !== blockId),
      blocks: blocks.filter((b) => b.id !== blockId),
    });
    setSelectedPartId(null);
  };

  const handleRotateSelected = () => {
    if (!selectedPartId) return;
    commit({ parts: parts.map((p) => (p.id === selectedPartId ? { ...p, rotation: rotateClockwise(p.rotation) } : p)), wires, blocks });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === "r" || e.key === "R") handleRotateSelected();
      if (e.key === "Delete" || e.key === "Backspace") handleDeleteSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartId, selectedWireId, parts, wires]);

  const handleParamChange = (key: string, value: string) => {
    if (!selectedPart) return;
    const parsed = Number(value);
    const meta = PARAM_META[key];
    const nextValue = Number.isFinite(parsed) && value.trim() !== "" ? (meta?.min !== undefined ? Math.max(parsed, meta.min) : parsed) : value;
    commit({ parts: parts.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, [key]: nextValue } } : p)), wires, blocks });
  };

  const handleApplyModel = (paramsOverride: Record<string, number | string>) => {
    if (!selectedPart) return;
    commit({ parts: parts.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, ...paramsOverride } } : p)), wires, blocks });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("샘플 디코딩 중...");
    const loaded = await loadSampleFromFile(file, getAudioContext());
    setSample(loaded);
    setStatus(`샘플 로드 완료 (${loaded.samples.length}개 샘플, ${loaded.sampleRate}Hz)`);
  };

  const handleRun = async () => {
    if (!sample || !graph.inputSourceId) return;
    setIsSimulating(true);
    setStatus("시뮬레이션 실행 중...");
    const scaled = new Float64Array(sample.samples.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = sample.samples[i] * inputGain;
    try {
      // Run off the main thread - a long user-uploaded file is enough per-sample Newton solving to
      // freeze the page if run inline (docs/ROADMAP.md §6).
      const { traces, nonConvergentSampleCount } = await runTransientAsync(graph.netlist, {
        inputSourceId: graph.inputSourceId,
        inputSamples: scaled,
        sampleRate: sample.sampleRate,
        tapNodes: graph.netNames.filter((n) => n !== "0"),
        // Resolves fast clipping knees (germanium diodes etc.) that a single 44.1/48kHz sample
        // period would otherwise alias away (docs/ROADMAP.md §6 risk 2). THD/Monte Carlo/chain use
        // short synthesized tones and stay at the default (no oversampling) - not worth the 4x cost.
        oversample: 4,
      });
      setWaveTraces(
        Array.from(traces.entries()).map(([label, data], i) => ({
          label,
          data,
          color: ["#3c6b2e", "#7c9300", "#8a4a2a", "#191a10"][i % 4],
        })),
      );
      // A stiff/badly-conditioned circuit (e.g. a tight feedback loop through two diodes) can fail to
      // converge on some samples - the solver falls back to its last guess rather than throwing or
      // producing NaN, so without this the user would have no way to know those samples are suspect.
      setStatus(
        nonConvergentSampleCount > 0
          ? `시뮬레이션 완료 (경고: ${nonConvergentSampleCount}개 샘플에서 수렴 실패 - 해당 구간 파형 정확도가 낮을 수 있습니다)`
          : "시뮬레이션 완료",
      );
    } catch (err) {
      setStatus(`시뮬레이션 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const handlePlay = (label: string) => {
    if (!waveTraces || !sample) return;
    const trace = waveTraces.find((t) => t.label === label);
    if (!trace) return;
    playSamples(trace.data, sample.sampleRate, getAudioContext(), cabinetEnabled ? cabinetVariant : null);
  };

  const analysis = useAnalysisPanels({
    graph,
    outputNode,
    sample,
    inputGain,
    getAudioContext,
    cabinetEnabled,
    cabinetVariant,
    onMonteCarloResultChange: setMonteCarloResult,
  });

  const dockTabs = [
    {
      key: "response",
      label: `주파수 응답${outputNode ? ` (→ ${outputNode})` : ""}`,
      helpText: "이 회로가 저음/고음을 얼마나 통과시키거나 깎는지 주파수별로 보여줍니다.",
      content: <FrequencyResponseTab status={acResult.status} error={acResult.error} points={acPoints} band={monteCarloResult} />,
    },
    {
      key: "waveform",
      label: "파형",
      helpText: "오디오 파일을 넣고 시뮬레이션을 실행하면 입력/출력 파형을 비교하고 소리로 들어볼 수 있습니다.",
      content: (
        <WaveformTab
          traces={waveTraces}
          onPlay={handlePlay}
          cabinetEnabled={cabinetEnabled}
          onCabinetEnabledChange={setCabinetEnabled}
          cabinetVariant={cabinetVariant}
          onCabinetVariantChange={setCabinetVariant}
        />
      ),
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
      helpText: "이 회로의 연결 정보를 KiCad에서 바로 불러올 수 있는 넷리스트 파일로 내보냅니다(기판 배치/배선은 KiCad에서 직접).",
      content: <PcbExportPanel parts={parts} graph={graph} />,
    },
  ];

  return (
    <div className="workspace-content">
      <div className="toolbar">
        <button type="button" onClick={handleUndo} disabled={!canUndo(history)} title="실행 취소 (Ctrl+Z)">
          ↶ 실행 취소
        </button>
        <button type="button" onClick={handleRedo} disabled={!canRedo(history)} title="다시 실행 (Ctrl+Shift+Z)">
          ↷ 다시 실행
        </button>
        <div className="spacer" />
        <button type="button" onClick={handleNewCircuit} disabled={parts.length === 0} title="캔버스를 비우고 처음부터 다시 시작합니다">
          새 회로
        </button>
      </div>

      <div className="workbench-body">
        <PartsSidebar
          activeTab={leftTab}
          onTabChange={setLeftTab}
          onAddPart={handleAddPart}
          onAddBlock={handleAddBlock}
          presets={presets}
          wiringPresets={wiringPresets}
          loadedPresetId={loadedPresetId}
          onLoadTemplate={handleLoadTemplate}
          onLoadWiring={handleLoadWiring}
        />

        <div className="canvas-area">
          <div className="panel canvas-stage">
            <div className="panel-title">회로도</div>
            {parts.length === 0 ? (
              <p className="preset-description">
                회로가 비어 있습니다. 왼쪽 "소자 팔레트"에서 부품을 추가하거나, "템플릿" 탭에서 예제 회로를 불러와 시작하세요.
                <span
                  className="info-tip"
                  title={
                    '처음이신가요? "템플릿/블록" 탭에서 완성된 회로를 하나 불러온 뒤, 아래 "파형" 탭에서 오디오 파일을 넣고 ' +
                    '"시뮬레이션 실행"을 눌러보세요. THD는 소리가 얼마나 찌그러지는지, 부품 공차는 실제 부품값 오차가 소리에 얼마나 ' +
                    "영향을 주는지 보여주는 분석 도구입니다."
                  }
                >
                  ⓘ
                </span>
              </p>
            ) : (
              <p className="canvas-hint">R: 회전 · Delete: 삭제 · 휠: 확대/축소 · 빈 배경 드래그: 화면 이동 · 부품 드래그: 이동 · 단자 클릭 2회: 배선 · 배선 클릭: 선택</p>
            )}
            <div className="canvas-frame canvas-frame-scroll">
              <SchematicCanvas
                parts={parts}
                wires={wires}
                blocks={blocks}
                width={canvasSize.width}
                height={canvasSize.height}
                selectedPartId={selectedPartId}
                selectedWireId={selectedWireId}
                onMovePart={handleMovePart}
                onSelectPart={handleSelectPart}
                onSelectWire={handleSelectWire}
                onAddWire={handleAddWire}
                onDragEnd={handleDragEnd}
                fitSignal={circuitVersion}
              />
            </div>
          </div>

          <BottomDock key={circuitVersion} tabs={dockTabs} />
        </div>

        <div className="sidebar-right">
          <InspectorPanel
            selectedPart={selectedPart}
            selectedWire={selectedWire}
            blocks={blocks}
            onParamChange={handleParamChange}
            onApplyModel={handleApplyModel}
            onRotate={handleRotateSelected}
            onDelete={handleDeleteSelected}
            onDeleteBlock={handleDeleteBlock}
          />

          <OutputAudioPanel
            outputNode={outputNode}
            onOutputNodeChange={setOutputNode}
            netNames={graph.netNames}
            inputGain={inputGain}
            onInputGainChange={setInputGain}
            hasSample={sample !== null}
            onFileChange={handleFileChange}
            canRun={sample !== null && !!graph.inputSourceId && !isSimulating}
            onRun={handleRun}
            status={status}
          />
        </div>
      </div>
    </div>
  );
}
