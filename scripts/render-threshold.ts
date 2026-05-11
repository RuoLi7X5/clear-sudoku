import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { recognizeBoard } from "../src/ocr";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMG = join(__dirname, "..", "..", "..", "images");
const pct = parseInt(process.argv[2]);
const OUT = join(IMG, "testoutput", `ink${pct}pct`);

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

  console.log(`阈值 ${pct}% → ${OUT}`);
  for (let i = 1; i <= 40; i++) {
    const imgPath = findImg(i);
    if (!imgPath) { console.log(`  #${i}: skip`); continue; }
    const buf = readFileSync(imgPath);
    const ocr = await recognizeBoard(buf, null);
    const board = BoardState.fromOCR(ocr);
    const resultBuf = await renderer.renderResult(board);
    writeFileSync(join(OUT, `result_${i}.png`), resultBuf);

    let cands = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (board.candidates[r][c].size > 0) cands++;
    process.stdout.write(` ${i}(${cands}c)`);
  }
  console.log(" done");
}

main();
