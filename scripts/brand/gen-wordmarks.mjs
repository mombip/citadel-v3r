// Brand assets for Citadel for NG: the wordmark as pure SVG paths (Noto Serif Italic, matched to the original
// 1024×1024 proposal), five colour variants, the "C" app icon, and the one-line wordmark with a yellow dot over the "i"
// used in the UI. Run from the repository root:  node scripts/brand/gen-wordmarks.mjs
import opentype from "opentype.js";
import { mkdirSync, writeFileSync } from "node:fs";

const font = opentype.loadSync("node_modules/@fontsource/noto-serif/files/noto-serif-latin-400-italic.woff");

/** Glyph runs of `text`, scaled so the ink spans [left, right] with the baseline at `baseline`. */
function layout(text, left, right, baseline) {
  const bb1 = font.getPath(text, 0, 0, 1000).getBoundingBox();
  const size = (1000 * (right - left)) / (bb1.x2 - bb1.x1);
  const bb = font.getPath(text, 0, 0, size).getBoundingBox();
  let x = left - bb.x1;
  const glyphs = font.stringToGlyphs(text);
  const runs = glyphs.map((g, i) => {
    const path = g.getPath(x, baseline, size);
    const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    x += ((g.advanceWidth + kern) * size) / font.unitsPerEm;
    return { ch: text[i], d: path.toPathData(2), box: path.getBoundingBox() };
  });
  return { size, runs, d: runs.map((r) => r.d).join("") };
}

// Measured from the supplied 1024×1024 proposal: ink extents and baselines.
const C = layout("Citadel", 78, 945, 507);
const F = layout("for NG", 255, 772, 688);
const NAVY = "#0b0d2b", INK = "#ededed";
const V = "#7c3aed", VD = "#4c1d95", VL = "#c4b5fd", G = "#22c55e", Y = "#facc15";
const fmt = (n) => n.toFixed(1);
const forD = F.runs.slice(0, 3).map((r) => r.d).join("");
const ngD = F.runs.slice(4).map((r) => r.d).join("");
const top = Math.min(...C.runs.map((r) => r.box.y1));
console.log("Citadel ink top", fmt(top), "size", fmt(C.size), "| for NG size", fmt(F.size));

