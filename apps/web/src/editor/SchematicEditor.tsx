import { useMemo, useRef, useState } from "react";
import { PART_DEFS, type PartType } from "./partDefs";
import type { TerminalRef } from "./types";
import type { PartPatch } from "./InspectorPanel";
import { netlistFromGraph } from "./netlistFromGraph";
import { loadPedalPreset, loadWiringPreset } from "./templateLoading";
import { snapToGrid, GRID_SIZE } from "./geometry";
import { useBlockActions } from "./useBlockActions";
import { useClipboard } from "./useClipboard";
import { nextFreeId } from "./ids";
import { EditorCanvasArea } from "./EditorCanvasArea";
import { EditorSidebarRight } from "./EditorSidebarRight";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { buildAnalysisTabs } from "./dockTabs";
import { BottomDock } from "./BottomDock";
import { ProbePanel } from "./ProbePanel";
import { AppBar } from "./shell/AppBar";
import { TransportBar } from "./shell/TransportBar";
import { ShortcutHelp } from "./shell/ShortcutHelp";
import { StartCards } from "./shell/StartCards";
import { LibraryPanel, type LibraryTab } from "./shell/LibraryPanel";
import { AnalyzeWorkspace } from "./shell/AnalyzeWorkspace";
import { BuildWorkspace } from "./shell/BuildWorkspace";
import { EmptyStep } from "./shell/EmptyStep";
import { MODES, type WorkMode } from "./shell/modes";
import { useAnalysisPanels } from "./useAnalysisPanels";
import type { MonteCarloResult } from "../core/analysis/montecarlo";
import { presets, type PedalPreset, type PresetVariant } from "../core/library/presets";
import { wiringPresets, type WiringPreset } from "./wiring";
import { useFrequencyResponse } from "./useFrequencyResponse";
import { useSelectionState } from "./useSelectionState";
import { useCircuitPersistence } from "./useCircuitPersistence";
import { useProbes } from "./useProbes";
import { useEditorAudio } from "./useEditorAudio";
import { PlayerView } from "./player/PlayerView";
import { playerSections } from "./player/playerControls";
import { pruneProbes } from "./probes";
import { movePartsBy, deleteParts, deleteWire, deleteBlock, rotatePart, updatePartParams, coerceParamValue } from "./circuitEdits";
import { computeOperatingPoint } from "./operatingPoint";
import type { Probe } from "./types";
import { canRedo, canUndo, createHistory, pushSnapshot, redo, undo, type CircuitSnapshot } from "./historyStack";
import { useDragEditing } from "./useDragEditing";
import { arrangeParts } from "./layout/arrange";
import { rewireNets } from "./layout/rewire";
import { loadCircuitFromStorage, CURRENT_SCHEMA_VERSION } from "./circuitStorage";

const MODE_KEY = "pedal-designer:mode";
const TITLE_KEY = "pedal-designer:title";
/** The design step's quick dock: the two views that answer "what did that edit do?" at a glance. */
const QUICK_TABS = ["response", "sweep"];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // kept for this session only
  }
}

