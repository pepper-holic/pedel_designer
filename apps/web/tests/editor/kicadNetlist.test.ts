import { describe, expect, it } from "vitest";
import { buildKicadNetlist } from "../../src/editor/kicadNetlist";
import { netlistFromGraph } from "../../src/editor/netlistFromGraph";
import type { PartInstance, Wire } from "../../src/editor/types";

describe("buildKicadNetlist", () => {
  const parts: PartInstance[] = [
    { id: "V1", type: "vsource", x: 0, y: 0, rotation: 0, params: { voltage: 0 } },
    { id: "R1", type: "resistor", x: 10, y: 0, rotation: 0, params: { resistance: 4700 } },
    { id: "GND1", type: "ground", x: 20, y: 0, rotation: 0, params: {} },
  ];
  const wires: Wire[] = [
    { id: "w1", a: { partId: "V1", terminalId: "positive" }, b: { partId: "R1", terminalId: "a" } },
    { id: "w2", a: { partId: "R1", terminalId: "b" }, b: { partId: "V1", terminalId: "negative" } },
    { id: "w3", a: { partId: "V1", terminalId: "negative" }, b: { partId: "GND1", terminalId: "gnd" } },
  ];
  const graph = netlistFromGraph(parts, wires);

  it("includes a component entry for every non-ground part", () => {
    const net = buildKicadNetlist(parts, graph, "test-project");
    expect(net).toContain('(comp (ref "V1")');
    expect(net).toContain('(comp (ref "R1")');
    expect(net).not.toContain('(comp (ref "GND1")');
  });

  it("uses the formatted engineering value for the resistor", () => {
    const net = buildKicadNetlist(parts, graph, "test-project");
    expect(net).toContain('(value "4.7kΩ")');
  });

  it("names the ground net GND instead of the internal \"0\"", () => {
    const net = buildKicadNetlist(parts, graph, "test-project");
    expect(net).toContain('(name "GND")');
    expect(net).not.toContain('(name "0")');
  });

  it("lists both endpoints of a wired connection as nodes on the same net", () => {
    const net = buildKicadNetlist(parts, graph, "test-project");
    const netBlocks = net.split(/(?=\(net \(code)/).filter((block) => block.trim().startsWith("(net"));
    const firstNet = netBlocks.find((block) => block.includes('(code "1")'));
    expect(firstNet).toBeDefined();
    expect(firstNet).toContain('(ref "V1")');
    expect(firstNet).toContain('(ref "R1")');
  });

  it("produces valid balanced parentheses", () => {
    const net = buildKicadNetlist(parts, graph, "test-project");
    const opens = (net.match(/\(/g) ?? []).length;
    const closes = (net.match(/\)/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
