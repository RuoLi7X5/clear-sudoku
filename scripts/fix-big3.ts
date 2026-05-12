import { readFileSync, writeFileSync } from "fs"; import { join } from "path";
import { PNG } from "pngjs";
import { detectGridLines, extractGrayscale } from "../src/ocr";
import { scaleTo, reloadTemplates } from "../src/template-match";

const BASE = join(__dirname, "..", "..", "..");
const buf = readFileSync(join(BASE, "images", "x", "435.png"));
const png = PNG.sync.read(buf); const data = png.data; const w = png.width; const h = png.height;
const grid = detectGridLines(data, w, h);
const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

// H9: row 7, col 8 (should be 3)
const r = 7, c = 8;
const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
const inset = Math.max(2, (x2 - x1) * 0.12);
const px = extractGrayscale(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
const scaled = scaleTo(px, px[0]?.length || 1, px.length, 24, 36);
let dc = 0; for (const row of scaled) for (const v of row) if (v > 128) dc++;

const tpl = JSON.parse(readFileSync(join(__dirname, "..", "templates", "big_3.json"), "utf-8"));
tpl.samples.push({ pixels: scaled, darkCount: dc });
writeFileSync(join(__dirname, "..", "templates", "big_3.json"), JSON.stringify(tpl, null, 2));
console.log("big_3: +1 sample (total " + tpl.samples.length + "), darkCount=" + dc);
