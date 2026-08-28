import { PART_DEFS } from "./partDefs";
import type { PartInstance } from "./types";
import { DIODE_MODELS } from "../core/library/deviceModels";
import { TAPER_OPTIONS } from "./taper";
import { PARAM_META } from "./paramMeta";

interface InspectorPanelProps {
  selectedPart: PartInstance | null;
  onParamChange: (key: string, value: string) => void;
  onApplyDiodeModel: (modelKey: string) => void;
  onRotate: () => void;
  onDelete: () => void;
}

export function InspectorPanel({ selectedPart, onParamChange, onApplyDiodeModel, onRotate, onDelete }: InspectorPanelProps) {
  return (
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
              <select defaultValue="" onChange={(e) => onApplyDiodeModel(e.target.value)} style={{ width: "100%" }}>
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
              <select value={String(selectedPart.params.taper)} onChange={(e) => onParamChange("taper", e.target.value)} style={{ width: "100%" }}>
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

              if (meta?.slider && typeof value === "number") {
                return (
                  <div className="field" key={key}>
                    <div className="field-row">
                      <label>{key}</label>
                      <span className="field-value">{value.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={meta.min ?? 0}
                      max={meta.slider.max}
                      step={meta.slider.step}
                      value={value}
                      onChange={(e) => onParamChange(key, e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>
                );
              }

              return (
                <div className="field" key={key}>
                  <div className="field-row">
                    <label>{key}</label>
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
          </div>
        </>
      ) : (
        <p className="preset-description">캔버스에서 소자를 클릭해 선택하세요.</p>
      )}
    </div>
  );
}
