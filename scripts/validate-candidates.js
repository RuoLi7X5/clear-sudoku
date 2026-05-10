/**
 * 候选数识别准确率验证 — OCR候选 vs 标准计算候选
 * 对所有非大数字格，比较OCR检测的候选集与标准候选集
 */
const { readFileSync, readdirSync } = require("fs");
const { join, extname } = require("path");

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

async function main() {
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  preloadTemplates();
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => { const na = parseInt(a), nb = parseInt(b); return (na - nb) || a.localeCompare(b); })
    .slice(0, 10);

  let totalTP = 0, totalFP = 0, totalFN = 0, totalCells = 0;

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const truth = parseGrid(GROUND_TRUTH[idx]);
    const stdCands = computeStandardCandidates(truth);

    const buf = readFileSync(join(IMG_DIR, file));
    const ocrResult = await recognizeBoard(buf, logger);

    let tp = 0, fp = 0, fn = 0, cells = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (truth[r][c] > 0) continue; // 大数字格跳过
        cells++;

        const gtSet = stdCands[r][c];
        const ocrCands = new Set(ocrResult.cells[r][c].candidates);

        for (const v of gtSet) {
          if (ocrCands.has(v)) tp++;
          else fn++;
        }
        for (const v of ocrCands) {
          if (!gtSet.has(v)) fp++;
        }
      }
    }

    totalTP += tp; totalFP += fp; totalFN += fn; totalCells += cells;
    const prec = tp / (tp + fp) * 100 || 0;
    const rec = tp / (tp + fn) * 100 || 0;
    const f1 = 2 * prec * rec / (prec + rec) || 0;
    console.log(`${file}: GT候选总数=${gtCountForFile(truth)} TP=${tp} FP=${fp} FN=${fn} 精确率=${prec.toFixed(1)}% 召回率=${rec.toFixed(1)}% F1=${f1.toFixed(1)}%`);
  }

  const precAll = totalTP / (totalTP + totalFP) * 100 || 0;
  const recAll = totalTP / (totalTP + totalFN) * 100 || 0;
  const f1All = 2 * precAll * recAll / (precAll + recAll) || 0;
  console.log(`\n总计: TP=${totalTP} FP=${totalFP} FN=${totalFN} 精确率=${precAll.toFixed(1)}% 召回率=${recAll.toFixed(1)}% F1=${f1All.toFixed(1)}%`);
}

function gtCountForFile(truth) {
  let total = 0;
  const stdCands = computeStandardCandidates(truth);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (truth[r][c] === 0) total += stdCands[r][c].size;
  return total;
}

main().catch(e => { console.error(e); process.exit(1); });
