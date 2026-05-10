/**
 * 对 Xsudoku 1-10 题跑完整 OCR 管线并渲染输出
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { recognizeBoard } from "../src/ocr";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUTPUT_DIR = join(IMG_DIR, "testoutput");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Mock a minimal Koishi context for the renderer
  const mockCtx = {
    logger: (name: string) => ({
      info: (msg: string) => console.log(`  [${name}] ${msg}`),
      warn: (msg: string) => console.warn(`  [${name}] ${msg}`),
      error: (msg: string) => console.error(`  [${name}] ${msg}`),
      debug: () => {},
    }),
    baseDir: join(__dirname, ".."),
  };

  const renderer = new SudokuRenderer(mockCtx as any);

  for (let i = 1; i <= 10; i++) {
    let imgPath = join(IMG_DIR, `${i}.png`);
    if (!existsSync(imgPath)) imgPath = join(IMG_DIR, `${i}.jpg`);
    const buf = readFileSync(imgPath);
    const fname = imgPath.split(/[\\/]/).pop();
    console.log(`\n=== 题${i}: ${fname} ${(buf.length / 1024).toFixed(1)}KB ===`);

    try {
      // Step 1: OCR
      const ocrResult = await recognizeBoard(buf, mockCtx.logger("ocr"));
      const board = BoardState.fromOCR(ocrResult);

      // Step 2: Render result — 70px and 77px versions
      for (const size of [70, 77]) {
        const resultBuf = await renderer.render(board, { showCandidates: true, largeFontSize: size });
        const outPath = join(OUTPUT_DIR, `result_${i}_${size}px.png`);
        writeFileSync(outPath, resultBuf);
        console.log(`  → testoutput/result_${i}_${size}px.png (${(resultBuf.length / 1024).toFixed(1)}KB)`);
      }

      // Stats
      let givens = 0, deduced = 0, candCells = 0;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board.givens[r][c] > 0) givens++;
          else if (board.deduced[r][c] > 0) deduced++;
          if (board.candidates[r][c].size > 0) candCells++;
        }
      }
      console.log(`  ${givens}G ${deduced}D ${candCells}cands`);
    } catch (err: any) {
      console.error(`  ✗ 题${i} 失败: ${err.message}`);
    }
  }

  console.log(`\n完成。输出目录: ${OUTPUT_DIR}`);
}

main().catch(console.error);
