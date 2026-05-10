/**
 * 候选数墨迹检测阈值校准
 *
 * 思路：小数字用"位置=数字"的确定性映射，只需检测子格有无墨迹
 * 校准 darkRatio 阈值（暗像素占比），找精确率/召回率最优值
 */
const { readFileSync, readdirSync } = require("fs");
const { join, extname } = require("path");
const { PNG } = require("pngjs");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");

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

function computeStandardCandidates(givens) {
  const cands = Array.from({length:9}, () =>
    Array.from({length:9}, () => new Set([1,2,3,4,5,6,7,8,9]))
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (givens[r][c] === 0) continue;
      const v = givens[r][c];
      for (let i = 0; i < 9; i++) { cands[r][i].delete(v); cands[i][c].delete(v); }
      const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          cands[br+dr][bc+dc].delete(v);
    }
  }
  return cands;
}

// 检测子格是否有墨迹
function hasInk(data, imgW, x1, y1, x2, y2) {
  let darkCount = 0, totalCount = 0;
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      const i = (y * imgW + x) * 4;
      const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      if (gray < 100) darkCount++;
      totalCount++;
    }
  }
  return { darkCount, totalCount, ratio: darkCount / totalCount };
}

async function main() {
  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => { const na = parseInt(a), nb = parseInt(b); return (na - nb) || a.localeCompare(b); })
    .slice(0, 10);

  // 收集所有子格的墨迹数据
  // { ratio, digit, isTrue } — 每个9候选位置一条
  const allInkSamples = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const truth = parseGrid(GROUND_TRUTH[idx]);
    const stdCands = computeStandardCandidates(truth);

    const buf = readFileSync(join(IMG_DIR, file));
    const png = PNG.sync.read(buf);
    const data = png.data;
    const imgW = png.width;

    const gridH = [18,146,274,402,530,658,786,914,1042,1170];
    const gridV = [18,146,274,402,530,658,786,914,1042,1170];

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (truth[r][c] > 0) continue; // 大数字格跳过
        const gtCands = stdCands[r][c];

        const x1 = gridV[c], y1 = gridH[r];
        const cellW = gridV[c+1] - x1, cellH = gridH[r+1] - y1;
        const subW = cellW / 3, subH = cellH / 3;

        for (let v = 1; v <= 9; v++) {
          const sr = Math.floor((v - 1) / 3);
          const sc = (v - 1) % 3;
          const pad = 0.15;
          const ink = hasInk(data, imgW,
            x1 + sc * subW + subW * pad, y1 + sr * subH + subH * pad,
            x1 + (sc + 1) * subW - subW * pad, y1 + (sr + 1) * subH - subH * pad,
          );
          allInkSamples.push({
            file, r, c, pos: v,
            ratio: ink.ratio, darkCount: ink.darkCount, total: ink.totalCount,
            isTrue: gtCands.has(v),
          });
        }
      }
    }
  }

  // 统计分布
  const trueRatios = allInkSamples.filter(s => s.isTrue).map(s => s.ratio);
  const falseRatios = allInkSamples.filter(s => !s.isTrue).map(s => s.ratio);

  trueRatios.sort((a,b) => a-b);
  falseRatios.sort((a,b) => a-b);

  console.log("墨迹密度分布 (暗像素占比):");
  console.log(`  应有墨迹: ${trueRatios.length}个位置`);
  console.log(`    min=${trueRatios[0]?.toFixed(3)} p10=${trueRatios[Math.floor(trueRatios.length*0.1)]?.toFixed(3)} median=${trueRatios[Math.floor(trueRatios.length*0.5)]?.toFixed(3)} p90=${trueRatios[Math.floor(trueRatios.length*0.9)]?.toFixed(3)} max=${trueRatios[trueRatios.length-1]?.toFixed(3)}`);
  console.log(`  应无墨迹: ${falseRatios.length}个位置`);
  console.log(`    min=${falseRatios[0]?.toFixed(3)} p10=${falseRatios[Math.floor(falseRatios.length*0.1)]?.toFixed(3)} median=${falseRatios[Math.floor(falseRatios.length*0.5)]?.toFixed(3)} p90=${falseRatios[Math.floor(falseRatios.length*0.9)]?.toFixed(3)} max=${falseRatios[falseRatios.length-1]?.toFixed(3)}`);

  // 阈值扫描
  console.log(`\n阈值扫描 (darkRatio > th → 判定有候选):`);
  console.log(`${"阈值%".padStart(7)} ${"精确率".padStart(7)} ${"召回率".padStart(7)} ${"F1".padStart(7)} ${"漏检".padStart(6)} ${"误检".padStart(6)}`);
  console.log("-".repeat(48));

  let bestF1 = 0, bestTh = 0.08;
  for (let th = 0.01; th <= 0.20; th += 0.005) {
    let tp = 0, fp = 0, tn = 0, fn = 0;
    for (const s of allInkSamples) {
      const pred = s.ratio > th;
      if (pred && s.isTrue) tp++;
      else if (pred && !s.isTrue) fp++;
      else if (!pred && !s.isTrue) tn++;
      else if (!pred && s.isTrue) fn++;
    }
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1 = 2 * precision * recall / (precision + recall) || 0;

    const m = f1 > bestF1 ? " ←" : "";
    console.log(`${(th*100).toFixed(1).padStart(6)}% ${(precision*100).toFixed(1).padStart(6)}% ${(recall*100).toFixed(1).padStart(6)}% ${(f1*100).toFixed(1).padStart(6)}% ${String(fn).padStart(6)} ${String(fp).padStart(6)}${m}`);
    if (f1 > bestF1) { bestF1 = f1; bestTh = th; }
  }

  // 最佳阈值
  let tp = 0, fp = 0, fn = 0;
  for (const s of allInkSamples) {
    const pred = s.ratio > bestTh;
    if (pred && s.isTrue) tp++;
    else if (pred && !s.isTrue) fp++;
    else if (!pred && s.isTrue) fn++;
  }
  const bestPrec = tp / (tp + fp) * 100;
  const bestRec = tp / (tp + fn) * 100;
  console.log(`\n最佳阈值: ${(bestTh*100).toFixed(1)}% (F1=${(bestF1*100).toFixed(1)}%)`);
  console.log(`精确率: ${bestPrec.toFixed(1)}%  召回率: ${bestRec.toFixed(1)}%`);
  console.log(`真阳:${tp}  假阳:${fp}  漏检:${fn}`);
  console.log(`\n当前 ocr.ts 使用阈值: 8% → 建议更新为: ${(bestTh*100).toFixed(1)}%`);
}

main().catch(e => { console.error(e); process.exit(1); });
