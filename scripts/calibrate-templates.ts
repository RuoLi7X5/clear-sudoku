/**
 * 模板自校准 — 用已知答案对比OCR结果，将误读数字的像素加入正确模板池
 * 迭代10轮，逐步提升识别精度
 * 用法: cd external/clear-sudoku && npx ts-node scripts/calibrate-templates.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

const ANSWERS = [
  "006002800080600270025000061604070032200304700030201900042080600160925007000006020",
  "005070080030504100000308057500000090080406510004005008056003041140050600070641005",
  "010073005005009130309156870050690700000708050002345001037560200006007510500900007",
  "002005090000800004080000200006000905090001003230000780008506070000400009060070300",
  "043009100816037009097100080734910026625370910981060700350001000460700001179040000",
  "600009005020536047005100609007900513080300974300400286000603751000701490000090360",
  "700208005020050070000000200308010062200805731070320800030070010007590306600183407",
  "310420600020009010009001002032094801080270030040138200070853926203940100098012040",
  "726894315590106000081520000100602450048050100050401000015068020060310500800245001",
  "002068040306020008890070620060490872980002406020086010630249085008600200209810060",
  "813406902570120004402003010925381746104207080080045201600004120008010000001700000",
  "704100069030600407096070023017060030460700001309010746641087390978306004253941678",
  "000197082802050079070020400000900000006005730500030004400500200020089047000000060",
  "034705000728614009600023400800070000370008002002030800263047001497001060581300704",
  "010300040030009200700000038042090070000720400087134092000057010401083020009200300",
  "003800400600400003040030009004000930932018004567943218458200391206380745370004862",
  "140007090002930147907041006001000904058409710409013085700100400090304001014802000",
  "010090703009007010000005490000250009020700000600080070200400307070508000001070050",
  "203007500780563204450200370530920040024005900697834125902050400305009002040302059",
  "060004082002803675500672904006738000000900008000020700900267843003089007070305200",
  "620079103000100060001306500100687009039215706006493015000000001900031050018000000",
  "007006000500010600601205000106030028800652100002108006305860200214593867068020030",
  "120060000006100009400008010200000400004050923090234071051003007000600130300010090",
  "402695308000708025850200009200901080060800092908402500500380206080526900623109850",
  "003008600400000358050300009002090013900003086030004097000005060006200805085060004",
  "210460900408190006396070140001009004640210000509604017004001300100040000000006401",
  "038006020014023000692500003853069000921300006467218359280004030049600005070000400",
  "302090508005328040089500230820900074003481625004000890007600480000839702008040050",
  "500678210008419075071253480107806530800105790050147108400702801010084007780501940",
  "000800540400630208080004000804070350500008907060350824000002700600000005070010002",
  "641208900700040008890071046270800401164723895080014700028460000416007080907182604",
  "005000001090170052102053006051300249040521003200004510060019025027635104510040000",
  "000100002021000038800027100003890050080040300100006084200010060010004800050600013",
  "020493008053708640480006030340079086005800304008304000530940867804037900070085403",
  "010786400408905070907104000004697020000841000070352046700209004002408300040503010",
  "500060079098107056070003800000004060730200001009001000000000008980000020010080700",
  "103570000058103070796284513030407050579018042600725700900000080007002400060000000",
  "120089674004016002000402510401053200002048156500201340010807420700124000248095701",
  "204500003358040720006002450402007500005900042080254376503781204047020005820405007",
  "000000001080200600006010020050006040004950062600300100300800010040007009005090000",
];

function answerGrid(s: string): number[][] {
  const g: number[][] = [];
  for (let r = 0; r < 9; r++) {
    g.push([]);
    for (let c = 0; c < 9; c++) g[r].push(parseInt(s[r * 9 + c]));
  }
  return g;
}

function solve(grid: number[][]): number[][] | null {
  const board = grid.map(row => [...row]);
  function isValid(r: number, c: number, v: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === v || board[i][c] === v) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (board[br + dr][bc + dc] === v) return false;
    return true;
  }
  function bt(): boolean {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (board[r][c] === 0) {
          for (let v = 1; v <= 9; v++)
            if (isValid(r, c, v)) { board[r][c] = v; if (bt()) return true; board[r][c] = 0; }
          return false;
        }
    return true;
  }
  return bt() ? board : null;
}

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = Math.round(y) * imgW * 4 + Math.round(x) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

async function extractCellPixels(
  data: Uint8Array, width: number, vLines: number[], hLines: number[],
  r: number, c: number,
): Promise<number[][]> {
  const x1 = vLines[c], y1 = hLines[r];
  const x2 = vLines[c + 1], y2 = hLines[r + 1];
  const cellW = x2 - x1, cellH = y2 - y1;
  const inset = Math.max(2, cellW * 0.12);
  const cx1 = x1 + inset, cy1 = y1 + inset;
  const cx2 = x2 - inset, cy2 = y2 - inset;
  const w = Math.round(cx2 - cx1), h = Math.round(cy2 - cy1);
  const pixels: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(255 - grayAt(data, width, Math.round(cx1 + x), Math.round(cy1 + y)));
    }
    pixels.push(row);
  }
  return pixels;
}

function scaleTo(input: number[][], inW: number, inH: number, outW: number, outH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < outH; y++) {
    const row: number[] = [];
    const srcY = (y / outH) * inH, y0 = Math.floor(srcY), y1 = Math.min(y0 + 1, inH - 1), yFrac = srcY - y0;
    for (let x = 0; x < outW; x++) {
      const srcX = (x / outW) * inW, x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, inW - 1), xFrac = srcX - x0;
      const v00 = input[y0]?.[x0] ?? 0, v10 = input[y0]?.[x1] ?? 0;
      const v01 = input[y1]?.[x0] ?? 0, v11 = input[y1]?.[x1] ?? 0;
      row.push((v00 * (1 - xFrac) + v10 * xFrac) * (1 - yFrac) + (v01 * (1 - xFrac) + v11 * xFrac) * yFrac);
    }
    out.push(row);
  }
  return out;
}

const TPL_DIR = join(__dirname, "..", "templates");
const TPL_W = 24, TPL_H = 36;

/** 加载所有样本（兼容单模板和多模板格式） */
function loadBigSamples(): Map<number, number[][][]> {
  const map = new Map<number, number[][][]>();
  for (let d = 1; d <= 9; d++) {
    map.set(d, []);
    const path = join(TPL_DIR, `big_${d}.json`);
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    if (raw.samples && Array.isArray(raw.samples)) {
      for (const s of raw.samples) map.get(d)!.push(s.pixels);
    } else if (raw.pixels) {
      map.get(d)!.push(raw.pixels);
    }
  }
  return map;
}

