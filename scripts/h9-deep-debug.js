// Deep debug H9: compare standalone vs pipeline in same process
const { readFileSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");
const { detectGridLines, extractGrayscale, recognizeBoard } = require("../lib/ocr");
const { matchBigDigit, reloadTemplates } = require("../lib/template-match");
const { BoardState } = require("../lib/board");

const BASE = join(__dirname, "..", "..", "..");
const buf = readFileSync(join(BASE, "images", "x", "435.png"));
const png = PNG.sync.read(buf);
const data = png.data;
const w = png.width;
const h = png.height;

reloadTemplates();

(async () => {
  // ── Standalone: exact same extraction ──
  const grid = detectGridLines(data, w, h);
  const hL = grid.horizontal.slice(0, 10);
  const vL = grid.vertical.slice(0, 10);
  const r = 7, c = 8;
  const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
  const cellW = x2 - x1, cellH = y2 - y1;
  const inset = Math.max(2, cellW * 0.12);
  const cx1 = x1 + inset, cy1 = y1 + inset, cx2 = x2 - inset, cy2 = y2 - inset;
  const px = extractGrayscale(data, w, cx1, cy1, cx2, cy2);
  const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

  console.log("=== Standalone (lib) ===");
  console.log("cell:", Math.round(x1), Math.round(y1), Math.round(cellW) + "x" + Math.round(cellH));
  console.log("bw=" + bw + " bh=" + bh);
  console.log("core:", JSON.stringify(matchBigDigit(px, bw, bh)));
  console.log("big:", JSON.stringify(matchBigDigit(px, bw, bh, "big")));

  // ── Full pipeline ──
  console.log("\n=== Full pipeline (lib) ===");
  const ocr = await recognizeBoard(buf, null);
  const board = BoardState.fromOCR(ocr);
  console.log("H9:", board.getValue(7, 8));
  console.log("row H:", Array.from({ length: 9 }, (_, ci) => board.getValue(7, ci) || ".").join(" "));

  // ── Re-test standalone after pipeline (check state mutation) ──
  console.log("\n=== Standalone AFTER pipeline ===");
  const px2 = extractGrayscale(data, w, cx1, cy1, cx2, cy2);
  console.log("core:", JSON.stringify(matchBigDigit(px2, bw, bh)));
  console.log("big:", JSON.stringify(matchBigDigit(px2, bw, bh, "big")));
})();
