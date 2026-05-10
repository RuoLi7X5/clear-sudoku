/**
 * Xsudoku 模板构建脚本
 *
 * 步骤:
 * 1. 分析1121x1121图片的网格结构（精确定位格线）
 * 2. 利用答案提取每个数字的实际像素样本
 * 3. 为每个数字1-9构建多样本模板
 * 4. 用新模板测试识别精度
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const OUTPUT_DIR = join(__dirname, "..", "xsudoku-output");

// ── 答案数据 ──
const ANSWERS: string[] = [
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

function decodePNG(buf: Buffer): { data: Uint8Array; width: number; height: number } {
  const png = PNG.sync.read(buf);
  return { data: png.data, width: png.width, height: png.height };
}

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function rowDarkness(data: Uint8Array, imgW: number, y: number, threshold = 128): number {
  let count = 0;
  const rowStart = Math.round(y) * imgW * 4;
  for (let x = 0; x < imgW; x++) {
    const idx = rowStart + x * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

function colDarkness(data: Uint8Array, imgW: number, imgH: number, x: number, threshold = 128): number {
  let count = 0;
  for (let y = 0; y < imgH; y++) {
    const idx = y * imgW * 4 + Math.round(x) * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

// ── 分析第一张图的网格 ──
function analyzeGrid(imgPath: string) {
  const buf = readFileSync(imgPath);
  const { data, width: imgW, height: imgH } = decodePNG(buf);

  console.log(`\n=== 网格分析: ${imgPath} ===`);
  console.log(`尺寸: ${imgW}x${imgH}`);

  // Scan row darkness
  const rowPeaks: Array<{ y: number; score: number }> = [];
  for (let y = 0; y < imgH; y++) {
    const dark = rowDarkness(data, imgW, y, 80);
    const score = dark / imgW;
    if (score > 0.15) {
      rowPeaks.push({ y, score });
    }
  }

  // Find horizontal lines (10 grid lines expected)
  if (rowPeaks.length > 0) {
    // Find clusters of peaks
    const clusters: Array<{ y: number; score: number }> = [];
    let clusterStart = rowPeaks[0].y;
    let bestInCluster = rowPeaks[0];
    for (let i = 1; i < rowPeaks.length; i++) {
      if (rowPeaks[i].y - clusterStart < 5) {
        if (rowPeaks[i].score > bestInCluster.score) bestInCluster = rowPeaks[i];
      } else {
        clusters.push(bestInCluster);
        clusterStart = rowPeaks[i].y;
        bestInCluster = rowPeaks[i];
      }
    }
    clusters.push(bestInCluster);

    console.log(`水平暗像素峰值: ${clusters.length} 个`);
    if (clusters.length >= 10) {
      const top10 = clusters.filter((c, i) => {
        // Filter: should be roughly equally spaced
        return true;
      }).slice(0, 15);
      console.log("前15个峰值位置:", top10.map(c => `y=${c.y}(s=${c.score.toFixed(3)})`).join(", "));
    }
  }

  // Also scan vertical darkness
  const colPeaks: number[] = [];
  for (let x = 0; x < imgW; x++) {
    const dark = colDarkness(data, imgW, imgH, x, 80);
    const score = dark / imgH;
    if (score > 0.15) {
      colPeaks.push(x);
    }
  }

  console.log(`垂直暗像素峰值: ${colPeaks.length} 个`);

  return { imgW, imgH, data };

// ═════════════════════════════════════════════════════════════════════
// 主流程: 提取数字样本
// ═════════════════════════════════════════════════════════════════════

interface CellSample {
  digit: number;       // 1-9
  pixels: number[][];  // grayscale (0=white, 255=black/inverted)
  w: number;
  h: number;
  puzzle: number;
  cellLabel: string;
}

async function main() {
  mkdirSync(join(OUTPUT_DIR, "samples"), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "templates"), { recursive: true });

  // First, do detailed grid analysis on puzzle #1
  analyzeGrid(join(XSUDOKU_DIR, "1.png"));

  // Now let's figure out the grid for Xsudoku images
  // Approach: try multiple grid assumptions and pick the best one
  // For 1121x1121 images, likely grid structure:
  // - Outer border: detect from image
  // - Cell size: (outer_end - outer_start) / 9

  console.log("\n=== 批量提取数字样本 ===\n");

  // Collect samples for each digit
  const allSamples: CellSample[] = [];

  for (let puzzleIdx = 0; puzzleIdx < 40; puzzleIdx++) {
    const puzzleNum = puzzleIdx + 1;
    const answer = ANSWERS[puzzleIdx];
    const file = join(XSUDOKU_DIR, `${puzzleNum}.png`);
    const buf = readFileSync(file);
    const { data, width: imgW, height: imgH } = decodePNG(buf);

    // Try to detect grid with multiple approaches
    // Approach: use row/col darkness scanning to find grid lines
    const darkThreshold = 100;

    // Horizontal grid lines
    const rowScores: Array<{ pos: number; score: number }> = [];
    for (let y = 0; y < imgH; y++) {
      rowScores.push({ pos: y, score: rowDarkness(data, imgW, y, darkThreshold) / imgW });
    }

    // Find peaks in row scores
    const hLines = findGridLines(rowScores, imgH);
    const vScores: Array<{ pos: number; score: number }> = [];
    for (let x = 0; x < imgW; x++) {
      vScores.push({ pos: x, score: colDarkness(data, imgW, imgH, x, darkThreshold) / imgH });
    }
    const vLines = findGridLines(vScores, imgW);

    // If we got ~10 lines, use them; otherwise fall back to evenly-spaced
    let finalHLines: number[] = hLines;
    let finalVLines: number[] = vLines;

    if (hLines.length < 8) {
      // Fallback: assume padding ≈ 21, cell size ≈ 120
      const outerStart = 21, outerEnd = 1100;
      finalHLines = Array.from({ length: 10 }, (_, i) => Math.round(outerStart + i * (outerEnd - outerStart) / 9));
    }

    if (vLines.length < 8) {
      const outerStart = 21, outerEnd = 1100;
      finalVLines = Array.from({ length: 10 }, (_, i) => Math.round(outerStart + i * (outerEnd - outerStart) / 9));
    }

    // Ensure we have exactly 10 lines
    while (finalHLines.length < 10) finalHLines.push(finalHLines[finalHLines.length - 1] + 120);
    while (finalVLines.length < 10) finalVLines.push(finalVLines[finalVLines.length - 1] + 120);
    finalHLines = finalHLines.slice(0, 10);
    finalVLines = finalVLines.slice(0, 10);

    // Extract sample for each given digit (non-zero in answer)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expectedDigit = parseInt(answer[r * 9 + c], 10);
        if (expectedDigit === 0) continue; // only extract given digits

        const x1 = finalVLines[c], y1 = finalHLines[r];
        const x2 = finalVLines[c + 1], y2 = finalHLines[r + 1];
        const cellW = x2 - x1, cellH = y2 - y1;
        if (cellW < 5 || cellH < 5) continue;

        // Extract with inset
        const inset = Math.max(2, cellW * 0.10);
        const cx1 = x1 + inset, cy1 = y1 + inset;
        const cx2 = x2 - inset, cy2 = y2 - inset;
        const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

        // Extract grayscale pixels (inverted: dark=255)
        const pixels: number[][] = [];
        for (let y = 0; y < bh; y++) {
          const row: number[] = [];
          for (let x = 0; x < bw; x++) {
            const gray = grayAt(data, imgW, Math.round(cx1 + x), Math.round(cy1 + y));
            row.push(255 - gray);
          }
          pixels.push(row);
        }

        allSamples.push({
          digit: expectedDigit,
          pixels,
          w: bw,
          h: bh,
          puzzle: puzzleNum,
          cellLabel: `${String.fromCharCode(65 + r)}${c + 1}`,
        });
      }
    }
  }

  console.log(`提取了 ${allSamples.length} 个已知数字样本`);

  // Group samples by digit
  const byDigit = new Map<number, CellSample[]>();
  for (const s of allSamples) {
    if (!byDigit.has(s.digit)) byDigit.set(s.digit, []);
    byDigit.get(s.digit)!.push(s);
  }

  for (let d = 1; d <= 9; d++) {
    const samples = byDigit.get(d) || [];
    console.log(`  数字${d}: ${samples.length} 样本`);
  }

  // For each digit, find the most representative size and create a unified template
  console.log("\n=== 构建模板 ===\n");

  const templates: Record<number, { w: number; h: number; samples: Array<{ pixels: number[][]; darkCount: number }> }> = {};

  for (let d = 1; d <= 9; d++) {
    const samples = byDigit.get(d) || [];
    if (samples.length === 0) {
      console.log(`  数字${d}: 无样本!`);
      continue;
    }

    // Find most common size
    const sizeMap = new Map<string, CellSample[]>();
    for (const s of samples) {
      const key = `${s.w}x${s.h}`;
      if (!sizeMap.has(key)) sizeMap.set(key, []);
      sizeMap.get(key)!.push(s);
    }

    let bestSize = "";
    let bestCount = 0;
    for (const [size, list] of sizeMap) {
      if (list.length > bestCount) { bestCount = list.length; bestSize = size; }
    }

    const bestSamples = sizeMap.get(bestSize)!;
    const [w, h] = bestSize.split("x").map(Number);

    console.log(`  数字${d}: ${bestSamples.length}/${samples.length} 样本选择 ${w}x${h}`);

    // Normalize all samples to this size, then average
    templates[d] = { w, h, samples: [] };

    for (const sample of bestSamples) {
      const darkCount = sample.pixels.reduce((sum, row) =>
        sum + row.reduce((s, v) => s + (v > 128 ? 1 : 0), 0), 0
      );
      templates[d].samples.push({
        pixels: sample.pixels,
        darkCount,
      });
    }

    // Save template
    writeFileSync(
      join(OUTPUT_DIR, "templates", `xsudoku_${d}.json`),
      JSON.stringify({ w, h, samples: templates[d].samples }, null, 2),
    );
  }

  // Also save size distribution info
  console.log("\n=== 尺寸分布 ===\n");
  const allSizes = new Map<string, number[]>();
  for (const s of allSamples) {
    const key = `${s.w}x${s.h}`;
    if (!allSizes.has(key)) allSizes.set(key, []);
    allSizes.get(key)!.push(s.digit);
  }
  for (const [size, digits] of [...allSizes.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const digCount = new Map<number, number>();
    for (const d of digits) digCount.set(d, (digCount.get(d) || 0) + 1);
    const breakdown = [...digCount.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(", ");
    console.log(`  ${size}: ${digits.length}样本 (${breakdown})`);
  }

  console.log(`\n模板已保存到: ${OUTPUT_DIR}/templates/`);
}

// Grid line detection from darkness scores
function findGridLines(scores: Array<{ pos: number; score: number }>, total: number): number[] {
  // Find peak clusters
  const threshold = 0.1;
  const peaks: number[] = [];
  let inPeak = false;
  let bestPos = 0, bestScore = 0;

  for (const s of scores) {
    if (s.score > threshold) {
      if (!inPeak) { inPeak = true; bestPos = s.pos; bestScore = s.score; }
      else if (s.score > bestScore) { bestScore = s.score; bestPos = s.pos; }
    } else {
      if (inPeak) {
        inPeak = false;
        peaks.push(bestPos);
      }
    }
  }
  if (inPeak) peaks.push(bestPos);

  // If we have many peaks, filter to ~10 by looking for equal spacing
  if (peaks.length > 10) {
    // Find the largest gap between consecutive peaks - that's the outer border
    // Grid lines should be roughly equally spaced

    // Try to find the outer border first
    // The first and last grid line should be separated by cellSize*9
    // Total image is 1121 - likely padding ~20-25, cell ~119-120

    // Find 10 peaks that form the most regular progression
    let bestSet: number[] = peaks.slice(0, 10);
    let bestRegularity = Infinity;

    for (let start = 0; start < Math.min(peaks.length - 9, 20); start++) {
      for (let end = Math.max(start + 9, peaks.length - 10); end < peaks.length; end++) {
        const subset: number[] = [];
        subset.push(peaks[start]);
        // Find intermediate peaks using expected positions
        const span = peaks[end] - peaks[start];
        const step = span / 9;
        for (let i = 1; i < 9; i++) {
          const expected = peaks[start] + i * step;
          // Find nearest peak
          let best = peaks[start + 1];
          let bestDist = Infinity;
          for (let j = start + 1; j < end; j++) {
            const dist = Math.abs(peaks[j] - expected);
            if (dist < bestDist) { bestDist = dist; best = peaks[j]; }
          }
          subset.push(best);
        }
        subset.push(peaks[end]);
        subset.sort((a, b) => a - b);

        // Measure regularity
        const diffs: number[] = [];
        for (let i = 1; i < subset.length; i++) diffs.push(subset[i] - subset[i - 1]);
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        const variance = diffs.reduce((s, d) => s + (d - avg) ** 2, 0) / diffs.length;
        if (variance < bestRegularity) {
          bestRegularity = variance;
          bestSet = subset;
        }
      }
    }
    return bestSet;
  }

  return peaks;
}

main().catch(console.error);
