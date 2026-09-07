import { PART_DEFS, type PartType } from "./partDefs";
import type { BlockInstance, PartInstance, Wire } from "./types";
import { DIODE_MODELS, OPAMP_MODELS, TRANSISTOR_MODELS, JFET_MODELS, PICKUP_MODELS } from "../core/library/deviceModels";
import { TAPER_OPTIONS } from "./taper";
import { PARAM_META } from "./paramMeta";

/** Part types with more than one selectable named model - see PartPalette.tsx's MODEL_MENUS, which
 * this mirrors so the same variety is reachable after placement, not just at insert time. */
const MODEL_MENUS: Partial<Record<PartType, Record<string, { label: string; params: Record<string, number | string> }>>> = {
  diode: DIODE_MODELS,
  opamp: OPAMP_MODELS,
  bjt: TRANSISTOR_MODELS,
  jfet: JFET_MODELS,
  pickup: PICKUP_MODELS,
};

/** Position names per switch type. A switch has a handful of named states, not a continuous value,
 * so it gets a select rather than the numeric field the generic param loop would give it. */
const SWITCH_POSITION_LABELS: Partial<Record<PartType, string[]>> = {
  spst: ["열림 (OFF)", "닫힘 (ON)"],
  spdt: ["위치 1 (단자 1)", "위치 2 (단자 2)"],
  dpdt: ["위치 1 (단자 a)", "위치 2 (단자 b)"],
  blade3: ["1 (입력 1)", "2 (입력 1+2)", "3 (입력 2)"],
  blade5: ["1 (입력 1)", "2 (입력 1+2)", "3 (입력 2)", "4 (입력 2+3)", "5 (입력 3)"],
  rotary6: ["1단", "2단", "3단", "4단", "5단", "6단"],
};

interface InspectorPanelProps {
  selectedPart: PartInstance | null;
  /** Set instead of `selectedPart` when the canvas selection is a wire - the two are mutually exclusive. */
  selectedWire?: Wire | null;
  blocks: BlockInstance[];
  onParamChange: (key: string, value: string) => void;
  onApplyModel: (paramsOverride: Record<string, number | string>) => void;
  onRotate: () => void;
  onDelete: () => void;
  onDeleteBlock: (blockId: string) => void;
}

export function InspectorPanel({ selectedPart, selectedWire = null, blocks, onParamChange, onApplyModel, onRotate, onDelete, onDeleteBlock }: InspectorPanelProps) {
  const ownerBlock = selectedPart?.blockId ? (blocks.find((b) => b.id === selectedPart.blockId) ?? null) : null;
  const modelMenu = selectedPart ? MODEL_MENUS[selectedPart.type] : undefined;
  const switchPositions = selectedPart ? SWITCH_POSITION_LABELS[selectedPart.type] : undefined;

  return (
    <div className="panel">
      <div className="panel-title">{selectedWire ? "선택된 배선" : "선택된 소자"}</div>
      {selectedWire ? (
        <>
          <p className="preset-description">
            {selectedWire.a.partId}:{selectedWire.a.terminalId} ↔ {selectedWire.b.partId}:{selectedWire.b.terminalId}
          </p>
          <p className="canvas-hint">잘못 이은 배선은 여기서 지울 수 있습니다. 부품은 그대로 남습니다.</p>
          <div className="run-row">
            <button type="button" onClick={onDelete}>
              삭제 (Del)
            </button>
          </div>
        </>
      ) : selectedPart ? (
        <>
          <p className="preset-description">
            {PART_DEFS[selectedPart.type].label} ({selectedPart.id})
          </p>
          {ownerBlock && <p className="canvas-hint">소속 블록: {ownerBlock.label}</p>}
          {modelMenu && (
            <div className="field">
              <div className="field-row">
                <label>소자 모델</label>
              </div>
              <select
                defaultValue=""
                onChange={(e) => {
                  const model = modelMenu[e.target.value];
                  if (model) onApplyModel(model.params);
                }}
              >
                <option value="" disabled>
                  모델 선택...
                </option>
                {Object.entries(modelMenu).map(([key, model]) => (
                  <option key={key} value={key}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {switchPositions && (
            <div className="field">
              <div className="field-row">
                <label htmlFor="switch-position-select">스위치 위치</label>
              </div>
              <select
                id="switch-position-select"
                value={String(
                  Math.min(Math.max(Math.trunc(Number(selectedPart.params.switchPosition)) || 0, 0), switchPositions.length - 1),
                )}
                onChange={(e) => onParamChange("switchPosition", e.target.value)}
              >
                {switchPositions.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
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
              <select value={String(selectedPart.params.taper)} onChange={(e) => onParamChange("taper", e.target.value)}>
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
            .filter(([key]) => !(switchPositions && key === "switchPosition"))
            .map(([key, value]) => {
              const meta = PARAM_META[key];
              const isInvalid = typeof value === "number" && meta?.min !== undefined && value < meta.min;

              if (meta?.slider && typeof value === "number") {
                return (
                  <div className="field" key={key}>
                    <div className="field-row">
                      <label>{meta?.label ?? key}</label>
                      <span className="field-value">{value.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={meta.min ?? 0}
                      max={meta.slider.max}
                      step={meta.slider.step}
                      value={value}
                      onChange={(e) => onParamChange(key, e.target.value)}
                    />
                  </div>
                );
              }

              return (
                <div className="field" key={key}>
                  <div className="field-row">
                    <label>{meta?.label ?? key}</label>
                    {meta?.unit && <span className="field-value">{meta.unit}</span>}
                  </div>
                  <input
                    type="text"
                    value={String(value)}
                    onChange={(e) => onParamChange(key, e.target.value)}
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
            <button type="button" onClick={onRotate}>
              회전 (R)
            </button>
            <button type="button" onClick={onDelete}>
              삭제 (Del)
            </button>
            {ownerBlock && (
              <button type="button" onClick={() => onDeleteBlock(ownerBlock.id)}>
                블록 전체 삭제
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="preset-description">캔버스에서 소자나 배선을 클릭해 선택하세요.</p>
      )}
    </div>
  );
}
