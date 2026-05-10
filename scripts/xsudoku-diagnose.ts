/**
 * Xsudoku OCR 诊断脚本
 *
 * 对 40 张 Xsudoku 图片运行 OCR，逐格对比答案。
 * 收集识别错误和降级识别的单元格图片，用于构建新模板。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const { PNG } = require("pngjs");

// ── 答案数据（从 images/answer-key.md） ──
const ANSWERS: string[] = [
  "006002800080600270025000061604070032200304700030201900042080600160925007000006020", // 1
  "005070080030504100000308057500000090080406510004005008056003041140050600070641005", // 2
  "010073005005009130309156870050690700000708050002345001037560200006007510500900007", // 3
  "002005090000800004080000200006000905090001003230000780008506070000400009060070300", // 4
  "043009100816037009097100080734910026625370910981060700350001000460700001179040000", // 5
  "600009005020536047005100609007900513080300974300400286000603751000701490000090360", // 6
  "700208005020050070000000200308010062200805731070320800030070010007590306600183407", // 7
  "310420600020009010009001002032094801080270030040138200070853926203940100098012040", // 8
  "726894315590106000081520000100602450048050100050401000015068020060310500800245001", // 9
  "002068040306020008890070620060490872980002406020086010630249085008600200209810060", // 10
  "813406902570120004402003010925341786104207080080045201600004120008010000001700000", // 11
  "704100069030600407096070023017060030460700001309010746641087390978306004253941678", // 12
  "000197082802050079070020400000900000006005730500030004400500200020089047000000060", // 13
  "034705000728614009600023400800070000370008002002030800263047001497001060581300704", // 14
  "010300040030009200700000038042090070000720400087134092000057010401083020009200300", // 15
  "003800400600400003040030009004000930932018004567943218458200391206380745370004862", // 16
  "140007090002930147907041006001000904058409710409013085700100400090304001014802000", // 17
  "010090703009007010000005490000250009020700000600080070200400307070508000001070050", // 18
  "203007500780563204450200370530920040024005900697834125902050400305009002040302059", // 19
  "060004082002803675500672904006738000000900008000020700900267843003089007070305200", // 20
  "620079103000100060001306500100687009039215706006493015000000001900031050018000000", // 21
  "007006000500010600601205000106030028800652100002108006305860200214593867068020030", // 22
  "120060000006100009400008010200000400004050923090234071051003007000600130300010090", // 23
  "402695308000708025850200009200901080060800092908402500500380206080526900623109850", // 24
  "003008600400000358050300009002090013900003086030004097000005060006200805085060004", // 25
  "210460900408190006396070140001009004640210000509604017004001300100040000000006401", // 26
  "038006020014023000692500003853069000921300006467218359280004030049600005070000400", // 27
  "302090508005328040089500230820900074003481625004000890007600480000839702008040050", // 28
  "500678210008419075071253480107806530800105790050147108400702801010084007780501940", // 29
  "000800540400630208080004000804070350500008907060350824000002700600000005070010002", // 30
  "641208900700040008890071046270800401164723895080014700028460000416007080907182604", // 31
  "005000001090170052102053006051300249040521003200004510060019025027635104510040000", // 32
  "000100002021000038800027100003890050080040300100006084200010060010004800050600013", // 33
  "020493008053708640480006030340079086005800304008304000530940867804037900070085403", // 34
  "010786400408905070907104000004697020000841000070352046700209004002408300040503010", // 35
  "500060079098107056070003800000004060730200001009001000000000008980000020010080700", // 36
  "103570000058103070796284513030407050579018042600725700900000080007002400060000000", // 37
  "120089674004016002000402510401053200002048156500201340010807420700124000248095701", // 38
  "204500003358040720006002450402007500005900042080254376503781204047020005820405007", // 39
  "000000001080200600006010020050006040004950062600300100300800010040007009005090000", // 40
];

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const OUTPUT_DIR = join(__dirname, "..", "xsudoku-debug");

// ── 复制 OCR 核心逻辑 ──

// Simplified re-import from the project's OCR pipeline
import { recognizeBoard, detectGridLines, extractGrayscale } from "../src/ocr";
import { matchBigDigit, matchSmallDigit } from "../src/template-match";

// pngjs decode
function decodePNG(buf: Buffer): { data: Uint8Array; width: number; height: number } {
  const png = PNG.sync.read(buf);
  return { data: png.data, width: png.width, height: png.height };
}

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

// ── 诊断 ──

async function main() {
  mkdirSync(join(OUTPUT_DIR, "cells"), { recursive: true });
  mkdirSync(join(OUTPUT_DIR, "misreads"), { recursive: true });

  console.log("=== Xsudoku OCR 诊断 ===\n");

  let totalCells = 40 * 81;
  let correctDigits = 0;
  let wrongDigits = 0;
  let missedGivens = 0; // OCR missed a given digit
  let falsePositives = 0; // OCR saw a digit where answer says 0

  const misreadCells: Array<{
    puzzle: number;
    row: number;
    col: number;
    expected: number;
    got: number;
    conf: number;
  }> = [];

  for (let puzzleIdx = 0; puzzleIdx < 40; puzzleIdx++) {
    const puzzleNum = puzzleIdx + 1;
    const answer = ANSWERS[puzzleIdx];
    const file = join(XSUDOKU_DIR, `${puzzleNum}.png`);
    const buf = readFileSync(file);
    const { data, width, height } = decodePNG(buf);

    // Run OCR
    let ocrResult: any;
    try {
      // Use the full pipeline, but need to temporarily remove canvas dep
      const { data: imgData, width: imgW, height: imgH } = decodePNG(buf);

      // Manual inline OCR to avoid Koishi context dependency
      const grid = detectGridLines(imgData, imgW, imgH);
      const hLines = grid.horizontal.slice(0, 10);
      const vLines = grid.vertical.slice(0, 10);

      // Try auto-snap for 1121x1121 images
      const avgCellW = (vLines[9] - vLines[0]) / 9;
      const avgCellH = (hLines[9] - hLines[0]) / 9;
      // 1121px size: likely cellSize ~120, padding ~20-25
      // Let OCR auto-detect

      // Build cells array
      const cells: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
      const confidences: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const x1 = vLines[c], y1 = hLines[r];
          const x2 = vLines[c + 1], y2 = hLines[r + 1];
          const cellW = x2 - x1, cellH = y2 - y1;
          if (cellW < 5 || cellH < 5) continue;

          const inset = Math.max(2, cellW * 0.12);
          const cx1 = x1 + inset, cy1 = y1 + inset;
          const cx2 = x2 - inset, cy2 = y2 - inset;
          const bigPixels = extractGrayscale(imgData, imgW, cx1, cy1, cx2, cy2);
          const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

          if (bw >= 5 && bh >= 5) {
            const bigResult = matchBigDigit(bigPixels, bw, bh);
            if (bigResult.confidence > 0.55) {
              cells[r][c] = bigResult.digit;
              confidences[r][c] = bigResult.confidence;
            }
          }
        }
      }

      // Compare with answer
      let puzzleCorrect = 0, puzzleWrong = 0, puzzleMissed = 0, puzzleFP = 0;

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const expected = parseInt(answer[r * 9 + c], 10);
          const got = cells[r][c];

          if (expected === 0 && got === 0) {
            correctDigits++;
            puzzleCorrect++;
          } else if (expected === got) {
            correctDigits++;
            puzzleCorrect++;
          } else {
            if (expected !== 0 && got === 0) {
              missedGivens++;
              puzzleMissed++;
            } else if (expected === 0 && got !== 0) {
              falsePositives++;
              puzzleFP++;
            } else if (expected !== 0 && got !== 0 && expected !== got) {
              wrongDigits++;
              puzzleWrong++;
            }

            misreadCells.push({
              puzzle: puzzleNum,
              row: r,
              col: c,
              expected,
              got,
              conf: confidences[r][c],
            });

            // Save misread cell image
            const x1 = vLines[c], y1 = hLines[r];
            const x2 = vLines[c + 1], y2 = hLines[r + 1];
            const cellW = x2 - x1, cellH = y2 - y1;
            const inset = Math.max(2, cellW * 0.12);
            const cx1 = x1 + inset, cy1 = y1 + inset;
            const cx2 = x2 - inset, cy2 = y2 - inset;

            // Save raw cell as extract grayscale JSON
            const pixels = extractGrayscale(imgData, imgW, cx1, cy1, cx2, cy2);
            const cellDir = join(OUTPUT_DIR, "cells");
            mkdirSync(cellDir, { recursive: true });
            const label = expected !== 0 ? `expected${expected}_got${got}` : `fp_got${got}`;
            writeFileSync(
              join(cellDir, `p${puzzleNum}_r${r}c${c}_${label}.json`),
              JSON.stringify({ pixels, w: pixels[0]?.length || 0, h: pixels.length, expected, got, conf: confidences[r][c] }, null, 2),
            );
          }
        }
      }

      const accuracy = ((puzzleCorrect / 81) * 100).toFixed(1);
      const status = puzzleMissed + puzzleWrong + puzzleFP > 0
        ? `⚠ miss=${puzzleMissed} wrong=${puzzleWrong} fp=${puzzleFP}`
        : `✓`;

      console.log(`  #${String(puzzleNum).padStart(2)}: ${accuracy}% ${status}`);
    } catch (err: any) {
      console.log(`  #${String(puzzleNum).padStart(2)}: ERROR ${err.message}`);
    }
  }

  const totalGiven = 40 * 81 - ANSWERS.join("").split("0").length + 40;
  const overallAccuracy = ((correctDigits / totalCells) * 100).toFixed(1);

  console.log(`\n=== 总体统计 ===`);
  console.log(`总格数: ${totalCells}`);
  console.log(`正确: ${correctDigits} (${overallAccuracy}%)`);
  console.log(`漏识别(given→0): ${missedGivens}`);
  console.log(`错识别(数字不对): ${wrongDigits}`);
  console.log(`误识别(0→数字): ${falsePositives}`);
  console.log(`错误格总计: ${misreadCells.length}`);

  // Summary by digit
  console.log(`\n=== 按数字分错 ===`);
  for (let digit = 1; digit <= 9; digit++) {
    const missed = misreadCells.filter(c => c.expected === digit);
    const fp = misreadCells.filter(c => c.got === digit && c.expected === 0);
    const wrong = misreadCells.filter(c => c.expected === digit && c.got !== 0 && c.got !== digit);
    if (missed.length + fp.length + wrong.length > 0) {
      console.log(`  数字${digit}: 漏识=${missed.length} 误识=${fp.length} 错识=${wrong.length}`);
    }
  }

  // Save misread summary
  writeFileSync(
    join(OUTPUT_DIR, "misread-summary.json"),
    JSON.stringify(misreadCells, null, 2),
  );
  console.log(`\n详细数据已保存到: ${OUTPUT_DIR}`);
}

main().catch(console.error);