const svg = (body, bg, title = "Citadel for NG") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>${title}</title>${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}${body}</svg>`;

// Coin replacing the dot of "i": the dot is the part of the i glyph above x-height.
const iRun = C.runs[1];
const xHeightTop = C.runs[3].box.y1; // top of "a" ≈ x-height
const dotCx = (() => {
  // the dot sits at the upper-right of the i box (italic slant)
  return iRun.box.x2 - (iRun.box.x2 - iRun.box.x1) * 0.28;
})();
const dotCy = (iRun.box.y1 + xHeightTop) / 2 - 6;

const coin = (cx, cy, r) =>
  `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="${Y}"/><rect x="${fmt(cx - r * 0.45)}" y="${fmt(cy - r * 0.16)}" width="${fmt(r * 0.9)}" height="${fmt(r * 0.32)}" rx="${fmt(r * 0.1)}" fill="${VD}"/>`;

const variants = {
  "01-oryginal": {
    name: "Oryginał", note: "Wierne odwzorowanie przesłanej propozycji: Noto Serif Italic zamieniony na krzywe, wymiary i linie bazowe zmierzone z pliku 1024×1024.",
    svg: svg(`<path fill="${INK}" d="${C.d}"/><path fill="${INK}" d="${F.d}"/>`, NAVY),
  },
  "02-fiolet-zloto": {
    name: "Fiolet i złoto", note: "Ten sam znak na fioletowym tle aplikacji. „for” w jasnym fiolecie, „NG” w żółtym progu KDI 1.20.",
    svg: svg(`<defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${VD}"/><stop offset="1" stop-color="#1e0b4b"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g2)"/><path fill="#f5f0ff" d="${C.d}"/><path fill="${VL}" d="${forD}"/><path fill="${Y}" d="${ngD}"/>`, null),
  },
  "03-moneta": {
    name: "Moneta nad i", note: "Kropka nad „i” zamieniona w żółtą monetę z wybranego znaku „Głos”. „for NG” w zieleni prawa głosu.",
    svg: svg(`<clipPath id="c3"><rect x="0" y="${fmt(xHeightTop - 4)}" width="1024" height="${fmt(1024 - xHeightTop)}"/></clipPath>` +
      C.runs.map((r, i) => `<path fill="${INK}" d="${r.d}"${i === 1 ? ' clip-path="url(#c3)"' : ""}/>`).join("") +
      coin(dotCx, dotCy, 27) + `<path fill="${G}" d="${F.d}"/>`, NAVY),
  },
  "04-pasek-kdi": {
    name: "Pasek skali KDI", note: "Pod napisem pochylony pasek w barwach skali KDI: zieleń nadpłaty, żółty próg i fiolet zadłużenia.",
    svg: svg(`<path fill="${INK}" d="${C.d}"/><path fill="${INK}" d="${F.d}"/><g transform="translate(512 770) skewX(-14)"><rect x="-260" y="0" width="250" height="16" rx="8" fill="${G}"/><rect x="0" y="0" width="80" height="16" rx="8" fill="${Y}"/><rect x="90" y="0" width="170" height="16" rx="8" fill="${V}"/></g>`, NAVY),
  },
  "05-jasny": {
    name: "Wersja jasna", note: "Na białe tło dokumentów i wydruków: granat z oryginału, „for NG” w fiolecie aplikacji.",
    svg: svg(`<path fill="${NAVY}" d="${C.d}"/><path fill="${V}" d="${F.d}"/>`, "#ffffff"),
  },
  "06-ikona-c": {
    name: "Ikona C", note: "Inicjał „C” tym samym krojem jako ikona aplikacji i favicona, z żółtą monetą znaku „Głos”.",
    svg: (() => {
      const c = layout("C", 250, 720, 790);
      return svg(`<rect x="32" y="32" width="960" height="960" rx="210" fill="${NAVY}"/><path fill="${INK}" d="${c.d}"/>${coin(770, 735, 80)}`, null, "Citadel");
    })(),
  },
};

const OUT = "web/public/brand";
mkdirSync(OUT, { recursive: true });
for (const [k, v] of Object.entries(variants)) writeFileSync(`${OUT}/wordmark-${k}.svg`, v.svg);
writeFileSync(`${OUT}/variants.json`, JSON.stringify(variants));
writeFileSync("web/public/logo.svg", variants["06-ikona-c"].svg);
writeFileSync("web/public/citadel-wordmark.svg", variants["01-oryginal"].svg);

