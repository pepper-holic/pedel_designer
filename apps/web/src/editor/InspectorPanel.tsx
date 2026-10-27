import { PART_DEFS, type PartType } from "./partDefs";
import type { BlockInstance, PartInstance, Wire } from "./types";
import { DIODE_MODELS, OPAMP_MODELS, TRANSISTOR_MODELS, JFET_MODELS, PICKUP_MODELS } from "../core/library/deviceModels";
import { TAPER_OPTIONS } from "./taper";
import { PARAM_META } from "./paramMeta";
import { SWITCH_POSITION_LABELS } from "./switchLabels";
import { defaultFootprintId, footprintOptions } from "./pcb/footprintAssign";

/** Part types with more than one selectable named model - see PartPalette.tsx's MODEL_MENUS, which
 * this mirrors so the same variety is reachable after placement, not just at insert time. */
const MODEL_MENUS: Partial<Record<PartType, Record<string, { label: string; params: Record<string, number | string> }>>> = {
  diode: DIODE_MODELS,
  opamp: OPAMP_MODELS,
  bjt: TRANSISTOR_MODELS,
  jfet: JFET_MODELS,
  pickup: PICKUP_MODELS,
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
  /** Selects the selected part's whole block (to collapse it, rename it, save it). */
  onSelectBlock?: (blockId: string) => void;
  /** Surfaces one of this part's parameters as a knob on its block. */
  onExposeParam?: (blockId: string, partId: string, paramKey: string) => void;
  /** Drops a wire's hand-dragged corners so it is routed automatically again. */
  onResetWire?: (wireId: string) => void;
  /** Physical (non-electrical) properties: pinned position, PCB footprint. */
  onPatchPart?: (partId: string, patch: PartPatch) => void;
}

export type PartPatch = Partial<Pick<PartInstance, "pinned" | "footprintId">>;

export function InspectorPanel({
  selectedPart,
  selectedWire = null,
  blocks,
  onParamChange,
  onApplyModel,
  onRotate,
  onDelete,
  onDeleteBlock,
  onSelectBlock,
  onExposeParam,
  onResetWire,
  onPatchPart,
}: InspectorPanelProps) {
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
          <p className="canvas-hint">잘못 이은 배선은 여기서 지울 수 있습니다. 부품은 그대로 남습니다. 네모 손잡이를 끌면 경로를 옮길 수 있습니다.</p>
          <div className="run-row">
            <button type="button" onClick={onDelete}>
              삭제 (Del)
            </button>
            {selectedWire.waypoints?.length && onResetWire ? (
              <button type="button" onClick={() => onResetWire(selectedWire.id)}>
                경로 초기화
              </button>
            ) : null}
          </div>
        </>
      ) : selectedPart ? (
        <>
          <p className="preset-description">
            {PART_DEFS[selectedPart.type].label} ({selectedPart.id})
          </p>
          {onPatchPart && (
            <label className="field-row" title="고정된 부품은 '자동 정렬'이 옮기지 않습니다. 직접 끌어 옮기면 자동으로 고정됩니다.">
              <span>
                <input type="checkbox" checked={!!selectedPart.pinned} onChange={() => onPatchPart(selectedPart.id, { pinned: !selectedPart.pinned })} /> 위치 고정 (자동 정렬 제외)
              </span>
            </label>
          )}
          {onPatchPart && <FootprintField part={selectedPart} onChange={(footprintId) => onPatchPart(selectedPart.id, { footprintId })} />}
          {ownerBlock && (
            <div className="field-row">
              <span className="canvas-hint">소속 블록: {ownerBlock.label}</span>
              {onSelectBlock && (
                <button type="button" onClick={() => onSelectBlock(ownerBlock.id)}>
                  블록 선택
                </button>
              )}
            </div>
          )}
          {ownerBlock && onExposeParam && (
            <div className="field-row">
              <label htmlFor="expose-param-select">블록 노브로 표시</label>
              <select
                id="expose-param-select"
                value=""
                onChange={(e) => e.target.value && onExposeParam(ownerBlock.id, selectedPart.id, e.target.value)}
              >
                <option value="">파라미터 선택...</option>
                {Object.entries(selectedPart.params)
                  .filter(([key, v]) => typeof v === "number" && !ownerBlock.params.some((p) => p.partId === selectedPart.id && p.paramKey === key))
                  .map(([key]) => (
                    <option key={key} value={key}>
                      {PARAM_META[key]?.label ?? key}
                    </option>
                  ))}
              </select>
            </div>
          )}
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

/** PCB footprint choice. "기본" follows the part's value (a 10µF cap becomes an electrolytic). */
function FootprintField({ part, onChange }: { part: PartInstance; onChange: (footprintId: string | undefined) => void }) {
  const options = footprintOptions(part.type);
  if (options.length === 0) return null;
  const defaultId = defaultFootprintId(part);
  const defaultLabel = options.find((f) => f.id === defaultId)?.label ?? "";
  return (
    <div className="field">
      <label htmlFor="footprint-select">풋프린트 (PCB)</label>
      <select id="footprint-select" value={part.footprintId ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">기본: {defaultLabel}</option>
        {options.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
