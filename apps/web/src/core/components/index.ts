import type { Element } from "../solver/types";
import type { StampContext } from "./context";
import { stampResistor } from "./resistor";
import { stampCapacitor } from "./capacitor";
import { stampInductor } from "./inductor";
import { stampCoupledInductors } from "./coupledInductors";
import { stampVoltageSource } from "./vsource";
import { stampDiode } from "./diode";
import { stampBjt } from "./bjt";
import { stampJfet } from "./jfet";
import { stampOpAmp } from "./opamp";

export function stampElement(element: Element, ctx: StampContext): void {
  switch (element.type) {
    case "resistor":
      return stampResistor(element, ctx);
    case "capacitor":
      return stampCapacitor(element, ctx);
    case "inductor":
      return stampInductor(element, ctx);
    case "coupledInductors":
      return stampCoupledInductors(element, ctx);
    case "vsource":
      return stampVoltageSource(element, ctx);
    case "diode":
      return stampDiode(element, ctx);
    case "bjt":
      return stampBjt(element, ctx);
    case "jfet":
      return stampJfet(element, ctx);
    case "opamp":
      return stampOpAmp(element, ctx);
  }
}

export { updateCapacitorHistory } from "./capacitor";
export { updateInductorHistory } from "./inductor";
export { updateCoupledInductorsHistory } from "./coupledInductors";
export { updateOpAmpHistory } from "./opamp";
