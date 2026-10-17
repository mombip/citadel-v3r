/**
 * Builds side-by-side contact sheets (original | new) for every screenshot pair, 4 pairs per sheet,
 * into tests/e2e/results/sheets. Each pair shows the first 1000 px of both screens.
 * Usage: npx tsx scripts/contact-sheets.ts [refDir] [newDir]
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const refDir = process.argv[2] || "tests/e2e/screenshots/reference";
const newDir = process.argv[3] || "tests/e2e/screenshots/new";
const out = "tests/e2e/results/sheets";
mkdirSync(out, { recursive: true });
const files = readdirSync(refDir).filter((f) => f.endsWith(".png") && existsSync(join(newDir, f))).sort();
const uri = (p: string) => "data:image/png;base64," + readFileSync(p).toString("base64");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1640, height: 800 } });
for (let i = 0; i < files.length; i += 4) {
  const chunk = files.slice(i, i + 4);
  const html = chunk
    .map((f) => `<div class="pair"><div class="t">${f} — oryginał | nowa</div><div class="row">
      <div class="crop"><img src="${uri(join(refDir, f))}"></div><div class="crop"><img src="${uri(join(newDir, f))}"></div></div></div>`)
    .join("");
  await page.setContent(`<style>body{margin:0;background:#222;font:14px sans-serif;color:#fff}.pair{padding:6px}.t{padding:2px 4px}
    .row{display:flex;gap:8px}.crop{width:800px;height:500px;overflow:hidden;border:1px solid #555}.crop img{width:800px}</style>${html}`);
  await page.waitForTimeout(300);
  const name = `sheet-${String(i / 4 + 1).padStart(2, "0")}.png`;
  await page.screenshot({ path: join(out, name), fullPage: true });
  console.log(name, chunk.join(", "));
}
await browser.close();
