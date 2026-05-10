/**
 * OCR 识别测试脚本
 * 用法: cd external/clear-sudoku && npx ts-node scripts/test-ocr.ts
 */
import { readFileSync } from "fs";
import { join } from "path";

// 模拟一个简单 logger
const logger = {
  info: (msg: string) => console.log(`  [INFO] ${msg}`),
  debug: (msg: string) => console.log(`  [DEBUG] ${msg}`),
  warn: (msg: string) => console.log(`  [WARN] ${msg}`),
  error: (msg: string) => console.log(`  [ERROR] ${msg}`),
};

async function main() {
  const imagePath = join(__dirname, "..", "..", "..", "images", "数独题目1.png");
  console.log(`读取图片: ${imagePath}`);
  const imageBuf = readFileSync(imagePath);
  console.log(`图片大小: ${(imageBuf.length / 1024).toFixed(1)}KB`);

  // 动态 import 编译后的 ocr 模块
  const { recognizeBoard, preloadWorker, waitForWorker } = require("../lib/ocr");

  // 预加载 tesseract
  console.log("\n初始化 tesseract...");
  preloadWorker(logger);
  const ok = await waitForWorker(logger);
  if (!ok) {
    console.error("tesseract 初始化失败");
    process.exit(1);
  }

  // 执行 OCR
  console.log("\n开始识别...");
  const result = await recognizeBoard(imageBuf, logger);

  // 打印盘面
  console.log("\n识别结果:");
  console.log("   1 2 3   4 5 6   7 8 9");
  console.log("  ───────────────────────");
  for (let r = 0; r < 9; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const parts: string[] = [];
    for (let c = 0; c < 9; c++) {
      const cell = result.cells[r][c];
      if (cell.value > 0) {
        const tag = cell.type === "given" ? "G" : "D";
        parts.push(`${cell.value}${tag}`);
      } else if (cell.candidates.length > 0) {
        parts.push(cell.candidates.sort().join(""));
      } else {
        parts.push("·");
      }
    }
    const line = parts.map(p => p.padEnd(4)).join("");
    console.log(`${rowLabel} ${line.slice(0, 13)}│${line.slice(13, 25)}│${line.slice(25)}`);
    if (r === 2 || r === 5) console.log("  ───────────────────────");
  }

  // 统计
  let givens = 0, deduced = 0, candidates = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (result.cells[r][c].type === "given") givens++;
      else if (result.cells[r][c].type === "deduced") deduced++;
      if (result.cells[r][c].candidates.length > 0) candidates++;
    }
  }
  console.log(`\n统计: ${givens}已知数, ${deduced}出数, ${candidates}候选格`);

  // 打印每格置信度
  console.log("\n置信度热力图 (0=无/低, 9=高):");
  for (let r = 0; r < 9; r++) {
    const row = result.confidence[r].map((v: number) => Math.round(v * 9).toString()).join(" ");
    console.log(` ${String.fromCharCode(65 + r)} ${row}`);
  }

  // 释放
  const { terminateOCR } = require("../lib/ocr");
  await terminateOCR();
  console.log("\n完成");
}

main().catch(console.error);
