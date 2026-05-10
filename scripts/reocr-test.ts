/**
 * 对渲染输出图片进行识别+再渲染（二次识别测试）
 * 输入: testoutput/1-10.png → 输出: testoutput2/
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const IN_DIR = join(__dirname, "..", "..", "..", "testoutput");
const OUT_DIR = join(__dirname, "..", "..", "..", "testoutput2");

const logger = {
  info: (m: string) => console.log(`  ${m}`),
  debug: () => {},
  warn: (m: string) => console.log(`  [W] ${m}`),
  error: (m: string) => console.log(`  [E] ${m}`),
};

async function main() {
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  console.log("预加载数字模板...");
  preloadTemplates();

  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const startTime = Date.now();
  let done = 0;
  let failed = 0;

  for (let i = 1; i <= 20; i++) {
    const imgPath = join(IN_DIR, `${i}.png`);
    const outPath = join(OUT_DIR, `${i}.png`);

    process.stdout.write(`[${i}/20] ${i}.png ... `);

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
