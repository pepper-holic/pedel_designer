import { BLOCK_CATEGORY_LABELS } from "./blocks";
import { knobReadout } from "./blockOps";
import { SWITCH_POSITION_LABELS } from "./switchLabels";
import type { BlockInstance, BlockParam, BlockPort, PartInstance, PortKind } from "./types";
import { Icon } from "../ui/Icon";

const PORT_KIND_LABELS: Record<PortKind, string> = {
  in: "입력 (왼쪽)",
  out: "출력 (오른쪽)",
  supply: "전원 (위)",
  bias: "바이어스 (위)",
  ground: "접지 (아래)",
  aux: "보조 (왼쪽)",
};

interface BlockInspectorProps {
  block: BlockInstance;
  parts: PartInstance[];
  onRename: (label: string) => void;
  onToggleCollapse: () => void;
  onUngroup: () => void;
  onSaveAsUserBlock: () => void;
  onDelete: () => void;
  onSetKnob: (param: BlockParam, value: number | string) => void;
  onUpdateParam: (paramId: string, patch: { label: string } | null) => void;
  onUpdatePort: (portId: string, patch: Partial<Pick<BlockPort, "label" | "kind">>) => void;
}

function KnobControl({
  param,
  part,
  onSetKnob,
}: {
  param: BlockParam;
  part: PartInstance | undefined;
  onSetKnob: (param: BlockParam, value: number | string) => void;
}) {
  const value = part?.params[param.paramKey];
  if (param.paramKey === "position" && typeof value === "number") {
    return (
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        aria-label={`${param.label} 노브`}
        onChange={(e) => onSetKnob(param, Number(e.target.value))}
      />
    );
  }
  const positions = part ? SWITCH_POSITION_LABELS[part.type] : undefined;
  if (param.paramKey === "switchPosition" && positions) {
    return (
      <select aria-label={`${param.label} 스위치`} value={String(value)} onChange={(e) => onSetKnob(param, Number(e.target.value))}>
        {positions.map((label, i) => (
          <option key={label} value={i}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="text"
      aria-label={`${param.label} 값`}
      value={String(value ?? "")}
      onChange={(e) => {
        const n = Number(e.target.value);
        onSetKnob(param, e.target.value.trim() !== "" && Number.isFinite(n) ? n : e.target.value);
      }}
    />
  );
}

/**
 * The inspector for a whole block: its knobs (turned here without opening the block), its ports,
 * and the block-level actions. This is the black-box view - everything a user of the block needs,
 * nothing about how it is built.
 */
export function BlockInspector(props: BlockInspectorProps) {
  const { block, parts } = props;
  const byId = new Map(parts.map((p) => [p.id, p]));
  const memberCount = parts.filter((p) => p.blockId === block.id).length;

  return (
    <div className="panel">
      <div className="panel-title">선택된 블록</div>
      <div className="field">
        <label htmlFor="block-label-input">이름</label>
        <input id="block-label-input" className="block-label-input" value={block.label} onChange={(e) => props.onRename(e.target.value)} maxLength={40} />
      </div>
      <p className="canvas-hint">
        {BLOCK_CATEGORY_LABELS[block.category]} · 부품 {memberCount}개{block.defId ? "" : " · 직접 묶은 블록"}
      </p>

      <div className="block-section-title">노브</div>
      {block.params.length === 0 ? (
        <p className="canvas-hint">노출된 노브가 없습니다. 블록 안 부품을 선택해 "블록 노브로 표시"로 추가할 수 있습니다.</p>
      ) : (
        block.params.map((param) => (
          <div className="field block-knob" key={param.id}>
            <div className="field-row">
              <input
                className="block-knob-label"
                aria-label={`${param.label} 노브 이름`}
                value={param.label}
                onChange={(e) => props.onUpdateParam(param.id, { label: e.target.value })}
                maxLength={16}
              />
              <span className="field-value">{knobReadout(byId.get(param.partId), param.paramKey)}</span>
              <button type="button" aria-label={`${param.label} 노브 숨기기`} onClick={() => props.onUpdateParam(param.id, null)}>
                <Icon name="close" />
              </button>
            </div>
            <KnobControl param={param} part={byId.get(param.partId)} onSetKnob={props.onSetKnob} />
          </div>
        ))
      )}

      <div className="block-section-title">포트</div>
      {block.ports.length === 0 ? (
        <p className="canvas-hint">밖으로 이어진 연결이 없습니다. 블록을 접으면 바깥과 이어진 지점이 자동으로 포트가 됩니다.</p>
      ) : (
        <ul className="probe-list">
          {block.ports.map((port) => (
            <li key={port.id} className="probe-row">
              <input
                aria-label={`${port.label} 포트 이름`}
                value={port.label}
                onChange={(e) => props.onUpdatePort(port.id, { label: e.target.value })}
                maxLength={8}
              />
              <select
                aria-label={`${port.label} 포트 종류`}
                value={port.kind}
                onChange={(e) => props.onUpdatePort(port.id, { kind: e.target.value as PortKind })}
              >
                {Object.entries(PORT_KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      <div className="run-row block-actions">
        <button type="button" onClick={props.onToggleCollapse}>
          {block.collapsed ? "펼치기 (세부 회로)" : "접기 (블랙박스)"}
        </button>
        <button type="button" onClick={props.onSaveAsUserBlock}>
          내 블록으로 저장
        </button>
        <button type="button" onClick={props.onUngroup} title="블록만 풀고 부품과 배선은 그대로 둡니다 (Ctrl+Shift+G)">
          블록 해제
        </button>
        <button type="button" onClick={props.onDelete}>
          블록 삭제
        </button>
      </div>
    </div>
  );
}
