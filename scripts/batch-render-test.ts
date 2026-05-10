/**
 * 批量识别+渲染测试 (images 1-40)
 * 用法: cd external/clear-sudoku && npx ts-node scripts/batch-render-test.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(__dirname, "..", "..", "..", "testoutput");

const logger = {
  info: (m: string) => console.log(`  ${m}`),
  debug: () => {},
  warn: (m: string) => console.log(`  [W] ${m}`),
  error: (m: string) => console.log(`  [E] ${m}`),
};

async function main() {
  // Dynamic import of compiled modules
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  // Preload templates
  console.log("预加载数字模板...");
  preloadTemplates();

  // Renderer — mock context
  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Ensure output dir
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const startTime = Date.now();
  let done = 0;
  let failed = 0;

  for (let i = 1; i <= 40; i++) {
    const imgPath = join(IMG_DIR, `${i}.png`);
    const outPath = join(OUT_DIR, `${i}.png`);

    if (!existsSync(imgPath)) {
      console.log(`  [SKIP] ${i}.png 不存在`);
      continue;
    }

    process.stdout.write(`[${i}/40] ${i}.png ... `);

    try {
      const buf = readFileSync(imgPath);
      const ocrResult = await recognizeBoard(buf, logger);
      const board = BoardState.fromOCR(ocrResult);
      const rendered = await renderer.renderResult(board);
      writeFileSync(outPath, rendered);
      done++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`OK (${elapsed}s)`);
    } catch (e: any) {
      failed++;
      console.log(`FAIL: ${e.message?.substring(0, 100)}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n完成: ${done} 成功, ${failed} 失败 (${elapsed}s)`);
  console.log(`输出目录: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