// ---------------------------------------------------------------- one-line UI wordmark with a yellow "i" dot
/** Splits an opentype path into contours (each starts with M). */
function contours(path) {
  const out = [];
  for (const c of path.commands) {
    if (c.type === "M") out.push(new opentype.Path());
    out[out.length - 1].commands.push(c);
  }
  return out;
}
const SIZE = 100;
const line = "Citadel for NG";
const glyphs = font.stringToGlyphs(line);
let pen = 0;
const parts = [];
let dot = null;
glyphs.forEach((g, i) => {
  const path = g.getPath(pen, 0, SIZE);
  if (i === 1) {
    // "i": the contour with the highest top is the dot — replace it with a yellow circle.
    const cs = contours(path).map((c) => ({ c, b: c.getBoundingBox() })).sort((a, b) => a.b.y1 - b.b.y1);
    const d = cs[0].b;
    dot = { cx: (d.x1 + d.x2) / 2, cy: (d.y1 + d.y2) / 2, r: Math.max(d.x2 - d.x1, d.y2 - d.y1) / 2 * 1.15 };
    cs.slice(1).forEach(({ c }) => parts.push(c.toPathData(2)));
  } else parts.push(path.toPathData(2));
  const kern = i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) : 0;
  pen += ((g.advanceWidth + kern) * SIZE) / font.unitsPerEm;
});
const all = font.getPath(line, 0, 0, SIZE).getBoundingBox();
const pad = 2;
const box = { x: all.x1 - pad, y: Math.min(all.y1, dot.cy - dot.r) - pad, w: all.x2 - all.x1 + 2 * pad, h: 0 };
box.h = all.y2 + pad - box.y;
const r1 = (n) => Math.round(n * 100) / 100;
const inline = {
  viewBox: [box.x, box.y, box.w, box.h].map(r1).join(" "),
  d: parts.join(""),
  dot: { cx: r1(dot.cx), cy: r1(dot.cy), r: r1(dot.r) },
  dotColor: Y,
};
// ---------------------------------------------------------------- two-line wordmark (login page), as in the original proposal
const stackedParts = [];
let stackedDot = null;
C.runs.forEach((r, i) => {
  if (i !== 1) return stackedParts.push(r.d);
  const g = font.charToGlyph("i");
  // Rebuild the "i" path at its laid-out position to separate the dot contour.
  const iPath = new opentype.Path();
  const origin = r.box.x1 - g.getPath(0, 0, C.size).getBoundingBox().x1;
  iPath.commands = g.getPath(origin, 507, C.size).commands;
  const cs = contours(iPath).map((c) => ({ c, b: c.getBoundingBox() })).sort((a, b) => a.b.y1 - b.b.y1);
  const d = cs[0].b;
  stackedDot = { cx: (d.x1 + d.x2) / 2, cy: (d.y1 + d.y2) / 2, r: (Math.max(d.x2 - d.x1, d.y2 - d.y1) / 2) * 1.15 };
  cs.slice(1).forEach(({ c }) => stackedParts.push(c.toPathData(2)));
});
stackedParts.push(F.d);
const inked = [...C.runs, ...F.runs].filter((r) => r.ch.trim() && r.box.x2 > r.box.x1); // skip the space
const sx1 = Math.min(...inked.map((r) => r.box.x1)) - 4;
const sx2 = Math.max(...inked.map((r) => r.box.x2)) + 4;
const sy1 = Math.min(...C.runs.map((r) => r.box.y1), stackedDot.cy - stackedDot.r) - 4;
const sy2 = Math.max(...F.runs.map((r) => r.box.y2)) + 4;
const stacked = {
  viewBox: [sx1, sy1, sx2 - sx1, sy2 - sy1].map(r1).join(" "),
  d: stackedParts.join(""),
  dot: { cx: r1(stackedDot.cx), cy: r1(stackedDot.cy), r: r1(stackedDot.r) },
  dotColor: Y,
};
writeFileSync(`${OUT}/citadel-wordmark-stacked.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${stacked.viewBox}"><title>Citadel for NG</title><path fill="${INK}" d="${stacked.d}"/><circle cx="${stacked.dot.cx}" cy="${stacked.dot.cy}" r="${stacked.dot.r}" fill="${Y}"/></svg>`);

writeFileSync("web/src/lib/wordmark.ts",
  "// Generated by scripts/brand/gen-wordmarks.mjs — one-line \"Citadel for NG\" in Noto Serif Italic as paths, with a yellow dot over the \"i\".\n" +
  "export const WORDMARK = " + JSON.stringify(inline) + " as const;\n" +
  "export const WORDMARK_STACKED = " + JSON.stringify(stacked) + " as const;\n");
writeFileSync(`${OUT}/citadel-wordmark-inline.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${inline.viewBox}"><title>Citadel for NG</title><path fill="${INK}" d="${inline.d}"/><circle cx="${inline.dot.cx}" cy="${inline.dot.cy}" r="${inline.dot.r}" fill="${Y}"/></svg>`);
console.log("inline wordmark viewBox", inline.viewBox, "dot", inline.dot);
console.log("wrote", Object.keys(variants).length, "variants");
