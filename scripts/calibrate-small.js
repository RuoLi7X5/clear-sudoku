/**
 * 候选数模板匹配阈值校准
 *
 * 原理：
 *  1. 用正确答案(GT)的大数字 → 计算标准候选数(ground truth candidates)
 *  2. 对每个非大数字格 → 用小模板匹配识别候选数
 *  3. 对比 OCR vs 计算值 → 遍历不同置信阈值 → 找最优阈值
 *
 * 用法: node scripts/calibrate-small.js
 */
const { readFileSync, readdirSync, mkdirSync, existsSync } = require("fs");
const { join, extname } = require("path");
const { PNG } = require("pngjs");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");

// 题目1-10正确答案
const GROUND_TRUTH = [
  "006002800080600270025000061604070032200304700030201900042080600160925007000006020",
  "005070080030504100000308057500000090080406510004005008056003041140050600070641005",
  "010073005005009130309156870050690700000708050002345001037560200006007510500900007",
  "002005090000800004080000200006000905090001003230000780008506070000400009060070300",
  "043009100816037009097100080734910026625370910981060700350001000460700001179040000",
  "600009005020536047005100609007900513080300974300400286000603751000701490000090360",
  "700208005020050070000000200308010062200805731070320800030070010007590306600183407",
  "310420600020009010009001002032094801080270030040138200070853926203940100098012040",
  "726894315590106000081520000100602450048050100050401000015068020060310500800245001",
  "002068040306020008890070620060490872980002406020086010630245089008600200209810060",
];

function parseGrid(row) {
  const g = [];
  for (let r = 0; r < 9; r++) {
    g[r] = [];
    for (let c = 0; c < 9; c++) {
      const ch = row[r * 9 + c];
      g[r][c] = (ch >= "1" && ch <= "9") ? parseInt(ch) : 0;
    }
  }
  return g;
}

// 标准候选数计算：对81格做行/列/宫排除
function computeStandardCandidates(givens) {
  const cands = Array.from({length:9}, () =>
    Array.from({length:9}, () => new Set([1,2,3,4,5,6,7,8,9]))
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (givens[r][c] === 0) continue;
      const v = givens[r][c];
      // 同行/列/宫删除
      for (let i = 0; i < 9; i++) {
        cands[r][i].delete(v);
        cands[i][c].delete(v);
      }
      const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          cands[br+dr][bc+dc].delete(v);
    }
  }
  return cands;
}

// 从图片中提取指定区域的灰度像素
function extractGrayscale(data, imgW, x1, y1, x2, y2) {
  const w = Math.round(x2 - x1), h = Math.round(y2 - y1);
  const result = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const px = Math.round(x1 + x), py = Math.round(y1 + y);
      const i = (py * imgW + px) * 4;
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      row.push(255 - gray);
    }
    result.push(row);
  }
  return result;
}

