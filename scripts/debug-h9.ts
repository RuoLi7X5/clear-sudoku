import { readFileSync } from "fs"; import { join } from "path";
import { PNG } from "pngjs";
import { detectGridLines, extractGrayscale, recognizeBoard } from "../src/ocr";
import { matchBigDigit, reloadTemplates } from "../src/template-match";
import { BoardState } from "../src/board";

const BASE = join(__dirname, "..", "..", "..");
const buf = readFileSync(join(BASE, "images", "x", "435.png"));
const png = PNG.sync.read(buf);
const data = png.data; const w = png.width; const h = png.height;
reloadTemplates();

// ── Standalone: exact same extraction as recognizeBoard ──
const grid = detectGridLines(data, w, h);
const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);
const r = 7, c = 8;
const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
const cellW = x2 - x1, cellH = y2 - y1;
const inset = Math.max(2, cellW * 0.12);
const cx1 = x1 + inset, cy1 = y1 + inset, cx2 = x2 - inset, cy2 = y2 - inset;
const px = extractGrayscale(data, w, cx1, cy1, cx2, cy2);
const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

console.log("=== Standalone ===");
console.log("cell: x=" + Math.round(x1) + " y=" + Math.round(y1) + " size=" + Math.round(cellW) + "x" + Math.round(cellH));
console.log("extract: bw=" + bw + " bh=" + bh);
let mv = 0; for (const row of px) for (const v of row) if (v > mv) mv = v;
console.log("maxVal=" + mv);
console.log("core:", JSON.stringify(matchBigDigit(px, bw, bh)));
console.log("big:", JSON.stringify(matchBigDigit(px, bw, bh, "big")));

// ── Full pipeline ──
(async () => {
console.log("\n=== Full pipeline ===");
const ocr = await recognizeBoard(buf, null);
const board = BoardState.fromOCR(ocr);
console.log("H9 value=" + board.getValue(7, 8));
console.log("row H:", Array.from({ length: 9 }, (_, ci) => board.getValue(7, ci) || ".").join(" "));
})();
