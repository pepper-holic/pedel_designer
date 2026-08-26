import { useEffect, useMemo, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import type { PartInstance, TerminalRef, Wire } from "./types";
import { netlistFromGraph } from "./netlistFromGraph";
import { graphFromNetlist, findEquivalentNode } from "./graphFromNetlist";
import { snapToGrid, rotateClockwise } from "./geometry";
import { SchematicCanvas } from "./SchematicCanvas";
import { PartPalette } from "./PartPalette";
import { presets, type PedalPreset } from "../core/library/presets";
import { DIODE_MODELS } from "../core/library/deviceModels";
import { TAPER_OPTIONS } from "./taper";
import { PARAM_META } from "./paramMeta";
import { loadSampleFromFile, type LoadedSample } from "../audio/loadSample";
import { playSamples } from "../audio/playback";
import { runTransient } from "../core/solver/transient";
import { runAcAnalysis, logFrequencySweep } from "../core/solver/ac";
import { Waveform, type WaveformTrace } from "../viz/Waveform";
import { FrequencyResponse } from "../viz/FrequencyResponse";

let partCounter = 0;

type LeftTab = "parts" | "templates";

export function SchematicEditor() {
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  const [parts, setParts] = useState<PartInstance[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [outputNode, setOutputNode] = useState<string>("");
  const [inputGain, setInputGain] = useState(0.5);
  const [sample, setSample] = useState<LoadedSample | null>(null);
  const [status, setStatus] = useState("");
  const [waveTraces, setWaveTraces] = useState<WaveformTrace[] | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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

  const acPoints = useMemo(() => {
    if (!graph.inputSourceId || !outputNode || graph.netlist.elements.length === 0) return [];
    try {
      return runAcAnalysis(graph.netlist, { inputSourceId: graph.inputSourceId, outputNode, frequenciesHz: logFrequencySweep(20, 20000, 40) });
    } catch {
      return [];
    }
  }, [graph, outputNode]);

  const handleLoadTemplate = (preset: PedalPreset) => {
    const originalNetlist = preset.build(preset.defaultParams);
    const { parts: newParts, wires: newWires } = graphFromNetlist(originalNetlist, preset.inputSourceId);
    const roundTripped = netlistFromGraph(newParts, newWires);
    const equivalentOutput = findEquivalentNode(originalNetlist, preset.outputNode, roundTripped.netlist);

    setParts(newParts);
    setWires(newWires);
    setSelectedPartId(null);
    setLoadedPresetId(preset.id);
    setOutputNode(equivalentOutput ?? "");
    setWaveTraces(null);
    setStatus(`템플릿 로드됨: ${preset.name}`);
  };

  const handleAddPart = (type: PartType) => {
    partCounter += 1;
    const id = `${type}${partCounter}`;
    const col = partCounter % 6;
    const row = Math.floor(partCounter / 6);
    setParts((prev) => [
      ...prev,
      { id, type, x: snapToGrid(80 + col * 130), y: snapToGrid(80 + row * 100), rotation: 0, params: { ...PART_DEFS[type].defaultParams } },
    ]);
  };

  const handleMovePart = (id: string, x: number, y: number) => {
    setParts((prev) => prev.map((p) => (p.id === id ? { ...p, x: snapToGrid(x), y: snapToGrid(y) } : p)));
  };

  const handleAddWire = (a: TerminalRef, b: TerminalRef) => {
    setWires((prev) => [...prev, { id: `w${prev.length + 1}_${Date.now()}`, a, b }]);
  };

  const handleDeleteSelected = () => {
    if (!selectedPartId) return;
    setParts((prev) => prev.filter((p) => p.id !== selectedPartId));
    setWires((prev) => prev.filter((w) => w.a.partId !== selectedPartId && w.b.partId !== selectedPartId));
    setSelectedPartId(null);
  };

  const handleRotateSelected = () => {
    if (!selectedPartId) return;
    setParts((prev) => prev.map((p) => (p.id === selectedPartId ? { ...p, rotation: rotateClockwise(p.rotation) } : p)));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") handleRotateSelected();
      if (e.key === "Delete" || e.key === "Backspace") handleDeleteSelected();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPartId]);

  const handleParamChange = (key: string, value: string) => {
    if (!selectedPart) return;
    const parsed = Number(value);
    const meta = PARAM_META[key];
    const nextValue = Number.isFinite(parsed) && value.trim() !== "" ? (meta?.min !== undefined ? Math.max(parsed, meta.min) : parsed) : value;
    setParts((prev) => prev.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, [key]: nextValue } } : p)));
  };

  const handleApplyDiodeModel = (modelKey: string) => {
    if (!selectedPart) return;
    const model = DIODE_MODELS[modelKey];
    if (!model) return;
    setParts((prev) => prev.map((p) => (p.id === selectedPart.id ? { ...p, params: { ...p.params, ...model.params } } : p)));
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
    playSamples(trace.data, sample.sampleRate, getAudioContext());
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
          <div className="panel">
            <div className="panel-title">선택된 소자</div>
            {selectedPart ? (
              <>
                <p className="preset-description">
                  {PART_DEFS[selectedPart.type].label} ({selectedPart.id})
                </p>
                {selectedPart.type === "diode" && (
                  <div className="field">
                    <div className="field-row">
                      <label>소자 모델</label>
                    </div>
                    <select defaultValue="" onChange={(e) => handleApplyDiodeModel(e.target.value)} style={{ width: "100%" }}>
                      <option value="" disabled>
                        모델 선택...
                      </option>
                      {Object.entries(DIODE_MODELS).map(([key, model]) => (
                        <option key={key} value={key}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selectedPart.type === "potentiometer" && (
                  <div className="field">
                    <div className="field-row">
                      <label>테이퍼</label>
                    </div>
                    <select
                      value={String(selectedPart.params.taper)}
                      onChange={(e) => handleParamChange("taper", e.target.value)}
                      style={{ width: "100%" }}
                    >
                      {Object.entries(TAPER_OPTIONS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {Object.entries(selectedPart.params)
                  .filter(([key]) => !(selectedPart.type === "potentiometer" && key === "taper"))
                  .map(([key, value]) => {
                    const meta = PARAM_META[key];
                    const isInvalid = typeof value === "number" && meta?.min !== undefined && value < meta.min;
                    return (
                      <div className="field" key={key}>
                        <div className="field-row">
                          <label>{key}</label>
                          {meta?.unit && <span className="field-value">{meta.unit}</span>}
                        </div>
                        <input
                          type="text"
                          value={String(value)}
                          onChange={(e) => handleParamChange(key, e.target.value)}
                          style={{
                            width: "100%",
                            background: "var(--bg-inset)",
                            color: "var(--text)",
                            border: `1px solid ${isInvalid ? "#c0392b" : "var(--border)"}`,
                            borderRadius: 6,
                            padding: 6,
                          }}
                        />
                      </div>
                    );
                  })}
                <div className="run-row">
                  <button type="button" onClick={handleRotateSelected}>
                    회전 (R)
                  </button>
                  <button type="button" onClick={handleDeleteSelected}>
                    삭제 (Del)
                  </button>
                </div>
              </>
            ) : (
              <p className="preset-description">캔버스에서 소자를 클릭해 선택하세요.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">출력 노드 / 오디오</div>
            <div className="field">
              <label>출력 노드</label>
              <select value={outputNode} onChange={(e) => setOutputNode(e.target.value)} style={{ width: "100%" }}>
                <option value="">선택 안 함</option>
                {graph.netNames
                  .filter((n) => n !== "0")
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <div className="field-row">
                <label>입력 게인 (V)</label>
                <span className="field-value">{inputGain.toFixed(2)}</span>
              </div>
              <input type="range" min={0.01} max={5} step={0.01} value={inputGain} onChange={(e) => setInputGain(Number(e.target.value))} />
            </div>
            <input type="file" accept="audio/*" onChange={handleFileChange} />
            <div className="run-row">
              <button type="button" className="primary" onClick={handleRun} disabled={!sample || !graph.inputSourceId}>
                시뮬레이션 실행
              </button>
            </div>
            {status && <p className="status-text">{status}</p>}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-title">회로도</div>
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
              />
            </div>
          </div>

          {outputNode && (
            <div className="panel">
              <div className="panel-title">주파수 응답 (input → {outputNode})</div>
              <div className="canvas-frame">
                <FrequencyResponse points={acPoints} />
              </div>
            </div>
          )}

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
