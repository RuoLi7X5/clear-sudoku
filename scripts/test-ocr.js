/**
 * OCR 识别测试脚本
 * 用法: node scripts/test-ocr.js
 */
const { readFileSync } = require("fs");
const { join } = require("path");

const logger = {
  info: (msg) => console.log(`  [INFO] ${msg}`),
  debug: (msg) => console.log(`  [DEBUG] ${msg}`),
  warn: (msg) => console.log(`  [WARN] ${msg}`),
  error: (msg) => console.log(`  [ERROR] ${msg}`),
};

async function main() {
  const imagePath = join(__dirname, "..", "..", "..", "images", "1.png");
  console.log(`读取图片: ${imagePath}`);
  const imageBuf = readFileSync(imagePath);
  console.log(`图片大小: ${(imageBuf.length / 1024).toFixed(1)}KB`);

  const { recognizeBoard, preloadWorker, waitForWorker, terminateOCR } = require("../lib/ocr");

  console.log("\n初始化 tesseract...");
  preloadWorker(logger);
  const ok = await waitForWorker(logger);
  if (!ok) {
    console.error("tesseract 初始化失败");
    process.exit(1);
  }

  console.log("\n开始识别...");
  const result = await recognizeBoard(imageBuf, logger);

  // 打印盘面
  console.log("\n识别结果:");
  console.log("    1   2   3   4   5   6   7   8   9");
  for (let r = 0; r < 9; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const parts = [];
    for (let c = 0; c < 9; c++) {
      const cell = result.cells[r][c];
      if (cell.value > 0) {
        const tag = cell.type === "given" ? "G" : cell.type === "deduced" ? "D" : "?";
        parts.push(`${cell.value}${tag}`);
      } else if (cell.candidates.length > 0) {
        parts.push(cell.candidates.sort().join(""));
      } else {
        parts.push(".");
      }
    }
    const pad = (s) => { const n = 4 - s.length; return s + " ".repeat(Math.max(0, n)); };
    const line = parts.map(pad).join("");
    const sep = (r === 2 || r === 5) ? "  --------+---------+--------" : "";
    console.log(`${rowLabel}  ${line.substring(0,12)} │${line.substring(12,24)} │${line.substring(24)}`);
    if (sep) console.log(sep);
  }

  // 统计
  let givens = 0, deduced = 0, candidates = 0, empty = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (result.cells[r][c].type === "given") givens++;
      else if (result.cells[r][c].type === "deduced") deduced++;
      if (result.cells[r][c].candidates.length > 0) candidates++;
      if (result.cells[r][c].value === 0 && result.cells[r][c].candidates.length === 0) empty++;
    }
  }
  console.log(`\n统计: ${givens}G ${deduced}D ${candidates}cands ${empty}empty`);

  // 置信度
  console.log("\n置信度 (0-9):");
  for (let r = 0; r < 9; r++) {
    const row = result.confidence[r].map((v) => Math.round(v * 9).toString()).join(" ");
    console.log(` ${String.fromCharCode(65 + r)} ${row}`);
  }

  await terminateOCR();
  console.log("\n完成");
}

main().catch((e) => { console.error(e); process.exit(1); });
