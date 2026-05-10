/**
 * 诊断脚本 — 分析大数字 vs 候选数分类质量
 * 输出每图的关键指标和 Tesseract 失败详情
 */
const { readFileSync, readdirSync } = require("fs");
const { join, extname } = require("path");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");

async function main() {
  const { recognizeBoard, preloadWorker, waitForWorker } = require("../lib/ocr");

  // 收集 debug 日志
  const debugLines = [];
  const logger = {
    info: () => {},
    debug: (m) => { if (m.includes("Tesseract fail")) debugLines.push(m); },
    warn: () => {},
    error: () => {},
  };

  console.log("初始化 Tesseract...");
  preloadWorker(logger);
  await waitForWorker(logger);
  console.log("就绪.\n");

  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => { const na = parseInt(a), nb = parseInt(b); return (na - nb) || a.localeCompare(b); })
    .slice(0, 10);

  let totalTesseractCalls = 0, totalRecognized = 0, totalFailDetails = 0;

  for (const file of files) {
    debugLines.length = 0;
    const imgPath = join(IMG_DIR, file);
    const buf = readFileSync(imgPath);
    const result = await recognizeBoard(buf, logger);

    let given = 0, deduced = 0, candCells = 0, emptyCells = 0;
    let digit8Given = 0, digit8Deduced = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = result.cells[r][c];
        if (cell.type === "given") { given++; if (cell.value === 8) digit8Given++; }
        else if (cell.type === "deduced") { deduced++; if (cell.value === 8) digit8Deduced++; }
        else if (cell.candidates.length > 0) candCells++;
        else emptyCells++;
      }
    }

    const failCount = debugLines.length;
    totalTesseractCalls += (given + deduced + failCount);
    totalRecognized += (given + deduced);
    totalFailDetails += failCount;

    // 分析失败格子的指标分布
    const lowBlob = debugLines.filter(l => { const m = l.match(/maxBlobRatio=([\d.]+)/); return m && parseFloat(m[1]) < 0.08; }).length;
    const midBlob = debugLines.filter(l => { const m = l.match(/maxBlobRatio=([\d.]+)/); return m && parseFloat(m[1]) >= 0.08 && parseFloat(m[1]) < 0.12; }).length;
    const highBlob = debugLines.filter(l => { const m = l.match(/maxBlobRatio=([\d.]+)/); return m && parseFloat(m[1]) >= 0.12; }).length;

    const calls = given + deduced + failCount;
    const recogRate = calls > 0 ? ((given + deduced) / calls * 100).toFixed(0) : "100";
    console.log(`${file}: G${given} D${deduced} C${candCells} E${emptyCells} | 调用${calls} 识别${given+deduced} 失败${failCount} (成功率${recogRate}%)`);
    if (failCount > 0) {
      console.log(`  失败格 blobRatio分布: 低(<8%)${lowBlob} 中(8-12%)${midBlob} 高(>12%)${highBlob}`);
      if (debugLines.length <= 5) {
        for (const l of debugLines) console.log(`  ${l}`);
      } else {
        for (const l of debugLines.slice(0, 3)) console.log(`  ${l}`);
        console.log(`  ... 还有${debugLines.length-3}条`);
      }
    }
    if (digit8Given + digit8Deduced > 0) console.log(`  数字8: ${digit8Given}给定 ${digit8Deduced}推导`);
  }

  const overallRate = totalTesseractCalls > 0 ? (totalRecognized / totalTesseractCalls * 100).toFixed(1) : "100";
  console.log(`\n总计: ${totalTesseractCalls}调用 ${totalRecognized}识别 ${totalFailDetails}失败 (总成功率${overallRate}%)`);
}

main().catch(e => { console.error(e); process.exit(1); });
