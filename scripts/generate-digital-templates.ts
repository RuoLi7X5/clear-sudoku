/**
 * 生成数字模板 — 多板本，覆盖所有行列位置的字体渲染差异
 * 用法: cd external/clear-sudoku && npx ts-node scripts/generate-digital-templates.ts
 */
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

const TEMPLATE_DIR = join(__dirname, "..", "templates");

async function extractBoard(
  renderer: any, givens: number[][], deduced: number[][],
): Promise<Map<number, number[][][]>> {
  const { BoardState } = require("../lib/board");
  const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set<number>()),
  );
  const board = new BoardState(givens, deduced, candidates);
  const buf = await renderer.renderResult(board);
  const png = PNG.sync.read(buf);
  const data = png.data as Uint8Array;

  const { detectGridLines, extractGrayscale } = require("../lib/ocr");
  const grid = detectGridLines(data, png.width, png.height);
  const hLines = grid.horizontal.slice(0, 10);
  const vLines = grid.vertical.slice(0, 10);

  const samples: Map<number, number[][][]> = new Map();
  for (let d = 1; d <= 9; d++) samples.set(d, []);

  const { scaleTo } = require("../lib/template-match");
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const digit = givens[r][c] || deduced[r][c];
      if (digit === 0) continue;
      const x1 = vLines[c], y1 = hLines[r];
      const x2 = vLines[c + 1], y2 = hLines[r + 1];
      const cellW = x2 - x1, cellH = y2 - y1;
      const inset = Math.max(2, cellW * 0.12);
      const cx1 = x1 + inset, cy1 = y1 + inset;
      const cx2 = x2 - inset, cy2 = y2 - inset;
      const bigPixels = extractGrayscale(data, png.width, cx1, cy1, cx2, cy2);
      const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);
      samples.get(digit)!.push(scaleTo(bigPixels, bw, bh, 24, 36));
    }
  }
  return samples;
}

function mergeSamples(a: Map<number, number[][][]>, b: Map<number, number[][][]>): Map<number, number[][][]> {
  const merged = new Map<number, number[][][]>();
  for (let d = 1; d <= 9; d++) {
    merged.set(d, [...(a.get(d)!), ...(b.get(d)!)]);
  }
  return merged;
}

async function main() {
  const { SudokuRenderer } = require("../lib/renderer");
  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Board 1: Latin-square (digit = (row+col)%9 + 1), rows 0-4 black, rows 5-8 blue
  const g1: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const d1: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const digit = ((r + c) % 9) + 1;
      if (r < 5) g1[r][c] = digit; else d1[r][c] = digit;
    }
  }

  console.log("渲染 Board 1...");
  const s1 = await extractBoard(renderer, g1, d1);
  console.log(`  Board 1: ${Array.from(s1.entries()).map(([d,s]) => s.length).join(",")} samples per digit`);

  // Board 2: Same Latin-square but swap rows (different col positions per digit)
  const g2: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const d2: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const digit = ((r * 2 + c) % 9) + 1; // different permutation
      if (r < 5) g2[r][c] = digit; else d2[r][c] = digit;
    }
  }

  console.log("渲染 Board 2...");
  const s2 = await extractBoard(renderer, g2, d2);
  console.log(`  Board 2: ${Array.from(s2.entries()).map(([d,s]) => s.length).join(",")} samples per digit`);

  // Merge and save
  const merged = mergeSamples(s1, s2);
  console.log("\n保存数字模板:");
  if (!existsSync(TEMPLATE_DIR)) mkdirSync(TEMPLATE_DIR, { recursive: true });

  for (let digit = 1; digit <= 9; digit++) {
    const sampleList = merged.get(digit)!;
    const entries: Array<{ pixels: number[][]; darkCount: number }> = [];
    for (const px of sampleList) {
      let darkCount = 0;
      for (const row of px) for (const v of row) if (v > 128) darkCount++;
      entries.push({ pixels: px, darkCount });
    }
    writeFileSync(join(TEMPLATE_DIR, `digital_${digit}.json`), JSON.stringify({
      digit, w: 24, h: 36, samples: entries,
    }));
    console.log(`  digital_${digit}.json (${entries.length}样本)`);
  }
  console.log("\n完成！");
}

main().catch(e => { console.error(e); process.exit(1); });