/** 保存所有样本（不平均，保留多样性） */
function saveMultiSampleTemplates(map: Map<number, number[][][]>) {
  for (let d = 1; d <= 9; d++) {
    const samples = map.get(d) || [];
    if (samples.length === 0) continue;

    const entries = samples.map(pixels => {
      let darkCount = 0;
      for (const row of pixels) for (const v of row) if (v > 128) darkCount++;
      return { pixels, darkCount };
    });

    writeFileSync(join(TPL_DIR, `big_${d}.json`), JSON.stringify({
      digit: d, w: TPL_W, h: TPL_H,
      samples: entries,
    }));
  }
}

async function main() {
  // Dynamic import for compiled modules
  const { recognizeBoard, preloadTemplates, detectGridLines } = require("../lib/ocr");
  const { matchBigDigit } = require("../lib/template-match");

  preloadTemplates();
  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  // Load initial template samples
  const accumulatedSamples = loadBigSamples();
  console.log(`初始样本: ${[...accumulatedSamples.entries()].map(([d,s])=>`${d}:${s.length}`).join(", ")}`);

  const ROUNDS = 10;
  let prevTotalErrors = Infinity;

  for (let round = 0; round < ROUNDS; round++) {
    // Average + save current templates (update template files for OCR to use)
    saveMultiSampleTemplates(accumulatedSamples);
    // Force reload templates (bypass cache)
    const { reloadTemplates } = require("../lib/template-match");
    reloadTemplates();

    let totalCells = 0, totalErrors = 0, totalCorrect = 0;
    const newSamples: Map<number, number[][][]> = new Map();
    for (let d = 1; d <= 9; d++) newSamples.set(d, []);

    for (let idx = 0; idx < ANSWERS.length; idx++) {
      const imgPath = join(IMG_DIR, `${idx + 1}.png`);
      if (!existsSync(imgPath)) continue;

      const puzzle = answerGrid(ANSWERS[idx]);
      const sol = solve(puzzle);
      if (!sol) { console.log(`  [${idx + 1}] 无解, 跳过`); continue; }
      const buf = readFileSync(imgPath);
      const ocr = await recognizeBoard(buf, logger);

      // Decode image for pixel extraction
      const png = PNG.sync.read(buf);
      const data = png.data as Uint8Array;
      const grid = detectGridLines(data, png.width, png.height);
      const hLines = grid.horizontal.slice(0, 10);
      const vLines = grid.vertical.slice(0, 10);

      // Run raw template match on every cell (bypass sudoku validation)
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const trueVal = sol[r][c];
          const x1 = vLines[c], y1 = hLines[r];
          const x2 = vLines[c + 1], y2 = hLines[r + 1];
          const cellW = x2 - x1, cellH = y2 - y1;
          if (cellW < 5 || cellH < 5) continue;

          const inset = Math.max(2, cellW * 0.12);
          const cx1 = x1 + inset, cy1 = y1 + inset;
          const cx2 = x2 - inset, cy2 = y2 - inset;
          const bigPixels: number[][] = [];
          for (let y = Math.round(cy1); y < Math.round(cy2); y++) {
            const row: number[] = [];
            for (let x = Math.round(cx1); x < Math.round(cx2); x++)
              row.push(255 - grayAt(data, png.width, x, y));
            bigPixels.push(row);
          }
          const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

          // Raw template match (no sudoku validation)
          const { matchBigDigit } = require("../lib/template-match");
          const match = matchBigDigit(bigPixels, bw, bh);

          if (match.confidence > 0.70) {
            totalCells++;
            if (match.digit === trueVal) {
              totalCorrect++;
            } else {
              totalErrors++;
              // Extract and add to CORRECT digit's template pool
              try {
                const scaled = scaleTo(bigPixels, bw, bh, TPL_W, TPL_H);
                if (!newSamples.has(trueVal)) newSamples.set(trueVal, []);
                newSamples.get(trueVal)!.push(scaled);
              } catch {}
            }
          }
        }
      }
    }

    const errRate = totalCells > 0 ? (totalErrors / totalCells * 100).toFixed(1) : "N/A";
    const accRate = totalCells > 0 ? (totalCorrect / totalCells * 100).toFixed(1) : "N/A";
    console.log(`[Round ${round + 1}] ${totalCorrect}/${totalCells} correct (${accRate}%), ${totalErrors} errors`);

    // Add new samples to accumulated pool
    let addedTotal = 0;
    for (const [digit, samples] of newSamples) {
      if (samples.length > 0) {
        if (!accumulatedSamples.has(digit)) accumulatedSamples.set(digit, []);
        accumulatedSamples.get(digit)!.push(...samples);
        addedTotal += samples.length;
      }
    }
    console.log(`         新增 ${addedTotal} 个模板样本`);

    if (totalErrors === 0) {
      console.log(`\n完美！识别精度已达100%`);
      break;
    }
    if (totalErrors >= prevTotalErrors) {
      console.log(`         误差不再下降，停止迭代`);
      break;
    }
    prevTotalErrors = totalErrors;
  }

  // Final save
  saveMultiSampleTemplates(accumulatedSamples);
  console.log(`\n最终样本: ${[...accumulatedSamples.entries()].map(([d,s])=>`${d}:${s.length}`).join(", ")}`);
  console.log(`模板已保存到 templates/big_*.json`);
}

main().catch(e => { console.error(e); process.exit(1); });
