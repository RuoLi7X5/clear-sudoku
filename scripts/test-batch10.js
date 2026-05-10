/**
 * 批量测试10张图片 — 模板匹配识别 + 渲染输出 + 统计
 * 输出到 images/testoutput/
 */
const { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } = require("fs");
const { join, extname } = require("path");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(IMG_DIR, "testoutput");

async function main() {
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  const logger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  // 预加载模板
  const t0 = Date.now();
  preloadTemplates();
  const tplTime = (Date.now() - t0).toFixed(0);
  console.log(`模板加载: ${tplTime}ms\n`);

  // Renderer
  const mockCtx = { logger: () => logger, baseDir: join(__dirname, "..") };
  const renderer = new SudokuRenderer(mockCtx);

  // 取第11-20张图片
  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .slice(10, 20);

  console.log(`处理 ${files.length} 张图片\n`);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 统计收集
  const stats = [];
  const totalStart = Date.now();

  for (const file of files) {
    const imgPath = join(IMG_DIR, file);
    const outPath = join(OUT_DIR, file.replace(extname(file), '.png'));

    try {
      const buf = readFileSync(imgPath);
      const t1 = Date.now();
      const ocrResult = await recognizeBoard(buf, logger);
      const ocrTime = (Date.now() - t1).toFixed(0);

      let givenCount = 0, deducedCount = 0, candCount = 0, emptyCount = 0;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cell = ocrResult.cells[r][c];
          if (cell.type === "given") givenCount++;
          else if (cell.type === "deduced") deducedCount++;
          if (cell.candidates.length > 0) candCount++;
          else if (cell.type === "none") emptyCount++;
        }
      }

      const board = BoardState.fromOCR(ocrResult);
      const t2 = Date.now();
      const rendered = await renderer.renderResult(board);
      const renderTime = (Date.now() - t2).toFixed(0);
      writeFileSync(outPath, rendered);

      const total = givenCount + deducedCount;
      const row = { file, given: givenCount, deduced: deducedCount, total, candidates: candCount, empty: emptyCount, ocrMs: Number(ocrTime), renderMs: Number(renderTime) };
      stats.push(row);
      console.log(`[${file}] G${givenCount} D${deducedCount} C${candCount} E${emptyCount} | OCR ${ocrTime}ms 渲染 ${renderTime}ms`);
    } catch (e) {
      console.log(`[${file}] FAIL: ${e.message?.substring(0, 120)}`);
      stats.push({ file, given: 0, deduced: 0, total: 0, candidates: 0, empty: 81, ocrMs: 0, renderMs: 0, error: e.message });
    }
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(2);

  // 汇总表
  console.log(`\n${"=".repeat(65)}`);
  console.log(`${"文件".padEnd(8)} ${"给定".padStart(4)} ${"推导".padStart(4)} ${"合计".padStart(4)} ${"候选格".padStart(6)} ${"空格".padStart(4)} ${"OCR".padStart(6)} ${"渲染".padStart(5)}`);
  console.log(`${"-".repeat(65)}`);
  let sumG = 0, sumD = 0, sumT = 0, sumC = 0, sumE = 0, sumOcr = 0, sumRender = 0;
  for (const s of stats) {
    console.log(`${s.file.padEnd(8)} ${String(s.given).padStart(4)} ${String(s.deduced).padStart(4)} ${String(s.total).padStart(4)} ${String(s.candidates).padStart(6)} ${String(s.empty).padStart(4)} ${(s.ocrMs+"ms").padStart(6)} ${(s.renderMs+"ms").padStart(5)}`);
    sumG += s.given; sumD += s.deduced; sumT += s.total; sumC += s.candidates; sumE += s.empty; sumOcr += s.ocrMs; sumRender += s.renderMs;
  }
  console.log(`${"-".repeat(65)}`);
  const avgG = (sumG/10).toFixed(0), avgD = (sumD/10).toFixed(0), avgT = (sumT/10).toFixed(0);
  const avgC = (sumC/10).toFixed(0), avgE = (sumE/10).toFixed(0);
  const avgOcr = (sumOcr/10).toFixed(0), avgRender = (sumRender/10).toFixed(0);
  console.log(`${"平均".padEnd(8)} ${avgG.padStart(4)} ${avgD.padStart(4)} ${avgT.padStart(4)} ${avgC.padStart(6)} ${avgE.padStart(4)} ${(avgOcr+"ms").padStart(6)} ${(avgRender+"ms").padStart(5)}`);
  console.log(`${"=".repeat(65)}`);
  console.log(`总耗时: ${totalElapsed}s | OCR平均: ${avgOcr}ms/图 | 渲染平均: ${avgRender}ms/图`);
  console.log(`输出目录: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
