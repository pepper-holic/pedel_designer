import { describe, expect, it } from "vitest";
import { measureThd } from "../../src/editor/thdMeasurement";
import { bufferPreset } from "../../src/core/library/presets/buffer";
import { opampDrivePreset } from "../../src/core/library/presets/opamp-drive";

describe("measureThd", () => {
  it("reports low THD for a clean buffer", () => {
    const netlist = bufferPreset.build(bufferPreset.defaultParams);
    const result = measureThd(netlist, bufferPreset.inputSourceId, bufferPreset.outputNode);
    expect(result.thdPercent).toBeLessThan(1);
  });

  it("reports substantial THD once the test tone drives a high-gain clipping stage into clipping", () => {
    const netlist = opampDrivePreset.build(opampDrivePreset.defaultParams); // gain 50x - 0.5V input clips hard
    const result = measureThd(netlist, opampDrivePreset.inputSourceId, opampDrivePreset.outputNode);
    expect(result.thdPercent).toBeGreaterThan(1);
  });
});
