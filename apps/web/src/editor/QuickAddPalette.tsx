import { DIODE_MODELS, OPAMP_MODELS } from "../core/library/deviceModels";
import type { PartType } from "./partDefs";
import { partValueLabel } from "./valueLabel";

interface QuickAddPaletteProps {
  onAdd: (type: PartType, paramsOverride?: Record<string, number | string>) => void;
}

/** Common resistor/capacitor values seen repeatedly across this app's own preset library (bias
 * dividers, coupling caps, gain-setting resistors) - one click drops the part pre-set to that value
 * instead of add-then-edit-the-value-in-the-inspector. */
const COMMON_RESISTANCES = [1_000, 2_200, 4_700, 10_000, 22_000, 47_000, 100_000, 470_000, 1_000_000];
const COMMON_CAPACITANCES = [100e-12, 1e-9, 10e-9, 22e-9, 0.1e-6, 1e-6, 4.7e-6, 10e-6, 47e-6];

function resistorLabel(resistance: number): string {
  return partValueLabel({ id: "", type: "resistor", x: 0, y: 0, rotation: 0, params: { resistance } })!;
}

function capacitorLabel(capacitance: number): string {
  return partValueLabel({ id: "", type: "capacitor", x: 0, y: 0, rotation: 0, params: { capacitance } })!;
}

/** Quick-add chips for values/models that come up constantly in guitar pedal circuits: common
 * R/C values plus the diode and op-amp model variants from `deviceModels.ts`, so a user assembling
 * a circuit by hand doesn't have to add-then-edit every clipping diode or op-amp one at a time. */
export function QuickAddPalette({ onAdd }: QuickAddPaletteProps) {
  return (
    <div className="quick-add-palette">
      <div className="quick-add-section">
        <div className="quick-add-heading">자주 쓰는 저항</div>
        <div className="quick-add-chips">
          {COMMON_RESISTANCES.map((resistance) => (
            <button key={resistance} type="button" className="quick-add-chip" onClick={() => onAdd("resistor", { resistance })}>
              {resistorLabel(resistance)}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-add-section">
        <div className="quick-add-heading">자주 쓰는 커패시터</div>
        <div className="quick-add-chips">
          {COMMON_CAPACITANCES.map((capacitance) => (
            <button key={capacitance} type="button" className="quick-add-chip" onClick={() => onAdd("capacitor", { capacitance })}>
              {capacitorLabel(capacitance)}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-add-section">
        <div className="quick-add-heading">다이오드 모델</div>
        <div className="quick-add-chips">
          {Object.entries(DIODE_MODELS).map(([key, model]) => (
            <button key={key} type="button" className="quick-add-chip" onClick={() => onAdd("diode", model.params)}>
              {model.label}
            </button>
          ))}
        </div>
      </div>

      <div className="quick-add-section">
        <div className="quick-add-heading">연산증폭기 모델</div>
        <div className="quick-add-chips">
          {Object.entries(OPAMP_MODELS).map(([key, model]) => (
            <button key={key} type="button" className="quick-add-chip" onClick={() => onAdd("opamp", model.params)}>
              {model.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
