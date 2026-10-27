import { expect, test, type Page } from "@playwright/test";

/**
 * Critical flows only. Each one covers something the jsdom component tests structurally cannot:
 * real canvas rendering, real wheel events, and the full load -> analyse -> export loop against the
 * production bundle.
 */

/** Opens the library and loads a preset by the text on its row. */
async function loadPreset(page: Page, name: string | RegExp, group?: string) {
  await page.getByRole("button", { name: "템플릿/블록" }).click();
  if (group) {
    const header = page.getByRole("button", { name: new RegExp(group) });
    if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  }
  await page.getByRole("button", { name }).first().click();
}

const partsOnCanvas = (page: Page) => page.locator("g[data-part-id]");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // Each test starts from a clean slate: the editor autosaves to localStorage, so without this a
  // previous test's circuit would leak in.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("loads a preset and renders it on the canvas", async ({ page }) => {
  await expect(page.getByText(/회로가 비어 있습니다/)).toBeVisible();

  await loadPreset(page, /TS9 스타일 오버드라이브/);

  await expect(partsOnCanvas(page)).not.toHaveCount(0);
  await expect(page.getByText(/템플릿 로드됨/)).toBeVisible();
  // The output node is resolved automatically, which is what makes the analysis tabs work at all.
  await expect(page.locator("#output-node-select")).not.toHaveValue("");
});

test("runs a simulation from a built-in signal and offers playback", async ({ page }) => {
  await loadPreset(page, /다이오드 클리퍼 \(대칭\)/);

  await page.getByRole("button", { name: "단음 (감쇠)" }).click();
  await page.getByRole("button", { name: "시뮬레이션 실행" }).click();

  await expect(page.getByText("시뮬레이션 완료", { exact: false })).toBeVisible({ timeout: 60_000 });
  // No convergence warning: the warm-started solver should settle on every sample here.
  await expect(page.getByText(/수렴 실패/)).toHaveCount(0);

  await page.getByRole("tab", { name: "파형" }).click();
  // Named after the trace it acts on, so the assertion also checks the label is meaningful.
  await expect(page.getByRole("button", { name: /지점 소리 비교 재생/ }).first()).toBeVisible();
});

test("reports why a broken circuit does nothing, and clears once it is fixed", async ({ page }) => {
  await page.getByRole("button", { name: "저항", exact: true }).click();
  await page.getByRole("tab", { name: "검사" }).click();

  await expect(page.getByText(/접지가 없습니다/)).toBeVisible();
  await expect(page.getByText(/입력 신호원이 없습니다/)).toBeVisible();

  await loadPreset(page, /다이오드 클리퍼 \(대칭\)/);
  await expect(page.getByText(/문제 없음/)).toBeVisible();
});

test("wheel over the canvas zooms instead of scrolling the page", async ({ page }) => {
  await loadPreset(page, /TS9 스타일 오버드라이브/);

  // A loaded preset is fitted to the frame, so the starting zoom depends on the window size.
  const zoomLabel = page.locator(".canvas-zoom-controls span");
  const before = await zoomLabel.textContent();

  await page.locator(".canvas-frame svg").hover();
  await page.mouse.wheel(0, -200);

  await expect(zoomLabel).not.toHaveText(before ?? "");
  // The page itself must not have moved - that was the bug the passive-listener fix addressed.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("sweeps a knob and draws one curve per position", async ({ page }) => {
  await loadPreset(page, /싱글 픽업 \+ 볼륨 \+ 톤/, "기타 배선");

  await page.getByRole("tab", { name: "노브 스윕" }).click();
  // The option value is the part id.
  await page.locator("#sweep-target-select").selectOption("TONE");

  await expect(page.locator(".sweep-legend-item")).toHaveCount(5);
});

test("exports a KiCad netlist for the loaded circuit", async ({ page }) => {
  await loadPreset(page, /다이오드 클리퍼 \(대칭\)/);
  await page.getByRole("tab", { name: "PCB" }).click();

  // The downloaded file is the deliverable, so the test reads it rather than trusting the button.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: ".net 파일 다운로드" }).click(),
  ]);
  const stream = await download.createReadStream();
  const netlist = await new Promise<string>((resolve, reject) => {
    let text = "";
    stream.on("data", (chunk) => (text += chunk));
    stream.on("end", () => resolve(text));
    stream.on("error", reject);
  });

  expect(netlist).toContain("(export");
  expect(netlist).toContain("(components");
  expect(netlist).toContain("(nets");
  // The clipper's diodes must survive into the export, not just the passives.
  expect(netlist).toMatch(/\(ref "?D1"?/);
});

