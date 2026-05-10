/**
 * 生成水印数字模板 — 16px 红色系统字体
 * 用法: cd external/clear-sudoku && npx ts-node scripts/generate-watermark-templates.ts
 */
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

const TPL_DIR = join(__dirname, "..", "templates");
const TPL_W = 12, TPL_H = 16;

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = Math.round(y) * imgW * 4 + Math.round(x) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function scaleTo(input: number[][], iW: number, iH: number, oW: number, oH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < oH; y++) {
    const row: number[] = [], sY = y / oH * iH, y0 = Math.floor(sY), y1 = Math.min(y0 + 1, iH - 1), yF = sY - y0;
    for (let x = 0; x < oW; x++) {
      const sX = x / oW * iW, x0 = Math.floor(sX), x1 = Math.min(x0 + 1, iW - 1), xF = sX - x0;
      const v00 = input[y0]?.[x0] ?? 0, v10 = input[y0]?.[x1] ?? 0, v01 = input[y1]?.[x0] ?? 0, v11 = input[y1]?.[x1] ?? 0;
      row.push((v00 * (1 - xF) + v10 * xF) * (1 - yF) + (v01 * (1 - xF) + v11 * xF) * yF);
    }
    out.push(row);
  }
  return out;
}

async function main() {
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Render boards with different watermarks to collect samples
  const WATERMARKS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "00","11","22","33","44","55","66","77","88","99"];

  // Simple empty board
  const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );

  const samples = new Map<string, number[][][]>();
  for (let d = 0; d <= 9; d++) samples.set(String(d), []);

  for (const wm of WATERMARKS) {
    const board = new BoardState(givens, deduced, candidates);
    board.watermark = wm;
    const buf = await renderer.renderResult(board);
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;

    // Watermark position: x=28, y=930, 16px height
    const wmX = 28, wmY = 930, wmRowH = 16;
    const charW = 10; // digit width in 16px font

    for (let ci = 0; ci < wm.length; ci++) {
      const digit = wm[ci];
      const cx = wmX + ci * charW;
      const px: number[][] = [];
      for (let y = 0; y < wmRowH; y++) {
        const row: number[] = [];
        for (let x = 0; x < charW; x++)
          row.push(255 - grayAt(data, png.width, cx + x, wmY + y));
        px.push(row);
      }
      const scaled = scaleTo(px, charW, wmRowH, TPL_W, TPL_H);
      samples.get(digit)!.push(scaled);
    }
  }

  // Average and save
  console.log("生成水印模板:");
  if (!existsSync(TPL_DIR)) mkdirSync(TPL_DIR, { recursive: true });

  for (let d = 0; d <= 9; d++) {
    const list = samples.get(String(d))!;
    if (list.length === 0) continue;

    // Average across samples
    const avg: number[][] = [];
    let darkCount = 0;
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < TPL_W; x++) {
        let sum = 0;
        for (const s of list) sum += s[y]?.[x] ?? 0;
        const v = Math.round(sum / list.length);
        row.push(v);
        if (v > 128) darkCount++;
      }
      avg.push(row);
    }

    writeFileSync(join(TPL_DIR, `wm_${d}.json`), JSON.stringify({
      digit: d, w: TPL_W, h: TPL_H,
      pixels: avg, darkCount, sampleCount: list.length,
    }));
    console.log(`  wm_${d}.json (${list.length}样本)`);
  }
  console.log("完成！");
}

main().catch(e => { console.error(e); process.exit(1); });