function readMode(): WorkMode {
  const stored = readStored(MODE_KEY);
  return MODES.some((m) => m.id === stored) ? (stored as WorkMode) : "design";
}

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
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("presets");
  const [mode, setModeState] = useState<WorkMode>(readMode);
  const setMode = (next: WorkMode) => {
    setModeState(next);
    writeStored(MODE_KEY, next);
  };
  const [title, setTitleState] = useState(() => readStored(TITLE_KEY) ?? (initial.snapshot.parts.length > 0 ? "내 회로" : "새 회로"));
  const setTitle = (next: string) => {
    setTitleState(next);
    writeStored(TITLE_KEY, next);
  };
  const [helpOpen, setHelpOpen] = useState(false);
  const circuitFileInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState(() => createHistory(initial.snapshot));
  const [loadedPresetId, setLoadedPresetId] = useState<string | null>(null);
  const [outputNode, setOutputNode] = useState<string>(initial.outputNode);
  const [inputGain, setInputGain] = useState(initial.inputGain);
  const [status, setStatus] = useState("");
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [circuitVersion, setCircuitVersion] = useState(0);

  const parts = history.present.parts;
  const wires = history.present.wires;
  const blocks = history.present.blocks;

  const graph = useMemo(() => netlistFromGraph(parts, wires), [parts, wires]);
  const selection = useSelectionState(parts);
  const { selectedPartId, selectedPartIds, selectedWireId } = selection;
  const selectedPart = parts.find((p) => p.id === selectedPartId) ?? null;
  const selectedWire = wires.find((w) => w.id === selectedWireId) ?? null;

  const handleSelectPart = selection.selectPart;
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
    options: { outputNode: string; presetId: string | null; status: string; title: string; inputGain?: number; probes?: Probe[] },
  ) => {
    commit(snapshot);
    setTitle(options.title);
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
    replaceCircuit({ parts: [], wires: [], blocks: [] }, { outputNode: "", presetId: null, status: "새 회로", title: "새 회로" });
  };

  const handleLoadTemplate = (preset: PedalPreset, variant?: PresetVariant) => {
    const { snapshot, outputNode: out, probes: presetProbes } = loadPedalPreset(preset, variant);
    replaceCircuit(snapshot, {
      outputNode: out,
      probes: presetProbes,
      presetId: preset.id,
      title: `${preset.name}${variant ? ` · ${variant.label}` : ""}`,
      status: `불러옴: ${preset.name}${variant ? ` - ${variant.label}` : ""}`,
    });
  };

  const handleLoadWiring = (preset: WiringPreset) => {
    const { snapshot, outputNode: out, probes: presetProbes } = loadWiringPreset(preset);
    replaceCircuit(snapshot, { outputNode: out, probes: presetProbes, presetId: preset.id, title: preset.name, status: `불러옴: ${preset.name}` });
  };

  const handleAddPart = (type: PartType, paramsOverride?: Record<string, number | string>) => {
    const id = nextFreeId(
      type,
      parts.map((p) => p.id),
    );
    // Fresh parts fill a loose grid in order of arrival, so a burst of clicks does not stack them.
    const slot = parts.filter((p) => !p.blockId).length;
    const x = snapToGrid(80 + (slot % 6) * 130);
    const y = snapToGrid(80 + Math.floor(slot / 6) * 100);
    commit({ parts: [...parts, { id, type, x, y, rotation: 0, params: { ...PART_DEFS[type].defaultParams, ...paramsOverride } }], wires, blocks });
  };

  const drag = useDragEditing({ history, setHistory, selectedPartIds });
  // Bumped by "자동 정렬" so the view re-fits the rearranged circuit.
  const [arrangeCount, setArrangeCount] = useState(0);

  /** Lays the whole circuit out again (blocks in signal order, parts within each block), leaving
   * hand-placed (pinned) parts alone, then rewires each net as its shortest tree. */
  const handleAutoArrange = () => {
    commit(rewireNets(arrangeParts(history.present, graph.inputSourceId)));
    setArrangeCount((n) => n + 1);
    const pinned = parts.filter((p) => p.pinned).length;
    setStatus(pinned > 0 ? `자동 정렬했습니다. 직접 옮긴 부품 ${pinned}개는 그 자리에 두었습니다.` : "자동 정렬했습니다.");
  };

  const handleResetWire = (wireId: string) => commit({ ...history.present, wires: wires.map((w) => (w.id === wireId ? { id: w.id, a: w.a, b: w.b } : w)) });

  const handlePatchPart = (partId: string, patch: PartPatch) =>
    commit({ ...history.present, parts: parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)) });

  const handleAddWire = (a: TerminalRef, b: TerminalRef) => {
    commit({ parts, wires: [...wires, { id: `w${wires.length + 1}_${Date.now()}`, a, b }], blocks });
  };

  const handleDeleteSelected = () => {
    if (selectedWireId) commit(deleteWire(history.present, selectedWireId));
    else if (selectedPartIds.length > 0) commit(deleteParts(history.present, selectedPartIds));
    else return;
    selection.deselect();
  };

  const clipboard = useClipboard({ present: history.present, commit, selection, onStatus: setStatus });

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

  const blockActions = useBlockActions({
    present: history.present,
    commit,
    selection,
    onStatus: setStatus,
    onKnobChanged: () => requestPreview(),
  });
  const selectedBlock = blocks.find((b) => b.id === selection.selectedBlockId) ?? null;

  useEditorShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onRotate: handleRotateSelected,
    onDelete: handleDeleteSelected,
    onCopy: clipboard.copy,
    onPaste: clipboard.paste,
    onDuplicate: clipboard.duplicate,
    onGroup: blockActions.groupSelection,
    onUngroup: () => blockActions.ungroup(),
    onNudge: handleNudge,
    onCycleSelection: selection.cycle,
    onDeselect: () => {
      selection.deselect();
      probes.setProbeMode(false);
    },
    onToggleProbeMode: () => probes.setProbeMode(!probes.probeMode),
    canvasActive: mode === "design" || mode === "analyze",
    onMode: (i) => setMode(MODES[i].id),
    onHelp: () => setHelpOpen((v) => !v),
    onTogglePlay: () => realtimeControl.supported && realtimeControl.onToggle(),
  });

  const handleParamChange = (key: string, value: string) => {
    if (!selectedPart) return;
    commit(updatePartParams(history.present, selectedPart.id, { [key]: coerceParamValue(key, value) }));
    requestPreview();
  };

  const handleApplyModel = (paramsOverride: Record<string, number | string>) => {
    if (!selectedPart) return;
    commit(updatePartParams(history.present, selectedPart.id, paramsOverride));
    requestPreview();
  };

  const persistence = useCircuitPersistence({
    circuit: { schemaVersion: CURRENT_SCHEMA_VERSION, parts, wires, blocks, outputNode, inputGain, probes: pruneProbes(probes.probes, parts) },
    onStatus: setStatus,
    onLoaded: (circuit, fileName) =>
      replaceCircuit(
        { parts: circuit.parts, wires: circuit.wires, blocks: circuit.blocks },
        {
          outputNode: circuit.outputNode,
          presetId: null,
          status: `회로를 불러왔습니다: ${fileName}`,
          title: fileName.replace(/\.json$/i, ""),
          inputGain: circuit.inputGain,
          probes: circuit.probes,
        },
      ),
  });

  const { audio, preview, requestPreview, previewControl, realtimeControl } = useEditorAudio({ graph, outputNode, inputGain, onStatus: setStatus });
  const handleInputGainChange = (gain: number) => {
    setInputGain(gain);
    requestPreview();
  };

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

  const analysisTabs = buildAnalysisTabs({
    parts,
    wires,
    graph,
    outputNode,
    acResult,
    probes: probes.resolved,
    monteCarloResult,
    audio,
    analysis,
  });

  const probePanelProps = {
    probes: probes.resolved,
    probeMode: probes.probeMode,
    onProbeModeChange: probes.setProbeMode,
    onRename: probes.rename,
    onRemove: probes.remove,
    operatingPoint,
  };

  const canvas = (overlay?: React.ReactNode) => (
    <EditorCanvasArea
      parts={parts}
      wires={wires}
      blocks={blocks}
      fitSignal={circuitVersion + blockActions.placedCount + arrangeCount}
      onAutoArrange={handleAutoArrange}
      selectedPartId={selectedPartId}
      selectedPartIds={selectedPartIds}
      selectedWireId={selectedWireId}
      onBoxSelect={selection.selectParts}
      circuitVersion={circuitVersion}
      overlay={overlay}
      onMovePart={drag.movePart}
      onWireWaypoints={drag.setWireWaypoints}
      onSelectPart={handleSelectPart}
      onSelectWire={selection.selectWire}
      onAddWire={handleAddWire}
      onDragEnd={drag.end}
      probeMode={probes.probeMode}
      onProbeModeChange={probes.setProbeMode}
      onProbeTerminal={probes.toggleAt}
      probes={probes.resolved}
      terminalNet={graph.terminalNet}
      operatingPoint={operatingPoint}
      showDc={showDc}
      onShowDcChange={setShowDc}
      selectedBlockId={selection.selectedBlockId}
      onSelectBlock={selection.selectBlock}
      onToggleCollapse={blockActions.toggleCollapse}
      onSetAllCollapsed={blockActions.setAllCollapsed}
    />
  );

  const hasCircuit = parts.length > 0;
  const runBlocker = graph.inputSourceId ? null : "입력 잭(신호원)이 없어 실행할 수 없습니다";

  const workspace = () => {
    if (mode !== "design" && !hasCircuit) return <EmptyStep mode={mode} onGoDesign={() => setMode("design")} />;
    if (mode === "play")
      return (
        <PlayerView
          title={title}
          sections={playerSections(blocks, parts)}
          onSetControl={blockActions.setKnob}
          realtime={realtimeControl}
          preview={{ ...previewControl, lastClip: preview.lastClip }}
          response={acResult.points}
        />
      );
    if (mode === "analyze")
      return (
        <AnalyzeWorkspace
          canvas={canvas()}
          probePanel={<ProbePanel {...probePanelProps} />}
          tabs={analysisTabs}
          run={{
            canRun: !!graph.inputSourceId && !audio.isSimulating,
            running: audio.isSimulating,
            onRun: audio.handleRun,
            blocker: runBlocker,
            stale: audio.tracesStale,
            hasResult: audio.waveTraces !== null,
            sourceLabel: audio.sampleSource?.label ?? "코드 (기본)",
            useTrapezoidal: audio.useTrapezoidal,
            onUseTrapezoidalChange: audio.setUseTrapezoidal,
          }}
        />
      );
    if (mode === "build") return <BuildWorkspace parts={parts} blocks={blocks} graph={graph} outputNode={outputNode} />;
    return (
      <div className="design-workspace">
        <LibraryPanel
          tab={libraryTab}
          onTabChange={setLibraryTab}
          onAddPart={handleAddPart}
          onAddBlock={blockActions.addLibraryBlock}
          userBlocks={{ items: blockActions.userBlocks, onAdd: blockActions.addUserBlock, onDelete: blockActions.deleteUserBlock }}
          presets={presets}
          wiringPresets={wiringPresets}
          loadedPresetId={loadedPresetId}
          onLoadTemplate={handleLoadTemplate}
          onLoadWiring={handleLoadWiring}
        />
        <div className="design-center">
          {canvas(
            !hasCircuit && (
              <StartCards
                onPresets={() => setLibraryTab("presets")}
                onBlocks={() => setLibraryTab("blocks")}
                onParts={() => setLibraryTab("parts")}
                onOpenFile={() => circuitFileInput.current?.click()}
              />
            ),
          )}
          {hasCircuit && (
            <BottomDock key={circuitVersion} tabs={analysisTabs.filter((t) => QUICK_TABS.includes(t.key))} storageKey="pedal-designer:quick-dock" collapsible />
          )}
        </div>
        <EditorSidebarRight
          parts={parts}
          wires={wires}
          selectedPart={selectedPart}
          selectedWire={selectedWire}
          blocks={blocks}
          outputNode={outputNode}
          onParamChange={handleParamChange}
          onApplyModel={handleApplyModel}
          onRotate={handleRotateSelected}
          onDelete={handleDeleteSelected}
          onDeleteBlock={handleDeleteBlock}
          onSelectBlock={selection.selectBlock}
          onSelectPart={handleSelectPart}
          onResetWire={handleResetWire}
          onPatchPart={handlePatchPart}
          onExposeParam={blockActions.exposeParam}
          onModeChange={setMode}
          blockInspector={
            selectedBlock && {
              block: selectedBlock,
              parts,
              onRename: (label) => blockActions.rename(selectedBlock.id, label),
              onToggleCollapse: () => blockActions.toggleCollapse(selectedBlock.id),
              onUngroup: () => blockActions.ungroup(selectedBlock.id),
              onSaveAsUserBlock: () => blockActions.saveAsUserBlock(selectedBlock.id),
              onDelete: () => handleDeleteBlock(selectedBlock.id),
              onSetKnob: blockActions.setKnob,
              onUpdateParam: (paramId, patch) => blockActions.updateParam(selectedBlock.id, paramId, patch),
              onUpdatePort: (portId, patch) => blockActions.updatePort(selectedBlock.id, portId, patch),
            }
          }
          probePanel={probePanelProps}
        />
      </div>
    );
  };

  return (
    <div className="app-shell" data-mode={mode}>
      <AppBar
        title={title}
        mode={mode}
        onModeChange={setMode}
        hasCircuit={hasCircuit}
        canUndo={canUndo(history)}
        canRedo={canRedo(history)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onNew={handleNewCircuit}
        onOpen={() => circuitFileInput.current?.click()}
        onSave={persistence.saveFile}
        onHelp={() => setHelpOpen(true)}
      />
      {/* The native file input cannot be restyled; the file menu and the start card click this one. */}
      <input
        ref={circuitFileInput}
        type="file"
        accept="application/json,.json"
        onChange={persistence.openFile}
        className="visually-hidden"
        aria-label="회로 파일 선택"
        tabIndex={-1}
      />

      <main className="workspace" aria-label={MODES.find((m) => m.id === mode)?.label}>
        {workspace()}
      </main>

      <TransportBar
        source={audio.sampleSource}
        onUseTestSignal={audio.handleUseTestSignal}
        onFileChange={audio.handleFileChange}
        inputGain={inputGain}
        onInputGainChange={handleInputGainChange}
        realtime={realtimeControl}
        preview={previewControl}
        outputNode={outputNode}
        onOutputNodeChange={setOutputNode}
        netNames={graph.netNames}
        cabinet={{
          enabled: audio.cabinetEnabled,
          variant: audio.cabinetVariant,
          onEnabledChange: audio.setCabinetEnabled,
          onVariantChange: audio.setCabinetVariant,
        }}
        status={status}
      />

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
