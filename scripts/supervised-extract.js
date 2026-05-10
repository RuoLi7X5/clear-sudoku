/**
 * 有监督模板提取 — 用正确答案标注，提取正确识别的数字作为模板
 *
 * 用法:
 *   node scripts/supervised-extract.js <imageFile> <groundTruth>
 *
 * groundTruth 格式:
 *   - 81字符: "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79"
 *     . 或 0 = 空格
 *   - 或9行空格分隔:
 *     "5 3 . . 7 . . . .\n6 . . 1 9 5 . . .\n..."
 *
 * 输出:
 *   - 逐格对比报告
 *   - 正确识别的数字像素 → templates_extracted/
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(__dirname, "..", "templates_extracted");

// 解析ground truth
function parseGroundTruth(input) {
  // 去除所有空白字符
  let cleaned = input.replace(/[\s\n\r\t|+\-]+/g, "").replace(/[.0]/g, ".");

  // 如果长度<81，尝试补全
  if (cleaned.length < 81) {
    // 可能是9行格式，缺少空格标记
    cleaned = input.replace(/\s+/g, "");
    cleaned = cleaned.replace(/0/g, ".");
  }

  if (cleaned.length !== 81) {
    throw new Error(`ground truth长度=${cleaned.length}，需要81个字符`);
  }

  const grid = [];
  for (let r = 0; r < 9; r++) {
    grid[r] = [];
    for (let c = 0; c < 9; c++) {
      const ch = cleaned[r * 9 + c];
      grid[r][c] = (ch >= "1" && ch <= "9") ? parseInt(ch) : 0;
    }
  }
  return grid;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("用法: node scripts/supervised-extract.js <imageFile> <groundTruth>");
    console.log("groundTruth: 81字符, .或0=空格");
    console.log("示例: node scripts/supervised-extract.js 1.png \"53..7....6..195....98....6...\"");
    process.exit(1);
  }

  const imageFile = args[0];
  const groundTruth = parseGroundTruth(args.slice(1).join(" "));

  console.log("Ground Truth:");
  printGrid(groundTruth);

  // 加载OCR
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  preloadTemplates();
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  // 读取图片
  const imgPath = join(IMG_DIR, imageFile);
  if (!existsSync(imgPath)) {
    console.error(`图片不存在: ${imgPath}`);
    process.exit(1);
  }

  const buf = readFileSync(imgPath);
  const png = PNG.sync.read(buf);
  const data = png.data;
  const imgW = png.width;
  const imgH = png.height;

  console.log(`\n识别 ${imageFile} (${imgW}x${imgH})...`);
  const result = await recognizeBoard(buf, logger);

  // 逐格对比
  let correctBig = 0, totalBigTruth = 0;
  let correctEmpty = 0, totalEmptyTruth = 0;
  let wrongDigit = 0, missedBig = 0, falseBig = 0;
  const confMatrix = Array.from({length:10}, () => Array(10).fill(0)); // [truth][pred]
  const errors = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const truth = groundTruth[r][c];
      const cell = result.cells[r][c];
      const pred = cell.type === "given" || cell.type === "deduced" ? cell.value : 0;

      confMatrix[truth][pred]++;

      if (truth > 0) totalBigTruth++;
      else totalEmptyTruth++;

      if (truth > 0 && pred === truth) correctBig++;
      else if (truth === 0 && pred === 0) correctEmpty++;
      else if (truth > 0 && pred > 0 && pred !== truth) wrongDigit++;
      else if (truth > 0 && pred === 0) missedBig++;
      else if (truth === 0 && pred > 0) falseBig++;
    }
  }

  // 报告
  const totalCells = 81;
  const totalCorrect = correctBig + correctEmpty;
  const totalWrong = wrongDigit + missedBig + falseBig;
  const accuracy = (totalCorrect / totalCells * 100).toFixed(1);

  console.log(`\n${"=".repeat(55)}`);
  console.log("识别 vs 正确答案 对比报告");
  console.log(`${"=".repeat(55)}`);
  console.log(`总格数: ${totalCells}`);
  console.log(`正确: ${totalCorrect} (${accuracy}%)`);
  console.log(`  - 大数字正确: ${correctBig}/${totalBigTruth}`);
  console.log(`  - 空格正确:   ${correctEmpty}/${totalEmptyTruth}`);
  console.log(`错误: ${totalWrong}`);
  console.log(`  - 数字识别错: ${wrongDigit} (如: 6→5)`);
  console.log(`  - 漏识别:     ${missedBig} (有数字未识别)`);
  console.log(`  - 误识别:     ${falseBig} (空格判为大数字)`);

  // 混淆矩阵
  console.log(`\n混淆矩阵 (行=正确答案, 列=识别结果):`);
  console.log(`     ${"0".padStart(3)}${"1".padStart(3)}${"2".padStart(3)}${"3".padStart(3)}${"4".padStart(3)}${"5".padStart(3)}${"6".padStart(3)}${"7".padStart(3)}${"8".padStart(3)}${"9".padStart(3)}`);
  for (let t = 0; t <= 9; t++) {
    if (confMatrix[t].every(v => v === 0)) continue;
    const label = t === 0 ? "空" : String(t);
    const row = confMatrix[t].map(v => String(v).padStart(3)).join("");
    console.log(`${label.padStart(3)}: ${row}`);
  }

  // 逐格详情
  if (errors.length > 0 || true) {
    console.log(`\n逐格详情 (格式: 坐标 答案→识别):`);
    const labels = [];
    for (let r = 0; r < 9; r++) {
      const rowLabels = [];
      for (let c = 0; c < 9; c++) {
        const truth = groundTruth[r][c];
        const cell = result.cells[r][c];
        const pred = cell.type === "given" || cell.type === "deduced" ? cell.value : 0;
        if (truth !== pred) {
          rowLabels.push(`${String.fromCharCode(65+r)}${c+1}:${truth||"."}→${pred||"."}`);
        }
      }
      if (rowLabels.length > 0) labels.push(rowLabels.join(" "));
    }
    console.log(labels.join("\n") || "  无错误！");
  }

  // 提取模板：只从正确答案的格子中提取
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const accumulators = {
    big: Array.from({length:10}, () => ({ sum: null, count: 0, w: 24, h: 36 })),
    small: Array.from({length:10}, () => ({ sum: null, count: 0, w: 14, h: 20 })),
  };

  const gridH = [18,146,274,402,530,658,786,914,1042,1170];
  const gridV = [18,146,274,402,530,658,786,914,1042,1170];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const truth = groundTruth[r][c];
      if (truth === 0) continue;

      const cell = result.cells[r][c];
      const pred = cell.type === "given" || cell.type === "deduced" ? cell.value : 0;
      if (pred !== truth) continue; // 只提取识别正确的

      const x1 = gridV[c], y1 = gridH[r];
      const cellW = gridV[c+1] - x1, cellH = gridH[r+1] - y1;

      // 提取大数字
      const inset = cellW * 0.12;
      const cx1 = Math.round(x1 + inset), cy1 = Math.round(y1 + inset);
      const cx2 = Math.round(x1 + cellW - inset), cy2 = Math.round(y1 + cellH - inset);
      const bigPixels = extractScaled(data, imgW, cx1, cy1, cx2, cy2, 24, 36);
      if (bigPixels) {
        const acc = accumulators.big[truth];
        if (!acc.sum) acc.sum = bigPixels.map(r => r.slice());
        else for (let y=0;y<36;y++) for(let x=0;x<24;x++) acc.sum[y][x] += bigPixels[y][x];
        acc.count++;
      }

      // 提取候选数（从候选格中提取，用正确答案做标签）
      const subW = cellW/3, subH = cellH/3;
      for (let v = 1; v <= 9; v++) {
        if (!cell.candidates.includes(v)) continue;
        const sr = Math.floor((v-1)/3), sc = (v-1)%3;
        const pad = 0.15;
        const sx1 = Math.round(x1 + sc*subW + subW*pad);
        const sy1 = Math.round(y1 + sr*subH + subH*pad);
        const sx2 = Math.round(x1 + (sc+1)*subW - subW*pad);
        const sy2 = Math.round(y1 + (sr+1)*subH - subH*pad);
        const smallPixels = extractScaled(data, imgW, sx1, sy1, sx2, sy2, 14, 20);
        if (smallPixels) {
          const acc = accumulators.small[v];
          if (!acc.sum) acc.sum = smallPixels.map(r => r.slice());
          else for (let y=0;y<20;y++) for(let x=0;x<14;x++) acc.sum[y][x] += smallPixels[y][x];
          acc.count++;
        }
      }
    }
  }

  // 保存提取的模板
  console.log(`\n提取模板:`);
  for (const size of ["big", "small"]) {
    const accs = size === "big" ? accumulators.big : accumulators.small;
    for (let digit = 1; digit <= 9; digit++) {
      const acc = accs[digit];
      if (acc.count === 0) { console.log(`  ${size}_${digit}: 无样本`); continue; }
      const pixels = acc.sum.map(row => row.map(v => Math.round(v/acc.count)));
      let dark = 0;
      for (const row of pixels) for (const v of row) if (v>80) dark++;
      writeFileSync(join(OUT_DIR, `${size}_${digit}.json`),
        JSON.stringify({ digit, w: acc.w, h: acc.h, pixels, darkCount: dark, sampleCount: acc.count }));
      console.log(`  ${size}_${digit}: ${acc.count}样本, ${dark}暗像素`);
    }
  }
  console.log(`\n模板保存到: ${OUT_DIR}`);
}

function printGrid(grid) {
  for (let r = 0; r < 9; r++) {
    const line = grid[r].map(v => v === 0 ? "." : String(v)).join(" ");
    console.log(`  ${line}`);
  }
}

function extractScaled(data, imgW, x1, y1, x2, y2, outW, outH) {
  const inW = x2 - x1, inH = y2 - y1;
  if (inW < 2 || inH < 2) return null;
  const result = [];
  for (let y = 0; y < outH; y++) {
    const row = [];
    const sy = y1 + (y / outH) * inH;
    const y0 = Math.floor(sy), yf = Math.min(y0 + 1, Math.round(y2) - 1);
    const yFrac = sy - y0;
    for (let x = 0; x < outW; x++) {
      const sx = x1 + (x / outW) * inW;
      const x0 = Math.floor(sx), xf = Math.min(x0 + 1, Math.round(x2) - 1);
      const xFrac = sx - x0;
      const v00 = grayAt(data, imgW, x0, y0), v10 = grayAt(data, imgW, xf, y0);
      const v01 = grayAt(data, imgW, x0, yf), v11 = grayAt(data, imgW, xf, yf);
      const top = v00 * (1 - xFrac) + v10 * xFrac;
      const bottom = v01 * (1 - xFrac) + v11 * xFrac;
      row.push(Math.round(255 - (top * (1 - yFrac) + bottom * yFrac)));
    }
    result.push(row);
  }
  return result;
}
function grayAt(data, w, x, y) {
  const i = (Math.round(y) * w + Math.round(x)) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

main().catch(e => { console.error(e); process.exit(1); });
