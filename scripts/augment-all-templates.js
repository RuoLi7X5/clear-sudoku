/**
 * augment-all-templates.js — 三阶段模板样本扩充
 *
 * Phase A: images/ 手写照片 → big_*.json 补充
 * Phase B: 系统字体渲染 → testoutput/ → OCR → digital_*.json 补充
 * Phase C: images/Xsudoku/ → xsudoku_*.json 补充
 *
 * 用法: node scripts/augment-all-templates.js
 * 依赖: lib/ 已编译
 */

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");
const { recognizeBoard, extractGrayscale } = require("../lib/ocr");
const { BoardState } = require("../lib/board");
const { SudokuRenderer } = require("../lib/renderer");
const { PNG } = require("pngjs");

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const BASE_DIR = join(__dirname, "..");
const IMAGES_DIR = join(BASE_DIR, "..", "..", "images");
const XSUDOKU_DIR = join(IMAGES_DIR, "Xsudoku");
const TEST_OUTPUT_DIR = join(IMAGES_DIR, "testoutput");
const TEMPLATE_DIR = join(BASE_DIR, "templates");

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
  "813406902570120004402003010925341786104207080080045201600004120008010000001700000",
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

const MAX_SAMPLES_PER_DIGIT = 200;  // cap to prevent bloat
const N_SAMPLES_TARGET = 20;       // per digit target for existing big_*.json

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function loadTemplate(filePath) {
  if (!existsSync(filePath)) return { w: 24, h: 36, samples: [], pixels: [] };
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const allSamples = raw.samples || [];
  if (allSamples.length === 0 && raw.pixels && raw.pixels.length > 0) {
    allSamples.push({ pixels: raw.pixels, darkCount: raw.darkCount || 0 });
  }
  return { w: raw.w, h: raw.h, samples: allSamples, pixels: raw.pixels };
}

function saveTemplate(filePath, data) {
  const { w, h, pixels, darkCount, samples } = data;
  writeFileSync(filePath, JSON.stringify({ w, h, pixels, darkCount, samples }, null, 2));
}

function scalePixels(pixels, inW, inH, outW, outH) {
  const out = [];
  for (let y = 0; y < outH; y++) {
    const row = [];
    const srcY = (y / outH) * inH;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, inH - 1);
    const yFrac = srcY - y0;
    for (let x = 0; x < outW; x++) {
      const srcX = (x / outW) * inW;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, inW - 1);
      const xFrac = srcX - x0;
      const v00 = pixels[y0]?.[x0] ?? 0;
      const v10 = pixels[y0]?.[x1] ?? 0;
      const v01 = pixels[y1]?.[x0] ?? 0;
      const v11 = pixels[y1]?.[x1] ?? 0;
      row.push(Math.round((v00 * (1 - xFrac) + v10 * xFrac) * (1 - yFrac) + (v01 * (1 - xFrac) + v11 * xFrac) * yFrac));
    }
    out.push(row);
  }
  return out;
}

function grayAt(data, imgW, x, y) {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function extractCell(data, imgW, x1, y1, x2, y2) {
  const w = Math.round(x2 - x1), h = Math.round(y2 - y1);
  const pixels = [];
  let maxVal = 0;
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const v = 255 - grayAt(data, imgW, Math.round(x1 + x), Math.round(y1 + y));
      row.push(v);
      if (v > maxVal) maxVal = v;
    }
    pixels.push(row);
  }
  return { pixels, w, h, maxVal };
}

function isValidPlacement(board, r, c, v) {
  for (let cc = 0; cc < 9; cc++) if (board[r][cc] === v) return false;
  for (let rr = 0; rr < 9; rr++) if (board[rr][c] === v) return false;
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++)
    for (let dc = 0; dc < 3; dc++)
      if (board[br + dr][bc + dc] === v) return false;
  return true;
}

function decodePng(buf) {
  return PNG.sync.read(buf);
}

