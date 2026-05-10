/**
 * 验证数字模板是否正确加载和匹配
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

async function main() {
  // Check digital template files
  const dir = join(__dirname, "..", "templates");
  console.log("Digital template files:");
  for (let d = 1; d <= 9; d++) {
    const path = join(dir, `digital_${d}.json`);
    if (existsSync(path)) {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      const count = raw.samples ? raw.samples.length : 1;
      console.log(`  digital_${d}.json: ${count} samples, w=${raw.w}, h=${raw.h}`);
    } else {
      console.log(`  digital_${d}.json: MISSING`);
    }
  }

  // Check big template files
  console.log("\nBig template files:");
  for (let d = 1; d <= 9; d++) {
    const path = join(dir, `big_${d}.json`);
    console.log(`  big_${d}.json: ${existsSync(path) ? "OK" : "MISSING"}`);
  }

  // Test template loading
  const { preloadTemplates } = require("../lib/ocr");
  preloadTemplates();

  // Access internal state to check template counts
  const tm = require("../lib/template-match");

  // Generate known board and test self-match
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );
  // Place digits 1-9 in row 0
  for (let d = 1; d <= 9; d++) { givens[0][d - 1] = d; deduced[1][d - 1] = d; }
  const board = new BoardState(givens, deduced, candidates);

  const buf = await renderer.renderResult(board);

  // Extract cell pixels manually and test against digital templates
  const { PNG } = require("pngjs");
  const png = PNG.sync.read(buf);
  const data = png.data as Uint8Array;

  const { detectGridLines, extractGrayscale } = require("../lib/ocr");
  const { matchBigDigit } = require("../lib/template-match");

  const grid = detectGridLines(data, png.width, png.height);
  const hLines = grid.horizontal.slice(0, 10);
  const vLines = grid.vertical.slice(0, 10);
  console.log(`\nScaled grid: H=${hLines.map(v=>Math.round(v)).join(",")}`);

  console.log("\nSelf-match test (digits from rendered image vs digital templates):");
  for (let row = 0; row < 2; row++) {
    for (let d = 1; d <= 9; d++) {
      const c = d - 1;
      const r = row;
      const x1 = vLines[c], y1 = hLines[r];
      const x2 = vLines[c + 1], y2 = hLines[r + 1];
      const cellW = x2 - x1, cellH = y2 - y1;
      const inset = Math.max(2, cellW * 0.12);
      const cx1 = x1 + inset, cy1 = y1 + inset;
      const cx2 = x2 - inset, cy2 = y2 - inset;
      const pixels = extractGrayscale(data, png.width, cx1, cy1, cx2, cy2);
      const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

      const result = matchBigDigit(pixels, bw, bh);
      const ok = result.digit === d ? "OK" : `MISMATCH (got ${result.digit}, conf=${result.confidence.toFixed(2)})`;
      if (result.digit !== d) {
        console.log(`  [${r},${c}] digit=${d} → ${ok}`);
      }
    }
  }
  console.log("  (only mismatches shown)");
}

main().catch(e => { console.error(e); process.exit(1); });
