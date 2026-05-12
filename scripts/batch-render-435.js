/**
 * 批量 OCR + 渲染 435 题
 * 用法: node scripts/batch-render-435.js
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");
const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
const { BoardState } = require("../lib/board");
const { SudokuRenderer } = require("../lib/renderer");

const BASE_DIR = join(__dirname, "..");
const IMAGES_DIR = join(BASE_DIR, "..", "..", "images");
const OUTPUT_DIR = join(IMAGES_DIR, "testoutput");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  preloadTemplates();

  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: BASE_DIR,
  };
  const renderer = new SudokuRenderer(mockCtx);

  const TOTAL = 435;
  let ok = 0, fail = 0;
  const t0 = Date.now();

  for (let i = 1; i <= TOTAL; i++) {
    const imgPath = (() => {
      for (const ext of [".png", ".jpg", ".jpeg"]) {
        const p = join(IMAGES_DIR, `${i}${ext}`);
        if (existsSync(p)) return p;
      }
      return null;
    })();

    if (!imgPath) { console.log(`[${i}/${TOTAL}] 图片不存在`); fail++; continue; }

    const fname = imgPath.split(/[\\/]/).pop();
    try {
      const buf = readFileSync(imgPath);
      const ocrResult = await recognizeBoard(buf);
      const board = BoardState.fromOCR(ocrResult);

      const renderBuf = await renderer.render(board, { showCandidates: true });
      writeFileSync(join(OUTPUT_DIR, `${i}.png`), renderBuf);

      const g = board.givens.flat().filter(v => v > 0).length;
      const d = board.deduced.flat().filter(v => v > 0).length;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const eta = ok > 0 ? Math.round((elapsed / ok) * (TOTAL - i)) : 0;
      console.log(`[${i}/${TOTAL}] ${fname} OK (${g}G ${d}D) ${elapsed}s ETA:${eta}s`);
      ok++;
    } catch (err) {
      console.log(`[${i}/${TOTAL}] ${fname} FAIL: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n完成: ${ok} OK, ${fail} FAIL, 耗时 ${((Date.now()-t0)/1000).toFixed(0)}s`);
  console.log(`输出: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
