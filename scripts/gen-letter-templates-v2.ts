/**
 * 生成水印字母模板 v2 —— 用实际渲染路径保证像素一致性
 * 渲染含单个字母水印的盘面，从水印位置精确提取
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const TEMPLATE_DIR = join(__dirname, "..", "templates");

function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const mockCtx = {
    logger: (n: string) => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx as any);

  const emptyGivens = Array.from({ length: 9 }, () => Array(9).fill(0));
  const emptyDeduced = Array.from({ length: 9 }, () => Array(9).fill(0));
  const emptyCands = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>())
  );

  const chars: Array<{ char: string; filename: string }> = [];
  // Lowercase a-z
  for (let code = 97; code <= 122; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wm_${String.fromCharCode(code)}.json` });
  }
  // Uppercase A-Z
  for (let code = 65; code <= 90; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wmu_${String.fromCharCode(code)}.json` });
  }
  // Dash
  chars.push({ char: "-", filename: "wm_dash.json" });

  (async () => {
    for (const { char, filename } of chars) {
      const board = new BoardState(emptyGivens, emptyDeduced, emptyCands);
      board.watermark = char;

      const buf = await renderer.renderResult(board);
      const { PNG } = require("pngjs");
      const png = PNG.sync.read(buf);
      const data = png.data;
      const imgW = png.width;

      // Watermark position: y=930, x starts at 28, 16px height
      const wmX1 = 28, wmY = 930, wmH = 16;
      // Scan to find actual character bounds (right edge of content)
      let left = 200, right = 28, top = wmH, bottom = 0;
      for (let y = 0; y < wmH; y++) {
        for (let x = 0; x < 200; x++) {
          const idx = ((wmY + y) * imgW + (wmX1 + x)) * 4;
          const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          if (gray < 200) {
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      }

      if (left > right) { console.log(`  ⚠ ${char}: no content`); continue; }
      left = Math.max(0, left - 1);
      right = Math.min(199, right + 1);
      top = Math.max(0, top - 1);
      bottom = Math.min(wmH - 1, bottom + 1);

      const tw = right - left + 1, th = bottom - top + 1;
      const pixels: number[][] = [];
      for (let y = 0; y < th; y++) {
        const row: number[] = [];
        for (let x = 0; x < tw; x++) {
          const idx = ((wmY + top + y) * imgW + (wmX1 + left + x)) * 4;
          const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          row.push(255 - gray);
        }
        pixels.push(row);
      }

      let darkCount = 0;
      for (const row of pixels) for (const v of row) if (v > 128) darkCount++;

      writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
        w: tw, h: th, char, pixels, darkCount,
        samples: [{ pixels, darkCount }],
      }, null, 2));
    }
    console.log(`完成。${chars.length} 个模板 → templates/`);
  })();
}

main();
