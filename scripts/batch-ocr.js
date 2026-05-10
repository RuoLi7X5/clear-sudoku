/**
 * 批量识别 + 渲染脚本
 * 用法: node scripts/batch-ocr.js
 * 输出到 images/output/
 */
const { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } = require("fs");
const { join, extname } = require("path");
const { PNG } = require("pngjs");

const logger = { info: (m) => process.stdout.write(`  ${m}\n`), debug: () => {}, warn: (m) => console.log(`  [W] ${m}`), error: (m) => console.log(`  [E] ${m}`) };

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(IMG_DIR, "output");

async function main() {
  // Load modules
  const { recognizeBoard, preloadWorker, waitForWorker } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  // Init tesseract
  console.log("Init tesseract (best model)...");
  preloadWorker(logger);
  const ok = await waitForWorker(logger);
  if (!ok) { console.error("tesseract failed"); process.exit(1); }
  console.log("Tesseract ready.\n");

  // Mock context for renderer
  const mockLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };
  const mockCtx = {
    logger: () => mockLogger,
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Get image list
  const files = readdirSync(IMG_DIR).filter(f => {
    const ext = extname(f).toLowerCase();
    return (ext === '.png' || ext === '.jpg' || ext === '.jpeg') && !f.startsWith('.');
  }).sort((a, b) => {
    const na = parseInt(a.split('.')[0]);
    const nb = parseInt(b.split('.')[0]);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  console.log(`Found ${files.length} images\n`);

  // Ensure output dir
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const stats = { total: files.length, done: 0, failed: 0, ocrFailed: 0 };
  const startTime = Date.now();

  for (const file of files) {
    const imgPath = join(IMG_DIR, file);
    const outPath = join(OUT_DIR, file.replace(extname(file), '.png'));

    try {
      const buf = readFileSync(imgPath);
      const ocrResult = await recognizeBoard(buf, logger);
      const board = BoardState.fromOCR(ocrResult);
      const rendered = await renderer.renderResult(board);
      writeFileSync(outPath, rendered);
      stats.done++;

      // Progress every 10 images
      if (stats.done % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (stats.done / elapsed).toFixed(1);
        console.log(`  [${stats.done}/${stats.total}] ${elapsed}s (${rate}/s)`);
      }
    } catch (e) {
      stats.failed++;
      console.log(`  [FAIL] ${file}: ${e.message?.substring(0, 80)}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nDone: ${stats.done} ok, ${stats.failed} fail in ${elapsed}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
