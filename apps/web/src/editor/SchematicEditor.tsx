import { useMemo, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import type { PartInstance, TerminalRef, Wire } from "./types";
import { cloneSelection } from "./selection";
import { netlistFromGraph } from "./netlistFromGraph";
import { loadPedalPreset, loadWiringPreset } from "./templateLoading";
import { snapToGrid, GRID_SIZE } from "./geometry";
import type { BlockDef } from "./blockDefs";
import { instantiateBlock } from "./blockInstance";
import { PartsSidebar } from "./PartsSidebar";
import { EditorToolbar } from "./EditorToolbar";
import { EditorCanvasArea } from "./EditorCanvasArea";
import { EditorSidebarRight } from "./EditorSidebarRight";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { buildDockTabs } from "./dockTabs";
import { useAnalysisPanels } from "./useAnalysisPanels";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { presets, type PedalPreset, type PresetVariant } from "../core/library/presets";
import { wiringPresets, type WiringPreset } from "./wiring";
import { useAudioRun } from "./useAudioRun";
import { useFrequencyResponse } from "./useFrequencyResponse";
import { useSelectionState } from "./useSelectionState";
import { useCircuitPersistence } from "./useCircuitPersistence";
import { useProbes } from "./useProbes";
import { useKnobPreview } from "./useKnobPreview";
import { pruneProbes } from "./probes";
import { movePartsBy, deleteParts, deleteWire, deleteBlock, rotatePart, updatePartParams, coerceParamValue } from "./circuitEdits";
import { computeOperatingPoint } from "./operatingPoint";
import type { Probe } from "./types";
import { canRedo, canUndo, commitPrevious, createHistory, pushSnapshot, redo, replacePresent, undo, type CircuitSnapshot } from "./historyStack";
import { loadCircuitFromStorage, CURRENT_SCHEMA_VERSION } from "./circuitStorage";

let partCounter = 0;
let blockCounter = 0;
let pasteCounter = 0;
/** Pasted copies land slightly off the originals so they are visibly a second object. */
const PASTE_OFFSET = { dx: 30, dy: 30 };

type LeftTab = "parts" | "library";

function loadInitialState(): { snapshot: CircuitSnapshot; outputNode: string; inputGain: number; probes: Probe[] } {
  const stored = loadCircuitFromStorage(localStorage);
  if (!stored) return { snapshot: { parts: [], wires: [], blocks: [] }, outputNode: "", inputGain: 0.5, probes: [] };
  return {
    snapshot: { parts: stored.parts, wires: stored.wires, blocks: stored.blocks },
    outputNode: stored.outputNode,
    inputGain: stored.inputGain,
    probes: stored.probes ?? [],
  };
}

export function SchematicEditor() {
  const initial = useMemo(() => loadInitialState(), []);
  const [leftTab, setLeftTab] = useState<LeftTab>("parts");
  const [history, setHistory] = useState(() => createHistory(initial.snapshot));
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ parts: PartInstance[]; wires: Wire[] } | null>(null);
  const [outputNode, setOutputNode] = useState<string>(initial.outputNode);
  const [inputGain, setInputGain] = useState(initial.inputGain);
  const [status, setStatus] = useState("");
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [circuitVersion, setCircuitVersion] = useState(0);
  const dragStartSnapshotRef = useRef<CircuitSnapshot | null>(null);
  /** Which ids were selected when the clipboard was filled. */
  const clipboardIdsRef = useRef<string[]>([]);

  const parts = history.present.parts;
  const wires = history.present.wires;
  const blocks = history.present.blocks;

  const graph = useMemo(() => netlistFromGraph(parts, wires), [parts, wires]);
  const selection = useSelectionState(parts);
  const { selectedPartId, selectedPartIds, selectedWireId } = selection;
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;
  const selectedWire = wires.find((w) => w.id === selectedWireId) ?? null;

  const handleSelectPart = selection.selectPart;
  const canvasSize = useMemo(() => {
    const margin = 120;
    const maxX = parts.reduce((max, p) => Math.max(max, p.x), 0);
    const maxY = parts.reduce((max, p) => Math.max(max, p.y), 0);
    return { width: Math.max(900, maxX + margin), height: Math.max(460, maxY + margin) };
  }, [parts]);

  const probes = useProbes(initial.probes, parts, graph, setStatus);
  const [showDc, setShowDc] = useState(false);
  const wantsOperatingPoint = showDc || probes.resolved.length > 0;
  const operatingPoint = useMemo(() => (wantsOperatingPoint ? computeOperatingPoint(graph) : null), [graph, wantsOperatingPoint]);
  const acResult = useFrequencyResponse(graph, outputNode, probes.resolved);

  const commit = (next: CircuitSnapshot) => setHistory((h) => pushSnapshot(h, next));

  const handleUndo = () => setHistory((h) => undo(h));
  const handleRedo = () => setHistory((h) => redo(h));

  /**
   * Swaps in a whole new circuit. Every entry point that does this - new, template, wiring preset,
   * opened file - has to clear the same six things, and forgetting one leaves stale traces or a
   * stale preset highlight pointing at a circuit that is no longer on the canvas.
   */
  const replaceCircuit = (
    snapshot: CircuitSnapshot,
    options: { outputNode: string; presetId: string | null; status: string; inputGain?: number; probes?: Probe[] },
  ) => {
    commit(snapshot);
    selection.deselect();
    probes.replaceAll(options.probes ?? []);
    setLoadedPresetId(options.presetId);
    setOutputNode(options.outputNode);
    if (options.inputGain !== undefined) setInputGain(options.inputGain);
    audio.clearTraces();
    setMonteCarloResult(null);
    setCircuitVersion((v) => v + 1);
    setStatus(options.status);
  };

  const handleNewCircuit = () => {
    if (parts.length > 0 && !window.confirm("현재 회로를 지우고 새로 시작할까요? 저장되지 않은 작업은 undo(Ctrl+Z)로만 복구할 수 있습니다.")) return;
    replaceCircuit({ parts: [], wires: [], blocks: [] }, { outputNode: "", presetId: null, status: "새 회로" });
  };

  const handleLoadTemplate = (preset: PedalPreset, variant?: PresetVariant) => {
    const { snapshot, outputNode: out, probes: presetProbes } = loadPedalPreset(preset, variant);
    replaceCircuit(snapshot, { outputNode: out, probes: presetProbes, presetId: preset.id, status: `템플릿 로드됨: ${preset.name}${variant ? ` - ${variant.label}` : ""}` });
  };

  const handleLoadWiring = (preset: WiringPreset) => {
    const { snapshot, outputNode: out, probes: presetProbes } = loadWiringPreset(preset);
    replaceCircuit(snapshot, { outputNode: out, probes: presetProbes, presetId: preset.id, status: `배선 로드됨: ${preset.name}` });
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
    const dragged = parts.find((p) => p.id === id);
    if (!dragged) return;
    // Dragging one part of a multi-selection moves the whole selection - leaving the others behind
    // is the thing that makes box-select feel broken.
    const moving = selectedPartIds.includes(id) ? new Set(selectedPartIds) : new Set([id]);
    const dx = snapToGrid(x) - dragged.x;
    const dy = snapToGrid(y) - dragged.y;
    setHistory((h) => replacePresent(h, movePartsBy(history.present, moving, dx, dy)));
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
    if (selectedWireId) commit(deleteWire(history.present, selectedWireId));
    else if (selectedPartIds.length > 0) commit(deleteParts(history.present, selectedPartIds));
    else return;
    selection.deselect();
  };

  /** Copy/paste and duplicate share one path: both stamp a clone of a selection onto the canvas. */
  const pasteClone = (source: { parts: PartInstance[]; wires: Wire[] }, sourceIds: string[]) => {
    pasteCounter += 1;
    const { parts: newParts, wires: newWires } = cloneSelection(source.parts, source.wires, sourceIds, PASTE_OFFSET, `cp${pasteCounter}`);
    if (newParts.length === 0) return;
    commit({ parts: [...parts, ...newParts], wires: [...wires, ...newWires], blocks });
    selection.selectParts(newParts.map((p) => p.id));
    setStatus(`${newParts.length}개 부품을 붙여넣었습니다.`);
  };

  const handleCopy = () => {
    if (selectedPartIds.length === 0) return;
    setClipboard({ parts, wires });
    clipboardIdsRef.current = selectedPartIds;
    setStatus(`${selectedPartIds.length}개 부품을 복사했습니다.`);
  };

  const handlePaste = () => {
    if (!clipboard) return;
    // The clipboard holds the whole canvas as it was at copy time plus the ids that were selected,
    // so a paste still works after the originals have been edited or deleted.
    pasteClone(clipboard, clipboardIdsRef.current);
  };

  const handleDuplicate = () => pasteClone({ parts, wires }, selectedPartIds);

  /**
   * Arrow-key move. With nothing selected it selects the first part instead of moving nothing -
   * otherwise a keyboard-only user has no way to get a selection started at all.
   */
  const handleNudge = (dx: number, dy: number) => {
    if (selectedPartIds.length === 0) {
      if (parts.length > 0) handleSelectPart(parts[0].id);
      return;
    }
    commit(movePartsBy(history.present, selectedPartIds, dx * GRID_SIZE, dy * GRID_SIZE));
  };

  const handleDeleteBlock = (blockId: string) => {
    commit(deleteBlock(history.present, blockId));
    selection.deselect();
  };

  const handleRotateSelected = () => {
    if (selectedPartId) commit(rotatePart(history.present, selectedPartId));
  };

  useEditorShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onRotate: handleRotateSelected,
    onDelete: handleDeleteSelected,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onDuplicate: handleDuplicate,
    onNudge: handleNudge,
    onCycleSelection: selection.cycle,
    onDeselect: () => {
      selection.deselect();
      probes.setProbeMode(false);
    },
    onToggleProbeMode: () => probes.setProbeMode(!probes.probeMode),
  });

  const handleParamChange = (key: string, value: string) => {
    if (!selectedPart) return;
    commit(updatePartParams(history.present, selectedPart.id, { [key]: coerceParamValue(key, value) }));
    preview.request();
  };

  const handleApplyModel = (paramsOverride: Record<string, number | string>) => {
    if (!selectedPart) return;
    commit(updatePartParams(history.present, selectedPart.id, paramsOverride));
    preview.request();
  };

  const persistence = useCircuitPersistence({
    circuit: { schemaVersion: CURRENT_SCHEMA_VERSION, parts, wires, blocks, outputNode, inputGain, probes: pruneProbes(probes.probes, parts) },
    onStatus: setStatus,
    onLoaded: (circuit, fileName) =>
      replaceCircuit(
        { parts: circuit.parts, wires: circuit.wires, blocks: circuit.blocks },
        { outputNode: circuit.outputNode, presetId: null, status: `회로를 불러왔습니다: ${fileName}`, inputGain: circuit.inputGain, probes: circuit.probes },
      ),
  });

  const audio = useAudioRun({ graph, inputGain, onStatus: setStatus });
  const preview = useKnobPreview({
    graph,
    outputNode,
    inputGain,
    sample: audio.sample,
    getAudioContext: audio.getAudioContext,
    cabinet: audio.cabinetEnabled ? audio.cabinetVariant : null,
    onStatus: setStatus,
  });

  const analysis = useAnalysisPanels({
    graph,
    outputNode,
    sample: audio.sample,
    inputGain,
    getAudioContext: audio.getAudioContext,
    cabinetEnabled: audio.cabinetEnabled,
    cabinetVariant: audio.cabinetVariant,
    onMonteCarloResultChange: setMonteCarloResult,
  });

  const dockTabs = buildDockTabs({
    parts,
    wires,
    graph,
    outputNode,
    onSelectPart: handleSelectPart,
    acResult,
    probes: probes.resolved,
    monteCarloResult,
    audio,
    analysis,
  });

  return (
    <div className="workspace-content">
      <EditorToolbar
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        hasParts={parts.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveFile={persistence.saveFile}
        onOpenFile={persistence.openFile}
        onNewCircuit={handleNewCircuit}
      />

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

        <EditorCanvasArea
          parts={parts}
          wires={wires}
          blocks={blocks}
          canvasSize={canvasSize}
          selectedPartId={selectedPartId}
          selectedPartIds={selectedPartIds}
          selectedWireId={selectedWireId}
          onBoxSelect={selection.selectParts}
          circuitVersion={circuitVersion}
          dockTabs={dockTabs}
          onMovePart={handleMovePart}
          onSelectPart={handleSelectPart}
          onSelectWire={selection.selectWire}
          onAddWire={handleAddWire}
          onDragEnd={handleDragEnd}
          probeMode={probes.probeMode}
          onProbeModeChange={probes.setProbeMode}
          onProbeTerminal={probes.toggleAt}
          probes={probes.resolved}
          terminalNet={graph.terminalNet}
          operatingPoint={operatingPoint}
          showDc={showDc}
          onShowDcChange={setShowDc}
        />

        <EditorSidebarRight
          selectedPart={selectedPart}
          selectedWire={selectedWire}
          blocks={blocks}
          graph={graph}
          outputNode={outputNode}
          onOutputNodeChange={setOutputNode}
          inputGain={inputGain}
          onInputGainChange={(gain) => {
            setInputGain(gain);
            preview.request();
          }}
          status={status}
          audio={audio}
          onParamChange={handleParamChange}
          onApplyModel={handleApplyModel}
          onRotate={handleRotateSelected}
          onDelete={handleDeleteSelected}
          onDeleteBlock={handleDeleteBlock}
          preview={{ enabled: preview.enabled, onEnabledChange: preview.setEnabled, busy: preview.busy }}
          probePanel={{
            probes: probes.resolved,
            probeMode: probes.probeMode,
            onProbeModeChange: probes.setProbeMode,
            onRename: probes.rename,
            onRemove: probes.remove,
            operatingPoint,
          }}
        />
      </div>
    </div>
  );
}