function findImageFile(dir, num) {
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const p = join(dir, `${num}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Phase A: Handwritten → big_*.json
// ═══════════════════════════════════════════════════════════════════

async function phaseA_handwritten(renderer) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase A: 手写照片 → big_*.json 补充                        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Load current big templates
  const bigData = {};
  for (let d = 1; d <= 9; d++) {
    const fp = join(TEMPLATE_DIR, `big_${d}.json`);
    bigData[d] = loadTemplate(fp);
    console.log(`  big_${d}: ${bigData[d].samples.length} 已有样本`);
  }

  // Process each image
  const collectedByDigit = {};
  for (let d = 1; d <= 9; d++) collectedByDigit[d] = [];

  let totalExtracted = 0;
  let totalSkipped = 0;

  for (let pi = 0; pi < 40; pi++) {
    const num = pi + 1;
    const answer = ANSWERS[pi];
    const imgPath = findImageFile(IMAGES_DIR, num);
    if (!imgPath) { console.log(`  [${num}/40] 图片不存在，跳过`); continue; }

    const buf = readFileSync(imgPath);
    // 解码图片（支持 PNG 和 JPEG）
    let png;
    try {
      if (imgPath.endsWith(".jpg") || imgPath.endsWith(".jpeg")) {
        const jpeg = require("jpeg-js");
        png = jpeg.decode(buf, { useTArray: true });
        png.data = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength);
      } else {
        png = decodePng(buf);
      }
    }
    catch { console.log(`  [${num}/40] ${imgPath.split(/[\\/]/).pop()} 解码失败，跳过`); continue; }

    const { data, width, height } = png;

    // OCR
    const ocrResult = await recognizeBoard(buf);
    const board = BoardState.fromOCR(ocrResult);
    const cells = ocrResult.cells;

    // Detect grid lines for cell extraction
    const { detectGridLines } = require("../lib/ocr");
    const grid = detectGridLines(data, width, height);
    const hL = grid.horizontal.slice(0, 10);
    const vL = grid.vertical.slice(0, 10);

    let extracted = 0, skipped = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expected = parseInt(answer[r * 9 + c], 10);
        const ocrVal = cells[r][c].value;
        if (ocrVal === 0) continue; // 空格不留样本

        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const cw = x2 - x1, ch = y2 - y1;
        if (cw < 5 || ch < 5) continue;

        // 直接用答案比对（答案即标准），不需要 isValidPlacement
        if (ocrVal === expected) {
          const inset = Math.max(2, cw * 0.12);
          const { pixels, maxVal } = extractCell(data, width, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
          if (maxVal >= 30) {
            const ph = pixels.length, pw = pixels[0]?.length || 0;
            let darkCount = 0;
            for (const row of pixels) for (const v of row) if (v > 128) darkCount++;
            collectedByDigit[expected].push({ pixels, w: pw, h: ph, darkCount });
            extracted++;
          }
        } else if (ocrVal !== expected) {
          skipped++;
        }
      }
    }

    const fname = imgPath.split(/[\\/]/).pop();
    console.log(`  [${num}/40] ${fname}: ${extracted} 样本, ${skipped} 跳过`);
    totalExtracted += extracted;
    totalSkipped += skipped;
  }

  console.log(`\n  总计: ${totalExtracted} 新样本, ${totalSkipped} 跳过\n`);

  // Merge and save
  for (let d = 1; d <= 9; d++) {
    const existing = bigData[d].samples || [];
    const newSamples = collectedByDigit[d];
    if (newSamples.length === 0) continue;

    // Normalize to template size (24×36)
    const tW = bigData[d].w || 24, tH = bigData[d].h || 36;
    const allSamples = [...existing];

    for (const s of newSamples) {
      if (allSamples.length >= MAX_SAMPLES_PER_DIGIT) break;
      if (s.w === tW && s.h === tH) {
        allSamples.push({ pixels: s.pixels, darkCount: s.darkCount });
      } else {
        const scaled = scalePixels(s.pixels, s.w, s.h, tW, tH);
        let dc = 0;
        for (const row of scaled) for (const v of row) if (v > 128) dc++;
        allSamples.push({ pixels: scaled, darkCount: dc });
      }
    }

    // Recompute mean (top-level pixels)
    let meanSum = 0, meanN = 0;
    const mean = [];
    for (let y = 0; y < tH; y++) {
      mean[y] = [];
      for (let x = 0; x < tW; x++) {
        let sum = 0;
        for (const s of allSamples) sum += (s.pixels[y]?.[x] ?? 0);
        mean[y][x] = Math.round(sum / allSamples.length);
        meanSum += mean[y][x];
        meanN++;
      }
    }
    let meanDc = 0;
    for (let y = 0; y < tH; y++) for (let x = 0; x < tW; x++) if (mean[y][x] > 128) meanDc++;

    const out = {
      w: tW, h: tH,
      pixels: mean,
      darkCount: meanDc,
      samples: allSamples,
    };
    saveTemplate(join(TEMPLATE_DIR, `big_${d}.json`), out);
    console.log(`  big_${d}: ${existing.length} → ${allSamples.length} samples`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase B: System font → testoutput/ → digital_*.json
// ═══════════════════════════════════════════════════════════════════

async function phaseB_digital(renderer) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase B: 系统字体渲染 → digital_*.json 补充                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

  // Load current digital templates
  const digData = {};
  for (let d = 1; d <= 9; d++) {
    const fp = join(TEMPLATE_DIR, `digital_${d}.json`);
    digData[d] = loadTemplate(fp);
    console.log(`  digital_${d}: ${digData[d].samples.length} 已有样本`);
  }

  const collectedByDigit = {};
  for (let d = 1; d <= 9; d++) collectedByDigit[d] = [];

  const PAD = 24, CS = 100;

  for (let pi = 0; pi < 40; pi++) {
    const num = pi + 1;
    const answer = ANSWERS[pi];

    // Build full-solution board
    const givens = Array.from({ length: 9 }, (_, r) => {
      const row = [];
      for (let c = 0; c < 9; c++) {
        const v = parseInt(answer[r * 9 + c], 10);
        row.push(v || 0);
      }
      return row;
    });
    const deduced = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );

    const board = new BoardState(givens, deduced, candidates);
    // Rebuild candidates for the board
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        board.candidates[r][c] = new Set([board.givens[r][c] || board.deduced[r][c] || 0].filter(v => v > 0));

    // Render with system font (Microsoft YaHei = default)
    try {
      const renderBuf = await renderer.render(board, { showCandidates: false });
      const outPath = join(TEST_OUTPUT_DIR, `${num}.png`);
      writeFileSync(outPath, renderBuf);

      // Re-OCR
      const ocrResult = await recognizeBoard(renderBuf);
      const cells = ocrResult.cells;

      // Extract samples from correctly recognized cells
      const png = decodePng(renderBuf);
      const { data, width, height } = png;
      let extracted = 0;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const expected = parseInt(answer[r * 9 + c], 10);
          const ocrVal = cells[r][c].value;
          if (ocrVal !== expected) continue;

          const x1 = PAD + c * CS, y1 = PAD + r * CS;
          const x2 = x1 + CS, y2 = y1 + CS;
          const inset = Math.max(2, CS * 0.12);
          const { pixels, maxVal } = extractCell(data, width, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
          if (maxVal < 30) continue;

          const ph = pixels.length, pw = pixels[0]?.length || 0;
          let darkCount = 0;
          for (const row of pixels) for (const v of row) if (v > 128) darkCount++;
          collectedByDigit[expected].push({ pixels, w: pw, h: ph, darkCount });
          extracted++;
        }
      }
      console.log(`  [${num}/40] ${num}.png → ${extracted} 样本`);
    } catch (err) {
      console.error(`  [${num}/40] 失败: ${err.message}`);
    }
  }

  // Merge and save
  console.log("");
  for (let d = 1; d <= 9; d++) {
    const existing = digData[d].samples || [];
    const newSamples = collectedByDigit[d];
    if (newSamples.length === 0) continue;

    const tW = digData[d].w || 24, tH = digData[d].h || 36;
    const allSamples = [...existing];

    for (const s of newSamples) {
      if (allSamples.length >= MAX_SAMPLES_PER_DIGIT) break;
      if (s.w === tW && s.h === tH) {
        allSamples.push({ pixels: s.pixels, darkCount: s.darkCount });
      } else {
        const scaled = scalePixels(s.pixels, s.w, s.h, tW, tH);
        let dc = 0;
        for (const row of scaled) for (const v of row) if (v > 128) dc++;
        allSamples.push({ pixels: scaled, darkCount: dc });
      }
    }

    // Recompute mean
    let meanSum = 0, meanN = 0;
    const mean = [];
    for (let y = 0; y < tH; y++) {
      mean[y] = [];
      for (let x = 0; x < tW; x++) {
        let sum = 0;
        for (const s of allSamples) sum += (s.pixels[y]?.[x] ?? 0);
        mean[y][x] = Math.round(sum / allSamples.length);
        meanSum += mean[y][x];
        meanN++;
      }
    }
    let meanDc = 0;
    for (let y = 0; y < tH; y++) for (let x = 0; x < tW; x++) if (mean[y][x] > 128) meanDc++;

    const out = {
      w: tW, h: tH,
      pixels: mean,
      darkCount: meanDc,
      samples: allSamples,
    };
    saveTemplate(join(TEMPLATE_DIR, `digital_${d}.json`), out);
    console.log(`  digital_${d}: ${existing.length} → ${allSamples.length} samples`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase C: Xsudoku → xsudoku_*.json
// ═══════════════════════════════════════════════════════════════════

async function phaseC_xsudoku(renderer) {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase C: XSudoku 图片 → xsudoku_*.json 补充                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  if (!existsSync(XSUDOKU_DIR)) {
    console.log("  Xsudoku 图片目录不存在，跳过\n");
    return;
  }

  // Load current xsudoku templates
  const xsData = {};
  for (let d = 1; d <= 9; d++) {
    const fp = join(TEMPLATE_DIR, `xsudoku_${d}.json`);
    xsData[d] = loadTemplate(fp);
    console.log(`  xsudoku_${d}: ${xsData[d].samples.length} 已有样本 (${xsData[d].w}x${xsData[d].h})`);
  }

  const collectedByDigit = {};
  for (let d = 1; d <= 9; d++) collectedByDigit[d] = [];

  const { detectGridLines } = require("../lib/ocr");

  for (let pi = 0; pi < 40; pi++) {
    const num = pi + 1;
    const answer = ANSWERS[pi];
    const imgPath = join(XSUDOKU_DIR, `${num}.png`);

    if (!existsSync(imgPath)) { console.log(`  [${num}/40] 图片不存在，跳过`); continue; }

    const buf = readFileSync(imgPath);
    let png;
    try { png = decodePng(buf); }
    catch { console.log(`  [${num}/40] 非PNG，跳过`); continue; }

    const { data, width, height } = png;

    // OCR
    let ocrResult;
    try {
      ocrResult = await recognizeBoard(buf);
    } catch (err) {
      console.log(`  [${num}/40] OCR失败: ${err.message}`);
      continue;
    }

    const cells = ocrResult.cells;

    // Detect grid
    const grid = detectGridLines(data, width, height);
    const hL = grid.horizontal.slice(0, 10);
    const vL = grid.vertical.slice(0, 10);

    let extracted = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expected = parseInt(answer[r * 9 + c], 10);
        const ocrVal = cells[r][c].value;
        if (ocrVal !== expected || ocrVal === 0) continue;

        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const cw = x2 - x1, ch = y2 - y1;
        if (cw < 5 || ch < 5) continue;

        const inset = Math.max(2, cw * 0.10);
        const { pixels, maxVal } = extractCell(data, width, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
        if (maxVal < 30) continue;

        const ph = pixels.length, pw = pixels[0]?.length || 0;
        let darkCount = 0;
        for (const row of pixels) for (const v of row) if (v > 128) darkCount++;
        collectedByDigit[expected].push({ pixels, w: pw, h: ph, darkCount });
        extracted++;
      }
    }
    console.log(`  [${num}/40] ${num}.png → ${extracted} 样本`);
  }

  // Merge and save (keep 97×97 format)
  console.log("");
  for (let d = 1; d <= 9; d++) {
    const existing = xsData[d].samples || [];
    const newSamples = collectedByDigit[d];
    if (newSamples.length === 0) { console.log(`  xsudoku_${d}: 无新样本`); continue; }

    const tW = xsData[d].w || 97, tH = xsData[d].h || 97;
    const allSamples = [...existing];

    for (const s of newSamples) {
      if (allSamples.length >= MAX_SAMPLES_PER_DIGIT) break;
      if (s.w === tW && s.h === tH) {
        allSamples.push({ pixels: s.pixels, darkCount: s.darkCount });
      } else {
        const scaled = scalePixels(s.pixels, s.w, s.h, tW, tH);
        let dc = 0;
        for (const row of scaled) for (const v of row) if (v > 128) dc++;
        allSamples.push({ pixels: scaled, darkCount: dc });
      }
    }

    // Recompute mean
    const mean = [];
    let meanSum = 0, meanN = 0;
    for (let y = 0; y < tH; y++) {
      mean[y] = [];
      for (let x = 0; x < tW; x++) {
        let sum = 0;
        for (const s of allSamples) sum += (s.pixels[y]?.[x] ?? 0);
        mean[y][x] = Math.round(sum / allSamples.length);
        meanSum += mean[y][x];
        meanN++;
      }
    }
    let meanDc = 0;
    for (let y = 0; y < tH; y++) for (let x = 0; x < tW; x++) if (mean[y][x] > 128) meanDc++;

    const out = {
      w: tW, h: tH,
      pixels: mean,
      darkCount: meanDc,
      samples: allSamples,
    };
    saveTemplate(join(TEMPLATE_DIR, `xsudoku_${d}.json`), out);
    console.log(`  xsudoku_${d}: ${existing.length} → ${allSamples.length} samples`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  全量模板扩充 — 三阶段样本提取                              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Create mock context for renderer
  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: BASE_DIR,
  };
  const renderer = new SudokuRenderer(mockCtx);

  try {
    await phaseA_handwritten(renderer);
    // Phase B already done (skip)
    // await phaseB_digital(renderer);
    await phaseC_xsudoku(renderer);
  } catch (err) {
    console.error("错误:", err);
    process.exit(1);
  }

  // ── Summary ──
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  完成 — 模板最终样本统计                                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  let totalSize = 0;
  for (const prefix of ["big", "digital", "xsudoku"]) {
    for (let d = 1; d <= 9; d++) {
      const fp = join(TEMPLATE_DIR, `${prefix}_${d}.json`);
      if (!existsSync(fp)) continue;
      const sz = (require("fs").statSync(fp).size / 1024).toFixed(0);
      const raw = JSON.parse(readFileSync(fp, "utf-8"));
      const n = (raw.samples || []).length;
      console.log(`  ${prefix}_${d}: ${n} samples, ${sz}KB`);
      totalSize += require("fs").statSync(fp).size;
    }
  }
  console.log(`\n  templates/ 总大小: ${(totalSize / (1024 * 1024)).toFixed(1)} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
