/**
 * 批量渲染 1-40 和 435 — 用手写模板识别 + 渲染输出
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { recognizeBoard } from "../src/ocr";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMG = join(__dirname, "..", "..", "..", "images");
const OUT = join(IMG, "testoutput");

function findImg(n: number): string | null {
  for (const ext of [".png", ".jpg"]) { const p = join(IMG, `${n}${ext}`); if (existsSync(p)) return p; }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const puzzles = [...Array.from({length: 40}, (_, i) => i + 1), 435];
  console.log(`=== 渲染 ${puzzles.length} 题 → testoutput/ ===\n`);

  for (const pn of puzzles) {
    const imgPath = findImg(pn);
    if (!imgPath) { console.log(`  #${pn}: 图片不存在`); continue; }
    const buf = readFileSync(imgPath);

    // Full pipeline OCR (handles boundary check + candidate detection)
    const ocrResult = await recognizeBoard(buf, null);
    const board = BoardState.fromOCR(ocrResult);

    const resultBuf = await renderer.renderResult(board);
    writeFileSync(join(OUT, `result_${pn}.png`), resultBuf);

    const g = board.givens.flat().filter(v => v > 0).length;
    const d = board.deduced.flat().filter(v => v > 0).length;
    console.log(`  ✓ #${pn}: ${g}G ${d}D → result_${pn}.png`);
  }
  console.log(`\n完成。输出: ${OUT}/`);
}

main();
