/**
 * 墨迹阈值扫描：1%-8%，每级对 1-40 题识别渲染
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { recognizeBoard } from "../src/ocr";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMG = join(__dirname, "..", "..", "..", "images");
const BASE_OUT = join(IMG, "testoutput");

function findImg(n: number): string | null {
  for (const ext of [".png", ".jpg"]) { const p = join(IMG, `${n}${ext}`); if (existsSync(p)) return p; }
  return null;
}

async function main() {
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  for (let pct = 1; pct <= 8; pct++) {
    const outDir = join(BASE_OUT, `ink${pct}pct`);
    mkdirSync(outDir, { recursive: true });

    // Patch hasInk threshold by modifying the compiled JS
    const ocrJs = readFileSync(join(__dirname, "..", "lib", "ocr.js"), "utf-8");
    const patched = ocrJs.replace(
      /return darkCount \/ totalCount > 0\.\d+/,
      `return darkCount / totalCount > 0.0${pct}`
    );
    writeFileSync(join(__dirname, "..", "lib", "ocr.js"), patched);

    // Reload the module
    delete require.cache[require.resolve("../lib/ocr")];
    const { recognizeBoard: rb } = require("../lib/ocr");

    console.log(`\n=== 阈值 ${pct}% → testoutput/ink${pct}pct/ ===`);

    for (let i = 1; i <= 40; i++) {
      const imgPath = findImg(i);
      if (!imgPath) continue;
      const buf = readFileSync(imgPath);
      const ocr = await rb(buf, null);
      const board = BoardState.fromOCR(ocr);
      const resultBuf = await renderer.renderResult(board);
      writeFileSync(join(outDir, `result_${i}.png`), resultBuf);

      let cands = 0;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board.candidates[r][c].size > 0) cands++;
      process.stdout.write(`  #${String(i).padStart(2)}:${cands}c `);
      if (i % 5 === 0) process.stdout.write("\n");
    }
    console.log("");
  }

  // Restore original
  writeFileSync(join(__dirname, "..", "lib", "ocr.js"), readFileSync(join(__dirname, "..", "lib", "ocr.js.bak") || ""));
  console.log("\n完成。");
}

main();
