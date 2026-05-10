/**
 * Xsudoku 模板构建脚本
 *
 * 步骤:
 * 1. 用精确网格提取所有已知数字的像素样本
 * 2. 为每个数字1-9构建归一化模板
 * 3. 用新模板重新识别所有40题，验证精度
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const OUTPUT_DIR = join(__dirname, "..", "xsudoku-output");
const TEMPLATE_DIR = join(__dirname, "..", "templates");

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

// ── Image utils ──
function decodePNG(buf) {
  return PNG.sync.read(buf);
}

function grayAt(data, imgW, x, y) {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function rowDarkness(data, imgW, y, threshold) {
  let count = 0;
  const rowStart = Math.round(y) * imgW * 4;
  for (let x = 0; x < imgW; x++) {
    const idx = rowStart + x * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

function colDarkness(data, imgW, imgH, x, threshold) {
  let count = 0;
  for (let y = 0; y < imgH; y++) {
    const idx = y * imgW * 4 + Math.round(x) * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

// ── Grid detection ──
function detectGridLines(data, imgW, imgH) {
  const darkThreshold = 100;

  function findBorderEdge(scores, fromStart) {
    const threshold = 0.08;
    const indices = fromStart
      ? Array.from({ length: scores.length }, (_, i) => i)
      : Array.from({ length: scores.length }, (_, i) => scores.length - 1 - i);
    let peakPos = null, peakScore = 0;
    for (const i of indices) {
      if (scores[i].score > threshold) {
        if (scores[i].score > peakScore) { peakScore = scores[i].score; peakPos = scores[i].pos; }
      } else if (peakPos !== null) {
        return peakPos;
      }
    }
    return peakPos;
  }

  function linesFromBorder(outerStart, outerEnd) {
    const span = outerEnd - outerStart;
    const cellSize = span / 9;
    const result = [];
    for (let i = 0; i < 10; i++) {
      result.push(Math.round(outerStart + i * cellSize));
    }
    return result;
  }

  // Horizontal
  const rowScores = Array.from({ length: imgH }, (_, y) => ({
    pos: y,
    score: rowDarkness(data, imgW, y, darkThreshold) / imgW,
  }));
  const topBorder = findBorderEdge(rowScores, true);
  const bottomBorder = findBorderEdge(rowScores, false);
  let horizontal = (topBorder !== null && bottomBorder !== null && bottomBorder - topBorder > imgH * 0.45)
    ? linesFromBorder(topBorder, bottomBorder)
    : Array.from({ length: 10 }, (_, i) => Math.round((i / 9) * (imgH - 1)));

  // Vertical
  const colScores = Array.from({ length: imgW }, (_, x) => ({
    pos: x,
    score: colDarkness(data, imgW, imgH, x, darkThreshold) / imgH,
  }));
  const leftBorder = findBorderEdge(colScores, true);
  const rightBorder = findBorderEdge(colScores, false);
  let vertical = (leftBorder !== null && rightBorder !== null && rightBorder - leftBorder > imgW * 0.45)
    ? linesFromBorder(leftBorder, rightBorder)
    : Array.from({ length: 10 }, (_, i) => Math.round((i / 9) * (imgW - 1)));

  return { horizontal, vertical };
}

// ── NCC template match (simplified inline) ──
function ncc(input, template) {
  if (!template.pixels || template.pixels.length === 0) return 0;
  const tH = template.h, tW = template.w;
  const iH = input.length, iW = input[0] ? input[0].length : 0;
  if (iH === 0 || iW === 0) return 0;

  // Scale input to template size (simple bilinear)
  const scaled = scaleTo(input, iW, iH, tW, tH);

  // Mean of input
  let iSum = 0;
  for (let y = 0; y < tH; y++)
    for (let x = 0; x < tW; x++)
      iSum += scaled[y][x];
  const iMean = iSum / (tW * tH);

  let num = 0, dI = 0, dT = 0;
  const tMean = template.mean || 0;

  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < tW; x++) {
      const iDiff = scaled[y][x] - iMean;
      const tDiff = template.pixels[y][x] - tMean;
      num += iDiff * tDiff;
      dI += iDiff * iDiff;
      dT += tDiff * tDiff;
    }
  }

  const denom = Math.sqrt(dI * dT);
  if (denom < 1e-6) return 0;
  return num / denom;
}

function scaleTo(input, inW, inH, outW, outH) {
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
      const v00 = (input[y0] && input[y0][x0]) ? input[y0][x0] : 0;
      const v10 = (input[y0] && input[y0][x1]) ? input[y0][x1] : 0;
      const v01 = (input[y1] && input[y1][x0]) ? input[y1][x0] : 0;
      const v11 = (input[y1] && input[y1][x1]) ? input[y1][x1] : 0;
      const top = v00 * (1 - xFrac) + v10 * xFrac;
      const bottom = v01 * (1 - xFrac) + v11 * xFrac;
      row.push(top * (1 - yFrac) + bottom * yFrac);
    }
    out.push(row);
  }
  return out;
}

// ── Extract cell grayscale ──
function extractCell(data, imgW, x1, y1, x2, y2) {
  const w = Math.round(x2 - x1);
  const h = Math.round(y2 - y1);
  const pixels = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const gray = grayAt(data, imgW, Math.round(x1 + x), Math.round(y1 + y));
      row.push(255 - gray); // invert: dark=255, light=0
    }
    pixels.push(row);
  }
  return { pixels, w, h };
}

// ═════════════════════════════════════════════════════════════════════
//  Main
// ═════════════════════════════════════════════════════════════════════

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "samples_by_digit"), { recursive: true });

  // ── Phase 1: Extract all known-digit samples ──
  console.log("=== Phase 1: 提取数字样本 ===\n");

  const allSamples = []; // { digit, pixels, w, h, puzzle, cell }

  for (let puzzleIdx = 0; puzzleIdx < 40; puzzleIdx++) {
    const puzzleNum = puzzleIdx + 1;
    const answer = ANSWERS[puzzleIdx];
    const file = join(XSUDOKU_DIR, `${puzzleNum}.png`);
    const buf = readFileSync(file);
    const png = decodePNG(buf);
    const { data, width: imgW, height: imgH } = png;

    const grid = detectGridLines(data, imgW, imgH);
    const hLines = grid.horizontal.slice(0, 10);
    const vLines = grid.vertical.slice(0, 10);

    // Extract given digits
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expectedDigit = parseInt(answer[r * 9 + c], 10);
        if (expectedDigit === 0) continue;

        const x1 = vLines[c], y1 = hLines[r];
        const x2 = vLines[c + 1], y2 = hLines[r + 1];
        const cellW = x2 - x1, cellH = y2 - y1;
        if (cellW < 10 || cellH < 10) continue;

        // Extract with inset for big digit
        const inset = Math.max(2, cellW * 0.12);
        const cx1 = x1 + inset, cy1 = y1 + inset;
        const cx2 = x2 - inset, cy2 = y2 - inset;

        const { pixels } = extractCell(data, imgW, cx1, cy1, cx2, cy2);
        const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

        // Check if there's actual content
        let maxVal = 0;
        for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
        if (maxVal < 30) {
          console.log(`  ⚠ #${puzzleNum} ${String.fromCharCode(65+r)}${c+1}: expected ${expectedDigit} but no content!`);
          continue;
        }

        allSamples.push({
          digit: expectedDigit,
          pixels,
          w: bw,
          h: bh,
          puzzle: puzzleNum,
          cell: `${String.fromCharCode(65 + r)}${c + 1}`,
        });
      }
    }
  }

  console.log(`提取到 ${allSamples.length} 个已知数字样本`);

  // Group by digit
  const byDigit = {};
  for (let d = 1; d <= 9; d++) byDigit[d] = [];
  for (const s of allSamples) byDigit[s.digit].push(s);

  for (let d = 1; d <= 9; d++) {
    console.log(`  数字${d}: ${byDigit[d].length} 样本`);
  }

  // ── Phase 2: Normalize and build templates ──
  console.log("\n=== Phase 2: 构建模板 ===\n");

  const templates = {}; // { digit: { w, h, pixels (mean), samples } }

  for (let d = 1; d <= 9; d++) {
    const samples = byDigit[d];
    if (samples.length === 0) continue;

    // Find most common size
    const sizeMap = {};
    for (const s of samples) {
      const key = `${s.w}x${s.h}`;
      if (!sizeMap[key]) sizeMap[key] = [];
      sizeMap[key].push(s);
    }

    let bestKey = "", bestCount = 0;
    for (const key in sizeMap) {
      if (sizeMap[key].length > bestCount) { bestCount = sizeMap[key].length; bestKey = key; }
    }

    const bestSamples = sizeMap[bestKey];
    const [w, h] = bestKey.split("x").map(Number);

    console.log(`  数字${d}: ${bestSamples.length}/${samples.length} 样本选 ${w}x${h}`);

    // Build mean template
    const meanPixels = [];
    for (let y = 0; y < h; y++) {
      meanPixels[y] = [];
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (const s of bestSamples) {
          // Scale sample to common size
          sum += (s.pixels[y] && s.pixels[y][x]) ? s.pixels[y][x] : 0;
        }
        meanPixels[y][x] = Math.round(sum / bestSamples.length);
      }
    }

    let darkCount = 0, totalSum = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (meanPixels[y][x] > 128) darkCount++;
        totalSum += meanPixels[y][x];
        n++;
      }
    }
    const mean = totalSum / (n || 1);

    // Store all individual samples too
    const sampleData = bestSamples.map(s => ({
      pixels: s.pixels,
      darkCount: s.pixels.reduce((sum, row) =>
        sum + row.reduce((s2, v) => s2 + (v > 128 ? 1 : 0), 0), 0
      ),
    }));

    templates[d] = { w, h, digit: d, meanPixels, mean, darkCount, samples: sampleData };
  }

  // ── Phase 3: Write templates ──
  console.log("\n=== Phase 3: 写出模板文件 ===\n");

  for (let d = 1; d <= 9; d++) {
    if (!templates[d]) continue;
    const tpl = templates[d];

    // Write as xsudoku_{digit}.json in same format as existing templates
    const outPath = join(OUTPUT_DIR, "templates", `xsudoku_${d}.json`);
    mkdirSync(join(OUTPUT_DIR, "templates"), { recursive: true });

    writeFileSync(outPath, JSON.stringify({
      w: tpl.w,
      h: tpl.h,
      pixels: tpl.meanPixels,          // "mean" template (primary for recognition)
      darkCount: tpl.darkCount,
      samples: tpl.samples,            // individual samples
    }, null, 2));

    console.log(`  xsudoku_${d}.json: ${tpl.w}x${tpl.h}, ${tpl.samples.length} samples`);
  }

  // ── Phase 4: Test recognition with new templates ──
  console.log("\n=== Phase 4: 新模板识别测试 ===\n");

  let totalCells = 40 * 81;
  let correctDigits = 0, missedGivens = 0, wrongDigits = 0, falsePositives = 0;

  const templateCache = [];
  for (let d = 1; d <= 9; d++) {
    if (templates[d]) {
      templateCache.push({
        digit: d,
        w: templates[d].w,
        h: templates[d].h,
        pixels: templates[d].meanPixels,
        mean: templates[d].mean,
      });
    }
  }

  for (let puzzleIdx = 0; puzzleIdx < 40; puzzleIdx++) {
    const puzzleNum = puzzleIdx + 1;
    const answer = ANSWERS[puzzleIdx];
    const file = join(XSUDOKU_DIR, `${puzzleNum}.png`);
    const buf = readFileSync(file);
    const png = decodePNG(buf);
    const { data, width: imgW, height: imgH } = png;

    const grid = detectGridLines(data, imgW, imgH);
    const hLines = grid.horizontal.slice(0, 10);
    const vLines = grid.vertical.slice(0, 10);

    let puzzleCorrect = 0, puzzleMissed = 0, puzzleWrong = 0, puzzleFP = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expectedDigit = parseInt(answer[r * 9 + c], 10);

        const x1 = vLines[c], y1 = hLines[r];
        const x2 = vLines[c + 1], y2 = hLines[r + 1];
        const cellW = x2 - x1, cellH = y2 - y1;
        if (cellW < 5 || cellH < 5) continue;

        const inset = Math.max(2, cellW * 0.12);
        const cx1 = x1 + inset, cy1 = y1 + inset;
        const cx2 = x2 - inset, cy2 = y2 - inset;
        const { pixels } = extractCell(data, imgW, cx1, cy1, cx2, cy2);
        const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

        // Check max value
        let maxVal = 0;
        for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;

        let recognizedDigit = 0;
        let bestConf = 0;

        if (maxVal >= 30 && bw >= 5 && bh >= 5) {
          // Try all templates
          let bestScore = -1;
          let bestDigit = 0;
          for (const tpl of templateCache) {
            const score = ncc(pixels, tpl);
            if (score > bestScore) { bestScore = score; bestDigit = tpl.digit; }
          }
          const conf = (bestScore + 1) / 2;
          if (conf > 0.55) {
            recognizedDigit = bestDigit;
            bestConf = conf;
          }
        }

        if (expectedDigit === 0 && recognizedDigit === 0) {
          correctDigits++;
          puzzleCorrect++;
        } else if (expectedDigit === recognizedDigit) {
          correctDigits++;
          puzzleCorrect++;
        } else {
          if (expectedDigit !== 0 && recognizedDigit === 0) { missedGivens++; puzzleMissed++; }
          else if (expectedDigit === 0 && recognizedDigit !== 0) { falsePositives++; puzzleFP++; }
          else if (expectedDigit !== 0 && recognizedDigit !== 0 && expectedDigit !== recognizedDigit) {
            wrongDigits++; puzzleWrong++;
          }
        }
      }
    }

    const accuracy = ((puzzleCorrect / 81) * 100).toFixed(1);
    const status = puzzleMissed + puzzleWrong + puzzleFP > 0
      ? `⚠ miss=${puzzleMissed} wrong=${puzzleWrong} fp=${puzzleFP}`
      : `✓ PERFECT`;

    console.log(`  #${String(puzzleNum).padStart(2)}: ${accuracy}% ${status}`);
  }

  const overallAccuracy = ((correctDigits / totalCells) * 100).toFixed(1);

  console.log(`\n=== 总体统计 ===`);
  console.log(`总格数: ${totalCells}`);
  console.log(`正确: ${correctDigits} (${overallAccuracy}%)`);
  console.log(`漏识别(given→0): ${missedGivens}`);
  console.log(`错识别(数字不对): ${wrongDigits}`);
  console.log(`误识别(0→数字): ${falsePositives}`);

  // ── Phase 5: Copy templates to main templates dir ──
  console.log("\n=== Phase 5: 安装模板 ===\n");

  for (let d = 1; d <= 9; d++) {
    if (!templates[d]) continue;
    const srcPath = join(OUTPUT_DIR, "templates", `xsudoku_${d}.json`);
    const dstPath = join(TEMPLATE_DIR, `xsudoku_${d}.json`);
    writeFileSync(dstPath, readFileSync(srcPath));
    console.log(`  已安装: templates/xsudoku_${d}.json`);
  }

  console.log("\n完成! 模板文件:");
  console.log(`  输出: ${join(OUTPUT_DIR, "templates")}`);
  console.log(`  已安装到: ${TEMPLATE_DIR}`);
}

main();
