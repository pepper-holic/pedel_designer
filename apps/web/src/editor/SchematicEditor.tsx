import { useEffect, useMemo, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import type { TerminalRef } from "./types";
import { netlistFromGraph } from "./netlistFromGraph";
import { graphFromNetlist, findEquivalentNode } from "./graphFromNetlist";
import { snapToGrid, rotateClockwise } from "./geometry";
import { SchematicCanvas } from "./SchematicCanvas";
import { PartPalette } from "./PartPalette";
import { InspectorPanel } from "./InspectorPanel";
import { OutputAudioPanel } from "./OutputAudioPanel";
import { AnalysisPanels } from "./AnalysisPanels";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { presets, type PedalPreset } from "../core/library/presets";
import { DIODE_MODELS } from "../core/library/deviceModels";
import { PARAM_META } from "./paramMeta";
import { loadSampleFromFile, type LoadedSample } from "../audio/loadSample";
import { playSamples } from "../audio/playback";
import { CABINET_VARIANTS, type CabinetVariant } from "../audio/cabinetIr";
import { runTransient } from "../core/solver/transient";
import { runAcAnalysis, logFrequencySweep, type AcPoint } from "../core/solver/ac";
import { Waveform, type WaveformTrace } from "../viz/Waveform";
import { FrequencyResponse } from "../viz/FrequencyResponse";
import { canRedo, canUndo, commitPrevious, createHistory, pushSnapshot, redo, replacePresent, undo, type CircuitSnapshot } from "./historyStack";
import { loadCircuitFromStorage, saveCircuitToStorage } from "./circuitStorage";

let partCounter = 0;
const AUTOSAVE_DEBOUNCE_MS = 400;

type LeftTab = "parts" | "templates";

function loadInitialState(): { snapshot: CircuitSnapshot; outputNode: string; inputGain: number } {
  const stored = loadCircuitFromStorage(localStorage);
  if (!stored) return { snapshot: { parts: [], wires: [] }, outputNode: "", inputGain: 0.5 };
  return { snapshot: { parts: stored.parts, wires: stored.wires }, outputNode: stored.outputNode, inputGain: stored.inputGain };
}

export function SchematicEditor() {
  const initial = useMemo(loadInitialState, []);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  const [history, setHistory] = useState(() => createHistory(initial.snapshot));
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [outputNode, setOutputNode] = useState<string>(initial.outputNode);
  const [inputGain, setInputGain] = useState(initial.inputGain);
  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [status, setStatus] = useState("");
  const [waveTraces, setWaveTraces] = useState<WaveformTrace[] | null>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [circuitVersion, setCircuitVersion] = useState(0);
  const [cabinetEnabled, setCabinetEnabled] = useState(false);
  const [cabinetVariant, setCabinetVariant] = useState<CabinetVariant>("brightCab4x12");
  const audioContextRef = useRef<AudioContext | null>(null);
  const dragStartSnapshotRef = useRef<CircuitSnapshot | null>(null);

  const parts = history.present.parts;
  const wires = history.present.wires;

  const getAudioContext = () => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  };

  const graph = useMemo(() => netlistFromGraph(parts, wires), [parts, wires]);
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;

  const canvasSize = useMemo(() => {
    const margin = 120;
    const maxX = parts.reduce((max, p) => Math.max(max, p.x), 0);
    const maxY = parts.reduce((max, p) => Math.max(max, p.y), 0);
    return { width: Math.max(900, maxX + margin), height: Math.max(460, maxY + margin) };
  }, [parts]);

  type AcStatus = "no-output" | "no-source" | "error" | "ok";
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
      saveCircuitToStorage(localStorage, { parts, wires, outputNode, inputGain });
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [parts, wires, outputNode, inputGain]);

  const commit = (next: CircuitSnapshot) => setHistory((h) => pushSnapshot(h, next));

  const handleUndo = () => setHistory((h) => undo(h));
  const handleRedo = () => setHistory((h) => redo(h));

  const handleNewCircuit = () => {
    if (parts.length > 0 && !window.confirm("현재 회로를 지우고 새로 시작할까요? 저장되지 않은 작업은 undo(Ctrl+Z)로만 복구할 수 있습니다.")) return;
    commit({ parts: [], wires: [] });
    setSelectedPartId(null);
    setLoadedPresetId(null);
    setOutputNode("");
    setWaveTraces(null);
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus("새 회로");
  };

  const handleLoadTemplate = (preset: PedalPreset) => {
    const originalNetlist = preset.build(preset.defaultParams);
    const { parts: newParts, wires: newWires } = graphFromNetlist(originalNetlist, preset.inputSourceId, preset.layout);
    const roundTripped = netlistFromGraph(newParts, newWires);
    const equivalentOutput = findEquivalentNode(originalNetlist, preset.outputNode, roundTripped.netlist);

    commit({ parts: newParts, wires: newWires });
    setSelectedPartId(null);
    setLoadedPresetId(preset.id);
    setOutputNode(equivalentOutput ?? "");
    setWaveTraces(null);
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus(`템플릿 로드됨: ${preset.name}`);
  };

  const handleAddPart = (type: PartType) => {
    partCounter += 1;
    const id = `${type}${partCounter}`;
    const col = partCounter % 6;
    const row = Math.floor(partCounter / 6);
    commit({
      parts: [
        ...parts,
        { id, type, x: snapToGrid(80 + col * 130), y: snapToGrid(80 + row * 100), rotation: 0, params: { ...PART_DEFS[type].defaultParams } },
      ],
      wires,
    });
  };

  const handleMovePart = (id: string, x: number, y: number) => {
    if (dragStartSnapshotRef.current === null) dragStartSnapshotRef.current = history.present;
    setHistory((h) => replacePresent(h, { parts: parts.map((p) => (p.id === id ? { ...p, x: snapToGrid(x), y: snapToGrid(y) } : p)), wires }));
  };

  const handleDragEnd = () => {
    const preDrag = dragStartSnapshotRef.current;
    dragStartSnapshotRef.current = null;
    if (preDrag) setHistory((h) => commitPrevious(h, preDrag));
  };

  const handleAddWire = (a: TerminalRef, b: TerminalRef) => {
    commit({ parts, wires: [...wires, { id: `w${wires.length + 1}_${Date.now()}`, a, b }] });
  };

  const handleDeleteSelected = () => {
    if (!selectedPartId) return;
    commit({
      parts: parts.filter((p) => p.id !== selectedPartId),
      wires: wires.filter((w) => w.a.partId !== selectedPartId && w.b.partId !== selectedPartId),
    });
    setSelectedPartId(null);
  };

  const handleRotateSelected = () => {
    if (!selectedPartId) return;
    commit({ parts: parts.map((p) => (p.id === selectedPartId ? { ...p, rotation: rotateClockwise(p.rotation) } : p)), wires });
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
  }, [selectedPartId, parts, wires]);

  const handleParamChange = (key: string, value: string) => {
    if (!selectedPart) return;
    const parsed = Number(value);
    const meta = PARAM_META[key];
    const nextValue = Number.isFinite(parsed) && value.trim() !== "" ? (meta?.min !== undefined ? Math.max(parsed, meta.min) : parsed) : value;
    commit({ parts: parts.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, [key]: nextValue } } : p)), wires });
  };

  const handleApplyDiodeModel = (modelKey: string) => {
    if (!selectedPart) return;
    const model = DIODE_MODELS[modelKey];
    if (!model) return;
    commit({ parts: parts.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, ...model.params } } : p)), wires });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("샘플 디코딩 중...");
    const loaded = await loadSampleFromFile(file, getAudioContext());
    setSample(loaded);
    setStatus(`샘플 로드 완료 (${loaded.samples.length}개 샘플, ${loaded.sampleRate}Hz)`);
  };

  const handleRun = () => {
    if (!sample || !graph.inputSourceId) return;
    setStatus("시뮬레이션 실행 중...");
    const scaled = new Float64Array(sample.samples.length);
    for (let i = 0; i < scaled.length; i++) scaled[i] = sample.samples[i] * inputGain;
    const { traces } = runTransient(graph.netlist, {
      inputSourceId: graph.inputSourceId,
      inputSamples: scaled,
      sampleRate: sample.sampleRate,
      tapNodes: graph.netNames.filter((n) => n !== "0"),
    });
    setWaveTraces(
      Array.from(traces.entries()).map(([label, data], i) => ({
        label,
        data,
        color: ["#3c6b2e", "#7c9300", "#8a4a2a", "#191a10"][i % 4],
      })),
    );
    setStatus("시뮬레이션 완료");
  };

  const handlePlay = (label: string) => {
    if (!waveTraces || !sample) return;
    const trace = waveTraces.find((t) => t.label === label);
    if (!trace) return;
    playSamples(trace.data, sample.sampleRate, getAudioContext(), cabinetEnabled ? cabinetVariant : null);
  };

  return (
    <div>
      <div className="panel">
        <div className="dock-tab-row">
          <button type="button" className={leftTab === "parts" ? "dock-tab active" : "dock-tab"} onClick={() => setLeftTab("parts")}>
            소자 팔레트
          </button>
          <button type="button" className={leftTab === "templates" ? "dock-tab active" : "dock-tab"} onClick={() => setLeftTab("templates")}>
            템플릿
          </button>
          <button type="button" className="dock-tab" onClick={handleUndo} disabled={!canUndo(history)} title="실행 취소 (Ctrl+Z)">
            ↶ 실행 취소
          </button>
          <button type="button" className="dock-tab" onClick={handleRedo} disabled={!canRedo(history)} title="다시 실행 (Ctrl+Shift+Z)">
            ↷ 다시 실행
          </button>
          <button
            type="button"
            className="dock-tab"
            style={{ marginLeft: "auto" }}
            onClick={handleNewCircuit}
            disabled={parts.length === 0}
            title="캔버스를 비우고 처음부터 다시 시작합니다"
          >
            새 회로
          </button>
        </div>

        {leftTab === "parts" && <PartPalette onAdd={handleAddPart} />}

        {leftTab === "templates" && (
          <div className="template-list">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === loadedPresetId ? "template-card active" : "template-card"}
                onClick={() => handleLoadTemplate(preset)}
              >
                <span className="template-name">{preset.name}</span>
                <span className="template-desc">{preset.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="layout-grid" style={{ marginTop: 16 }}>
        <div>
          <InspectorPanel
            selectedPart={selectedPart}
            onParamChange={handleParamChange}
            onApplyDiodeModel={handleApplyDiodeModel}
            onRotate={handleRotateSelected}
            onDelete={handleDeleteSelected}
          />

          <OutputAudioPanel
            outputNode={outputNode}
            onOutputNodeChange={setOutputNode}
            netNames={graph.netNames}
            inputGain={inputGain}
            onInputGainChange={setInputGain}
            hasSample={sample !== null}
            onFileChange={handleFileChange}
            canRun={sample !== null && !!graph.inputSourceId}
            onRun={handleRun}
            status={status}
          />
        </div>

        <div>
          <div className="panel">
            <div className="panel-title">회로도</div>
            {parts.length === 0 ? (
              <p className="preset-description">
                회로가 비어 있습니다. 왼쪽 "소자 팔레트"에서 부품을 추가하거나, "템플릿" 탭에서 예제 회로를 불러와 시작하세요.
              </p>
            ) : (
              <p className="canvas-hint">R: 회전 · Delete: 삭제 · 휠: 확대/축소 · 빈 배경 드래그: 화면 이동 · 부품 드래그: 이동 · 단자 클릭 2회: 배선</p>
            )}
            <div className="canvas-frame canvas-frame-scroll">
              <SchematicCanvas
                parts={parts}
                wires={wires}
                width={canvasSize.width}
                height={canvasSize.height}
                selectedPartId={selectedPartId}
                onMovePart={handleMovePart}
                onSelectPart={setSelectedPartId}
                onAddWire={handleAddWire}
                onDragEnd={handleDragEnd}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">주파수 응답{outputNode && ` (input → ${outputNode})`}</div>
            <div className="canvas-frame">
              {acResult.status === "no-output" ? (
                <p className="preset-description" style={{ padding: 16 }}>
                  출력 노드를 선택하면 여기에 실시간으로 표시됩니다.
                </p>
              ) : acResult.status === "no-source" ? (
                <p className="preset-description" style={{ padding: 16 }}>
                  회로에 입력 전압원이 없습니다. 전압원(입력) 소자를 추가하고 배선하세요.
                </p>
              ) : acResult.status === "error" ? (
                <p className="preset-description" style={{ padding: 16, color: "#c0392b" }}>
                  ⚠ 계산 실패: 회로 구성을 확인하세요 (플로팅 노드, 닫히지 않은 루프 등). {acResult.error}
                </p>
              ) : (
                <FrequencyResponse points={acPoints} band={monteCarloResult ?? undefined} />
              )}
            </div>
          </div>

          <AnalysisPanels
            key={circuitVersion}
            graph={graph}
            outputNode={outputNode}
            sample={sample}
            inputGain={inputGain}
            getAudioContext={getAudioContext}
            cabinetEnabled={cabinetEnabled}
            cabinetVariant={cabinetVariant}
            onMonteCarloResultChange={setMonteCarloResult}
          />

          {waveTraces && (
            <div className="panel">
              <div className="panel-title">파형</div>
              <div className="canvas-frame">
                <Waveform traces={waveTraces} />
              </div>
              <div className="tap-buttons">
                {waveTraces.map((t) => (
                  <button key={t.label} type="button" onClick={() => handlePlay(t.label)}>
                    ▶ {t.label}
                  </button>
                ))}
              </div>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label>
                  <input type="checkbox" checked={cabinetEnabled} onChange={(e) => setCabinetEnabled(e.target.checked)} /> IR 적용 (제네릭 캐비닛 시뮬레이션)
                </label>
                <select
                  value={cabinetVariant}
                  onChange={(e) => setCabinetVariant(e.target.value as CabinetVariant)}
                  disabled={!cabinetEnabled}
                  style={{ maxWidth: 220 }}
                >
                  {Object.entries(CABINET_VARIANTS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
