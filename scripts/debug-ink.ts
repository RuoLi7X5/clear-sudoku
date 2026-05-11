/**
 * 调试墨迹计数 — 看每个水印的 estimatedChars vs 实际字符数
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

function grayAt(d: Uint8Array, iw: number, x: number, y: number): number {
  const idx = (Math.round(y) * iw + Math.round(x)) * 4;
  return Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
}

async function main() {
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const g = Array.from({ length: 9 }, () => Array(9).fill(0));
  g[0][0] = 5; g[0][1] = 3;
  const d = Array.from({ length: 9 }, () => Array(9).fill(0));
  const c = BoardState.computeStandardCandidates(g, d);

  const tests = ['421', 'dd-65', 'AB-12', 'x-9', 'abc', 'A1b-2C', 'DD-88', 'Test', 'Hi-42'];

  for (const wm of tests) {
    const b = new BoardState(g, d, c.map(r => r.map(c => new Set(c))));
    b.watermark = wm;
    const buf = await renderer.renderResult(b);
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;

    const WMX = 28, WMY = 930, wmH = 16, wmW = 200;

    // Compute projection
    const proj: number[] = [];
    for (let x = 0; x < wmW; x++) {
      let dark = 0;
      for (let y = 0; y < wmH; y++) {
        const gray = grayAt(data, imgW, WMX + x, WMY + y);
        // Using same logic as ocr.ts: wmPixels[y][x] > 80 means inverted > 80, i.e. gray < 175
        if (gray < 175) dark++;
      }
      proj.push(dark);
    }
    const projMax = Math.max(...proj);

    // Sweep thresholds
    const results: string[] = [];
    for (const thresh of [0.08, 0.10, 0.12, 0.15, 0.18, 0.20]) {
      let count = 0, inC = false, lastEnd = 0;
      for (let x = 0; x < wmW; x++) {
        if (proj[x] > projMax * thresh && !inC) { inC = true; }
        else if (proj[x] <= projMax * thresh && inC) {
          if (x - lastEnd >= 3) { count++; lastEnd = x; }
          inC = false;
        }
      }
      if (inC && wmW - lastEnd >= 3) count++;
      results.push(`thr${thresh}=${count}`);
    }

    console.log(`  ${wm.padEnd(10)} actual=${wm.length} projMax=${projMax} | ${results.join(" ")}`);
  }
}

main();
