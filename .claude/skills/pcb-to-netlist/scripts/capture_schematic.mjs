// Capture the loaded schematic at high resolution. Needs the dev server on :5173 and Playwright.
// Usage (from apps/web): node <path>/capture_schematic.mjs <outDir> "<library row name>" <prefix>
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { chromium } = require("@playwright/test");

const [outDir, buttonName, prefix] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 1500 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5173/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.getByRole("button", { name: buttonName }).first().click();
await page.waitForTimeout(2500);
const fit = page.getByRole("button", { name: "화면 맞춤" });
if (await fit.count()) await fit.first().click();
await page.waitForTimeout(800);
const svg = page.locator("svg").filter({ has: page.locator("g") }).first();
const boxes = await page.$$eval("svg", (els) => els.map((e) => ({ n: e.querySelectorAll("*").length })));
const idx = boxes.reduce((best, b, i) => (b.n > boxes[best].n ? i : best), 0);
await page.locator("svg").nth(idx).screenshot({ path: `${outDir}/${prefix}_schematic.png` });
await page.screenshot({ path: `${outDir}/${prefix}_editor.png` });
console.log("saved", prefix, svg ? "ok" : "");
await browser.close();
