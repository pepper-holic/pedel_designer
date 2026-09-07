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

  const zoomLabel = page.locator(".canvas-zoom-controls span");
  await expect(zoomLabel).toHaveText("100%");

  await page.locator(".canvas-frame svg").hover();
  await page.mouse.wheel(0, -200);

  await expect(zoomLabel).not.toHaveText("100%");
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
