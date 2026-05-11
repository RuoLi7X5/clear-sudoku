/**
 * 生成水印字母模板 v3 — 和数字模板完全相同的流程
 * 固定 10×16 提取 + 缩放到 12×16
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const TEMPLATE_DIR = join(__dirname, "..", "templates");
const CHAR_W = 10, TPL_W = 12, TPL_H = 16;
const CHAR_W_UPPER = 15, TPL_W_UPPER = 16;

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
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );

  // Generate templates for a-z, A-Z, and dash
  const chars: Array<{ char: string; filename: string }> = [];
  for (let code = 97; code <= 122; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wm_${String.fromCharCode(code)}.json` });
  }
  for (let code = 65; code <= 90; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wmu_${String.fromCharCode(code)}.json` });
  }
  chars.push({ char: "-", filename: "wm_dash.json" });

  console.log(`生成 ${chars.length} 个水印模板 (${CHAR_W}×${TPL_H} → ${TPL_W}×${TPL_H})...`);

  for (const { char, filename } of chars) {
    const board = new BoardState(givens, deduced, candidates);
    board.watermark = char;
    const buf = await renderer.renderResult(board);
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;

    // Uppercase letters use wider extraction window (14px vs 10px)
    const isUpper = char >= 'A' && char <= 'Z';
    const cw = isUpper ? CHAR_W_UPPER : CHAR_W;
    const tw = isUpper ? TPL_W_UPPER : TPL_W;

    const wmX = 28, wmY = 930;
    const px: number[][] = [];
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < cw; x++)
        row.push(255 - grayAt(data, imgW, wmX + x, wmY + y));
      px.push(row);
    }

    const scaled = scaleTo(px, cw, TPL_H, tw, TPL_H);

    let darkCount = 0;
    for (const row of scaled) for (const v of row) if (v > 128) darkCount++;

    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: tw, h: TPL_H, char, pixels: scaled, darkCount,
      samples: [{ pixels: scaled, darkCount }],
    }, null, 2));
  }

  console.log(`完成。${chars.length} 个模板 → templates/`);
}

main();