async function main() {
  const { matchSmallDigit, preloadTemplates } = require("../lib/template-match");
  const { recognizeBoard } = require("../lib/ocr");
  preloadTemplates();
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => { const na = parseInt(a), nb = parseInt(b); return (na - nb) || a.localeCompare(b); })
    .slice(0, 10);

  // 收集所有候选格的OCR匹配结果（用于阈值遍历）
  // { gridR, gridC, subR, subC, positionDigit, confidence, isTruePositive, isFalsePositive }
  const allSamples = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const truth = parseGrid(GROUND_TRUTH[idx]);
    const imgPath = join(IMG_DIR, file);
    const buf = readFileSync(imgPath);
    const png = PNG.sync.read(buf);
    const imgData = png.data;
    const imgW = png.width;

    // 用GT大数字计算标准候选数
    const stdCands = computeStandardCandidates(truth);

    // OCR大数字识别（用于确认哪些格确实是大数字 — 防止GT有但图里看不清）
    const ocrResult = await recognizeBoard(buf, logger);

    // 网格坐标（和ocr.ts一致）
    const gridH = [18,146,274,402,530,658,786,914,1042,1170];
    const gridV = [18,146,274,402,530,658,786,914,1042,1170];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (truth[r][c] > 0) continue; // 大数字格，跳过

        const gtCands = stdCands[r][c]; // GT候选集

        const x1 = gridV[c], y1 = gridH[r];
        const cellW = gridV[c+1] - x1, cellH = gridH[r+1] - y1;
        const subW = cellW / 3, subH = cellH / 3;

        // 对每个子格位置做小模板匹配
        for (let v = 1; v <= 9; v++) {
          const sr = Math.floor((v - 1) / 3);
          const sc = (v - 1) % 3;
          const pad = 0.15;
          const sx1 = x1 + sc * subW + subW * pad;
          const sy1 = y1 + sr * subH + subH * pad;
          const sx2 = x1 + (sc + 1) * subW - subW * pad;
          const sy2 = y1 + (sr + 1) * subH - subH * pad;

          const pixels = extractGrayscale(imgData, imgW, sx1, sy1, sx2, sy2);
          const sw = Math.round(sx2 - sx1), sh = Math.round(sy2 - sy1);
          if (sw < 3 || sh < 3) continue;

          const sr2 = matchSmallDigit(pixels, sw, sh);
          const posDigit = sr2.digit; // 模板匹配识别的数字
          const conf = sr2.confidence;

          // 该位置的GT：标准布局下位置v对应数字v，但也可能是倒置布局
          const isTrue = gtCands.has(posDigit);
          const isFalse = !gtCands.has(posDigit) && posDigit > 0;

          allSamples.push({
            file, r, c, pos: v, posDigit, conf,
            isTrue, isFalse,
            gtCands: [...gtCands],
          });
        }
      }
    }
  }

  console.log(`总候选位置样本: ${allSamples.length}`);
  const totalPositions = allSamples.filter(s => s.isTrue).length;
  const totalNegatives = allSamples.filter(s => s.isFalse).length;
  console.log(`其中应有候选数: ${totalPositions}, 不应有: ${totalNegatives}\n`);

  // 阈值扫描(0.25 ~ 0.70, step 0.025)
  console.log("阈值扫描 (阈值越高=越严格=越少误检):");
  console.log(`${"阈值".padStart(6)} ${"精确率".padStart(7)} ${"召回率".padStart(7)} ${"F1".padStart(7)} ${"漏检".padStart(6)} ${"误检".padStart(6)} ${"总数".padStart(6)}`);
  console.log("-".repeat(52));

  let bestF1 = 0, bestThreshold = 0.35;
  const thresholdResults = [];

  for (let th = 0.25; th <= 0.70; th += 0.025) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const s of allSamples) {
      const pred = s.confidence > th ? s.posDigit : 0;
      const truth2 = s.isTrue ? s.posDigit : 0;
      if (pred > 0 && truth2 > 0) tp++;
      else if (pred > 0 && truth2 === 0) fp++;
      else if (pred === 0 && truth2 === 0) tn++;
      else if (pred === 0 && truth2 > 0) fn++;
    }

    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * precision * recall / (precision + recall) || 0;

    thresholdResults.push({ th, precision, recall, f1, tp, fp, fn });

    const marker = f1 > bestF1 ? " ←" : "";
    console.log(`${(th.toFixed(3)).padStart(6)} ${(precision*100).toFixed(1).padStart(6)}% ${(recall*100).toFixed(1).padStart(6)}% ${(f1*100).toFixed(1).padStart(6)}% ${String(fn).padStart(6)} ${String(fp).padStart(6)} ${String(tp+fp).padStart(6)}${marker}`);

    if (f1 > bestF1) { bestF1 = f1; bestThreshold = th; }
  }

  // 最佳阈值详情
  const best = thresholdResults.find(r => r.th === bestThreshold);
  const bestF1pct = (bestF1 * 100).toFixed(1);
  console.log(`\n最佳阈值: ${bestThreshold.toFixed(3)} (F1=${bestF1pct}%, 精确率=${(best.precision*100).toFixed(1)}%, 召回率=${(best.recall*100).toFixed(1)}%)`);
  console.log(`  真阳性: ${best.tp}  假阳性: ${best.fp}  漏检: ${best.fn}`);

  // 当前阈值（ocr.ts 中 small digit 用 0.35）
  console.log(`\n当前 ocr.ts 使用阈值: 0.35`);
  console.log(`建议更新为: ${bestThreshold.toFixed(3)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
