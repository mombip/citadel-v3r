/**
 * Pixel comparison of the reference (original) and new screenshot sets.
 * Both images are drawn at the reference size (1600 px wide, cropped to the shorter height) and compared
 * per pixel; a pixel "differs" when any RGB channel differs by more than 40. Prints the share of matching pixels.
 *
 * Usage: npx tsx scripts/compare-pixels.ts [refDir] [newDir]
 */
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const refDir = process.argv[2] || "tests/e2e/screenshots/reference";
const newDir = process.argv[3] || "tests/e2e/screenshots/new";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");

const COMPARE = `async ([a, b]) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = ia.naturalWidth, h = Math.min(ia.naturalHeight, ib.naturalHeight);
  const draw = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, img.naturalHeight * w / img.naturalWidth); return x.getImageData(0, 0, w, h).data; };
  const da = draw(ia), db = draw(ib);
  let same = 0; const n = w * h;
  for (let k = 0; k < da.length; k += 4) {
    if (Math.abs(da[k] - db[k]) <= 40 && Math.abs(da[k + 1] - db[k + 1]) <= 40 && Math.abs(da[k + 2] - db[k + 2]) <= 40) same++;
  }
  return { same: same / n, height: h };
}`;

const rows: [string, number][] = [];
for (const f of readdirSync(refDir).filter((x) => x.endsWith(".png")).sort()) {
  const other = join(newDir, f);
  if (!existsSync(other)) continue;
  const a = "data:image/png;base64," + readFileSync(join(refDir, f)).toString("base64");
  const b = "data:image/png;base64," + readFileSync(other).toString("base64");
  const r: any = await page.evaluate(`(${COMPARE})(${JSON.stringify([a, b])})`);
  rows.push([f, r.same]);
  console.log(`${f.padEnd(34)} ${(r.same * 100).toFixed(1).padStart(5)} % matching pixels (first ${r.height}px)`);
}
const avg = rows.reduce((s, [, v]) => s + v, 0) / rows.length;
console.log(`\nAverage: ${(avg * 100).toFixed(1)} % over ${rows.length} screens`);
await browser.close();