test("probes a preset's signal path and shows each point's spectrum after a run", async ({ page }) => {
  await loadPreset(page, /TS9 스타일 오버드라이브/);

  // The preset's own tap nodes arrive as probes - drawn on the canvas and listed in the sidebar.
  const markers = page.locator("g[data-probe-id]");
  await expect(markers).toHaveCount(3);
  await expect(page.locator(".probe-row")).toHaveCount(3);

  // Frequency response overlays one curve per probe plus the output.
  await page.getByRole("tab", { name: /주파수 응답/ }).click();
  await expect(page.locator(".sweep-legend-item")).not.toHaveCount(0);

  // Probe mode: clicking a probed terminal again removes that probe.
  await page.getByRole("button", { name: "프로브", exact: true }).click();
  await expect(page.getByRole("button", { name: "프로브", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Markers ignore pointer events, so a click on one lands on the probed terminal underneath.
  const ring = await markers.first().locator("circle").boundingBox();
  if (!ring) throw new Error("probe marker has no box");
  await page.mouse.click(ring.x + ring.width / 2, ring.y + ring.height / 2);
  await expect(markers).toHaveCount(2);

  await page.getByRole("button", { name: "코드" }).click();
  await page.getByRole("button", { name: "시뮬레이션 실행" }).click();
  await expect(page.getByText("시뮬레이션 완료", { exact: false })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("tab", { name: "스펙트럼" }).click();
  await expect(page.locator(".spectrum-peaks tr")).toHaveCount(3); // dry input + 2 probes
  await expect(page.locator(".spectrum-peaks td").first()).toContainText("Hz");
});

test("shows the DC bias voltage of every node on request", async ({ page }) => {
  await loadPreset(page, /LPB-1 스타일/);
  await page.getByRole("button", { name: "DC 전압" }).click();
  await expect(page.locator("g[data-dc-net]").first()).toBeVisible();
  await expect(page.locator("g[data-dc-net] text").first()).toHaveText(/V$/);
});

test("changing a value plays a short preview of the new sound", async ({ page }) => {
  await loadPreset(page, /TS9 스타일 오버드라이브/);
  const toggle = page.getByLabel("노브 미리듣기");
  await expect(toggle).toBeChecked();

  const gain = page.locator("#input-gain-slider");
  await gain.focus();
  await page.keyboard.press("ArrowRight");

  await expect(page.getByText(/미리듣기 재생/)).toBeVisible({ timeout: 15_000 });
});

test("plays the circuit in real time and keeps playing through a knob change", async ({ page }) => {
  await loadPreset(page, /TS9 스타일 오버드라이브/);
  await page.getByRole("button", { name: "▶ 실시간 재생" }).click();
  // Stats only arrive from inside the running AudioWorklet, so seeing one proves it is solving.
  const load = page.locator(".realtime-load");
  await expect(load).toHaveText(/부하 \d+%/, { timeout: 15_000 });

  const gain = page.locator("#input-gain-slider");
  await gain.focus();
  await page.keyboard.press("ArrowRight");
  // Still live after the edit, and no preview clip was started on top of it.
  await expect(load).toBeVisible();
  await expect(page.getByText(/미리듣기 재생/)).toHaveCount(0);

  await page.getByRole("button", { name: "■ 실시간 정지" }).click();
  await expect(page.getByRole("button", { name: "▶ 실시간 재생" })).toBeVisible();
});

test("player view: turn the TS9 drive live and watch the spectrum follow", async ({ page }) => {
  await loadPreset(page, /TS9 스타일 오버드라이브/);
  await page.getByRole("button", { name: "연주", exact: true }).click();
  await page.getByRole("button", { name: "실시간 재생 (풋스위치)" }).click();
  await expect(page.getByText(/ON · 부하 \d+%/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("출력 스펙트럼 (실시간)")).toBeVisible();

  const drive = page.getByRole("slider", { name: "DRIVE 노브" });
  const box = (await drive.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 80, { steps: 8 });
  await page.mouse.up();
  await expect(drive).toHaveAttribute("aria-valuenow", "100");
  // Still playing through the drag - no preview clip took over.
  await expect(page.getByText(/ON · 부하 \d+%/)).toBeVisible();
  await expect(page.getByText(/미리듣기 재생/)).toHaveCount(0);
});

test("turns a preset into a verified stripboard and a routed PCB", async ({ page }) => {
  await loadPreset(page, /LPB-1 스타일/);
  await page.getByRole("tab", { name: /PCB/ }).click();
  await page.getByRole("button", { name: "스트립보드 생성" }).click();
  await expect(page.getByText(/역검증 통과/)).toBeVisible();
  // Placement and routing run in a worker: this also proves the worker chunk ships.
  await page.getByRole("button", { name: "PCB 생성" }).click();
  await expect(page.getByText(/✓ DRC 통과/)).toBeVisible({ timeout: 20_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: ".kicad_pcb 다운로드" }).click();
  expect((await download).suggestedFilename()).toBe("pedal.kicad_pcb");
  // The enclosure section checks the fresh board against the suggested box.
  await expect(page.getByText(/PCB .*mm → 내부 약/)).toBeVisible();
});

test("loads a preset as functional blocks, collapses them to black boxes, and turns a block knob", async ({ page }) => {
  await loadPreset(page, /Big Muff 스타일/);
  // Expanded: tinted regions over the parts.
  await expect(page.locator('g[data-block-id][data-collapsed="false"]')).toHaveCount(5);

  await page.getByRole("button", { name: "블랙박스 보기" }).click();
  await expect(page.locator('g[data-block-id][data-collapsed="true"]')).toHaveCount(5);
  // The parts inside are hidden; only the input source stays on the canvas as a part.
  await expect(page.locator("g[data-part-id]")).toHaveCount(2); // V1 and its ground symbol

  // Selecting the tone box shows its knob; turning it changes the tone (a preview is requested).
  await page.locator('g[data-block-id="tone"] rect').first().click();
  const knob = page.getByLabel("TONE 노브", { exact: true });
  await knob.focus();
  await page.keyboard.press("End");
  await expect(page.locator('g[data-block-id="tone"]')).toContainText("TONE 100%");

  // Double-click opens a block back up.
  await page.locator('g[data-block-id="tone"] rect').first().dblclick();
  await expect(page.locator('g[data-block-id="tone"][data-collapsed="false"]')).toHaveCount(1);
});

test("adds library blocks, wires their pins, and groups a selection into a new block", async ({ page }) => {
  await page.getByRole("button", { name: "템플릿/블록" }).click();
  await page.getByRole("button", { name: /기능 블록/ }).click();
  await page.getByRole("button", { name: /출력 볼륨/ }).click();
  await expect(page.locator('g[data-block-id="blk1"]')).toHaveCount(1);
  await page.getByRole("button", { name: /접기 \(블랙박스\)/ }).click();
  await expect(page.locator('g[data-block-id="blk1"][data-collapsed="true"] [data-port-id]')).toHaveCount(2);

  // Group two loose parts with Ctrl+G.
  await page.getByRole("button", { name: "소자 팔레트" }).click();
  await page.getByRole("button", { name: "저항", exact: true }).click();
  await page.getByRole("button", { name: "커패시터", exact: true }).click();
  const svg = page.locator(".canvas-frame svg");
  const box = await svg.boundingBox();
  if (!box) throw new Error("no canvas");
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + 5, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.press("Control+g");
  await expect(page.getByText(/블록으로 묶었습니다/)).toBeVisible();
  await expect(page.getByText("선택된 블록")).toBeVisible();
});

test.describe("layout editing", () => {
  // Drags need room: at the default 1280x720 the fitted canvas is small enough that handles and
  // part bodies sit under the control strip.
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("dragging a wire segment reroutes it, and the route can be reset", async ({ page }) => {
    await loadPreset(page, /TS9 스타일 오버드라이브/);
    // Click a point that is actually on a long wire's stroke (a bounding-box centre of an L-shaped
    // wire is off the wire).
    const point = await page.evaluate(() => {
      // Longest wire whose midpoint is not covered by a part's click box.
      const paths = [...document.querySelectorAll<SVGPathElement>("path[data-wire-id]")].sort((a, b) => b.getTotalLength() - a.getTotalLength());
      for (const path of paths) {
        const p = path.getPointAtLength(path.getTotalLength() / 2);
        const m = path.getScreenCTM()!;
        const x = p.x * m.a + p.y * m.c + m.e;
        const y = p.x * m.b + p.y * m.d + m.f;
        if (document.elementFromPoint(x, y) === path) return { x, y };
      }
      throw new Error("no clickable wire");
    });
    await page.mouse.click(point.x, point.y);
    await expect(page.getByText("선택된 배선")).toBeVisible();
    const handle = page.locator("rect[data-segment-handle]").first();
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error("no handle");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 40, { steps: 4 });
    await page.mouse.up();
    await page.getByRole("button", { name: "경로 초기화" }).click();
    await expect(page.getByRole("button", { name: "경로 초기화" })).toHaveCount(0);
  });

  test("auto-arrange relays the circuit out but keeps a part the user placed", async ({ page }) => {
    await loadPreset(page, /RAT 스타일/);
    const part = page.locator("g[data-part-id='Rs'] rect[fill='transparent']");
    const box = await part.boundingBox();
    if (!box) throw new Error("no part");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByLabel(/위치 고정/)).toBeChecked();

    await page.getByRole("button", { name: "자동 정렬" }).click();
    await expect(page.getByText(/직접 옮긴 부품 1개는 그 자리에/)).toBeVisible();
  });
});
