/**
 * 批量有监督评估 + 模板提取
 * 用10张图片+正确答案，评估识别准确率，提取正确识别的数字作为新模板
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } = require("fs");
const { join, extname } = require("path");
const { PNG } = require("pngjs");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(__dirname, "..", "templates_extracted");

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

async function main() {
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  preloadTemplates();
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .slice(0, 10);

  // 全局累加器
  const accumulators = {
    big: Array.from({length:10}, () => ({ sum: null, count: 0, w: 24, h: 36 })),
    small: Array.from({length:10}, () => ({ sum: null, count: 0, w: 14, h: 20 })),
  };

  // 全局混淆矩阵
  const globalConf = Array.from({length:10}, () => Array(10).fill(0));
  let globalCorrect = 0, globalWrong = 0;
  let globalCorrectBig = 0, globalTotalBig = 0;
  let globalMissed = 0, globalFalsePos = 0, globalWrongDigit = 0;

  let totalOcrMs = 0;
  const perImageStats = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const truth = parseGrid(GROUND_TRUTH[idx]);
    const imgPath = join(IMG_DIR, file);
    const buf = readFileSync(imgPath);

    // 解码图片（用于提取像素）
    const png = PNG.sync.read(buf);
    const imgData = png.data;
    const imgW = png.width;
    const imgH = png.height;

    const t1 = Date.now();
    const result = await recognizeBoard(buf, logger);
    const ocrMs = Date.now() - t1;
    totalOcrMs += ocrMs;

    let corr = 0, wrong = 0, corrBig = 0, totalBigTruth = 0;
    let missed = 0, falsePos = 0, wrongDigit = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const t = truth[r][c];
        const cell = result.cells[r][c];
        const p = (cell.type === "given" || cell.type === "deduced") ? cell.value : 0;

        globalConf[t][p]++;

        if (t > 0) totalBigTruth++;
        if (t === p) { corr++; if (t > 0) corrBig++; }
        else {
          wrong++;
          if (t > 0 && p > 0 && p !== t) wrongDigit++;
          else if (t > 0 && p === 0) missed++;
          else if (t === 0 && p > 0) falsePos++;
        }
      }
    }

    globalCorrect += corr; globalWrong += wrong;
    globalCorrectBig += corrBig; globalTotalBig += totalBigTruth;
    globalMissed += missed; globalFalsePos += falsePos; globalWrongDigit += wrongDigit;

    perImageStats.push({
      file, ocrMs, corr, wrong, corrBig, totalBigTruth, missed, falsePos, wrongDigit,
      givensTruth: truth.flat().filter(v=>v>0).length,
      givensOcr: result.cells.flat().filter(c=>c.type==="given"||c.type==="deduced").length,
    });

    // 提取模板
    const gridH = [18,146,274,402,530,658,786,914,1042,1170];
    const gridV = [18,146,274,402,530,658,786,914,1042,1170];

    // 用GT大数字计算标准候选数（整图只算一次）
    const stdCands = computeStandardCandidates(truth);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const t = truth[r][c];
        const x1 = gridV[c], y1 = gridH[r];
        const cellW = gridV[c+1] - x1, cellH = gridH[r+1] - y1;

        if (t > 0) {
          // 大数字：用正确答案标注提取
          const inset = cellW * 0.12;
          const cx1 = Math.round(x1+inset), cy1 = Math.round(y1+inset);
          const cx2 = Math.round(x1+cellW-inset), cy2 = Math.round(y1+cellH-inset);
          const bigPx = extractScaled(imgData, imgW, cx1, cy1, cx2, cy2, 24, 36);
          if (bigPx) {
            const acc = accumulators.big[t];
            if (!acc.sum) acc.sum = bigPx.map(r => r.slice());
            else for (let y=0;y<36;y++) for(let x=0;x<24;x++) acc.sum[y][x] += bigPx[y][x];
            acc.count++;
          }
        } else {
          // 候选数：用GT计算的标准候选数作为提取依据
          const subW = cellW/3, subH = cellH/3;
          for (let v = 1; v <= 9; v++) {
            if (!stdCands[r][c].has(v)) continue;
            const sr = Math.floor((v-1)/3), sc = (v-1)%3;
            const pad = 0.15;
            const sx1 = Math.round(x1+sc*subW+subW*pad), sy1 = Math.round(y1+sr*subH+subH*pad);
            const sx2 = Math.round(x1+(sc+1)*subW-subW*pad), sy2 = Math.round(y1+(sr+1)*subH-subH*pad);
            const smallPx = extractScaled(imgData, imgW, sx1, sy1, sx2, sy2, 14, 20);
            if (smallPx) {
              const acc = accumulators.small[v];
              if (!acc.sum) acc.sum = smallPx.map(r => r.slice());
              else for (let y=0;y<20;y++) for(let x=0;x<14;x++) acc.sum[y][x] += smallPx[y][x];
              acc.count++;
            }
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════
  // 逐图报告
  // ═══════════════════════════════════════
  console.log("逐图识别准确率:\n");
  console.log(`${"文件".padEnd(8)} ${"正确".padStart(4)} ${"错误".padStart(4)} ${"准确率".padStart(7)} ${"大数对".padStart(7)} ${"漏识".padStart(4)} ${"误识".padStart(4)} ${"错字".padStart(4)} ${"OCRms".padStart(6)}`);
  console.log("-".repeat(60));
  for (const s of perImageStats) {
    const acc = (s.corr / 81 * 100).toFixed(1);
    console.log(`${s.file.padEnd(8)} ${String(s.corr).padStart(4)} ${String(s.wrong).padStart(4)} ${(acc+"%").padStart(7)} ${(s.corrBig+"/"+s.totalBigTruth).padStart(7)} ${String(s.missed).padStart(4)} ${String(s.falsePos).padStart(4)} ${String(s.wrongDigit).padStart(4)} ${(s.ocrMs+"ms").padStart(6)}`);
  }

  // ═══════════════════════════════════════
  // 总混淆矩阵
  // ═══════════════════════════════════════
  console.log(`\n总混淆矩阵 (行=正确答案, 列=OCR识别):`);
  console.log(`     ${"0".padStart(3)}${"1".padStart(3)}${"2".padStart(3)}${"3".padStart(3)}${"4".padStart(3)}${"5".padStart(3)}${"6".padStart(3)}${"7".padStart(3)}${"8".padStart(3)}${"9".padStart(3)}`);
  for (let t = 0; t <= 9; t++) {
    if (globalConf[t].every(v => v === 0)) continue;
    const label = t === 0 ? "空" : String(t);
    const row = globalConf[t].map(v => String(v).padStart(3)).join("");
    console.log(`${label.padStart(3)}: ${row}`);
  }

  // ═══════════════════════════════════════
  // 总计
  // ═══════════════════════════════════════
  const totalCells = files.length * 81;
  const totalAcc = (globalCorrect / totalCells * 100).toFixed(1);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`总计: ${files.length}图 ${totalCells}格`);
  console.log(`正确: ${globalCorrect} (${totalAcc}%)  错误: ${globalWrong}`);
  console.log(`大数字正确: ${globalCorrectBig}/${globalTotalBig} (${(globalCorrectBig/globalTotalBig*100).toFixed(1)}%)`);
  console.log(`漏识别: ${globalMissed}  误识别: ${globalFalsePos}  数字错: ${globalWrongDigit}`);
  console.log(`OCR平均: ${(totalOcrMs/files.length).toFixed(0)}ms/图`);

  // ═══════════════════════════════════════
  // 保存提取的模板
  // ═══════════════════════════════════════
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  console.log(`\n提取的模板样本数:`);
  for (const size of ["big", "small"]) {
    const accs = size === "big" ? accumulators.big : accumulators.small;
    for (let digit = 1; digit <= 9; digit++) {
      const acc = accs[digit];
      if (acc.count === 0) { console.log(`  ${size}_${digit}: 0 (无样本!)`); continue; }
      const pixels = acc.sum.map(row => row.map(v => Math.round(v/acc.count)));
      let dark = 0;
      for (const row of pixels) for (const v of row) if (v>80) dark++;
      writeFileSync(join(OUT_DIR, `${size}_${digit}.json`),
        JSON.stringify({ digit, w: acc.w, h: acc.h, pixels, darkCount: dark, sampleCount: acc.count }));
      console.log(`  ${size}_${digit}: ${acc.count}样本 ${dark}暗像素`);
    }
  }
  console.log(`\n模板保存到: ${OUT_DIR}`);
  console.log(`复制到 templates/ 替换: cp ${OUT_DIR}/* templates/`);
}

function computeStandardCandidates(givens) {
  const cands = Array.from({length:9}, () =>
    Array.from({length:9}, () => new Set([1,2,3,4,5,6,7,8,9]))
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (givens[r][c] === 0) continue;
      const v = givens[r][c];
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

function extractScaled(data, imgW, x1, y1, x2, y2, outW, outH) {
  const inW = x2 - x1, inH = y2 - y1;
  if (inW < 2 || inH < 2) return null;
  const result = [];
  for (let y = 0; y < outH; y++) {
    const row = [];
    const sy = y1 + (y/outH)*inH;
    const y0 = Math.floor(sy), yf = Math.min(y0+1, Math.round(y2)-1);
    const yFrac = sy - y0;
    for (let x = 0; x < outW; x++) {
      const sx = x1 + (x/outW)*inW;
      const x0 = Math.floor(sx), xf = Math.min(x0+1, Math.round(x2)-1);
      const xFrac = sx - x0;
      const v00 = grayAt(data,imgW,x0,y0), v10 = grayAt(data,imgW,xf,y0);
      const v01 = grayAt(data,imgW,x0,yf), v11 = grayAt(data,imgW,xf,yf);
      const top = v00*(1-xFrac)+v10*xFrac;
      const bottom = v01*(1-xFrac)+v11*xFrac;
      row.push(Math.round(255-(top*(1-yFrac)+bottom*yFrac)));
    }
    result.push(row);
  }
  return result;
}
function grayAt(data,w,x,y) {
  const i = (Math.round(y)*w+Math.round(x))*4;
  return 0.299*data[i]+0.587*data[i+1]+0.114*data[i+2];
}

main().catch(e => { console.error(e); process.exit(1); });
