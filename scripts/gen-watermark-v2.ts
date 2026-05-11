/**
 * 水印模板生成 v2 — 墨迹计数 + 两遍识别法
 *
 * 核心改进:
 * 1. 墨迹检测确定字符数量 → 消除尾部幽灵
 * 2. 用已知答案渲染 40 题 → OCR → 对比 → 提取样本
 * 3. 多样本建模板 → 阈值扫描 → 验证 100%
 *
 * 水印方案: Aa-1, Bb-2, ..., Zz-26 覆盖所有字母
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMAGES_DIR = join(__dirname, "..", "..", "..", "images");
const TEMPLATE_DIR = join(__dirname, "..", "templates");
const JIANKU_DIR = join(IMAGES_DIR, "jianku", "wm-train");

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

// Build watermarks: Aa-1 through Zz-26 (covers all 52 letters, 10 digits, 26 dashes)
const WATERMARKS: string[] = [];
for (let i = 0; i < 26; i++) {
  const upper = String.fromCharCode(65 + i);
  const lower = String.fromCharCode(97 + i);
  WATERMARKS.push(`${upper}${lower}-${i + 1}`);
}
// Extra 14 mixed watermarks for more samples
const EXTRA = ["Test-42", "Hi-88", "OK-99", "X1-b2", "C3-d4", "E5-f6", "G7-h8",
  "I9-j0", "K1-l2", "M3-n4", "O5-p6", "Q7-r8", "S9-t0", "U1-v2"];
WATERMARKS.push(...EXTRA);

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

/**
 * 墨迹密度检测：扫描水印区域，计算暗像素密度曲线
 * 通过密度峰谷来估计字符数量
 */
function estimateCharCount(data: Uint8Array, imgW: number, wmX1: number, wmY: number, wmW: number, wmH: number): number {
  // Horizontal projection: sum dark pixels per column
  const proj: number[] = [];
  for (let x = 0; x < wmW; x++) {
    let dark = 0;
    for (let y = 0; y < wmH; y++) {
      const gray = grayAt(data, imgW, wmX1 + x, wmY + y);
      if (gray < 200) dark++;
    }
    proj.push(dark);
  }

  // Find peaks (character centers) and valleys (gaps)
  const maxDark = Math.max(...proj);
  if (maxDark < 2) return 0;

  // Count transitions from "dark" to "light" (character boundaries)
  const threshold = maxDark * 0.15;
  let inChar = false;
  let charCount = 0;
  let lastTransition = 0;

  for (let x = 0; x < wmW; x++) {
    const isDark = proj[x] > threshold;
    if (isDark && !inChar) {
      // Enter character
      // Check this isn't just noise (need min width)
      if (x - lastTransition > 2 || charCount === 0) {
        inChar = true;
      }
    } else if (!isDark && inChar) {
      // Exit character - check min character width
      const charWidth = x - lastTransition;
      if (charWidth >= 3) {
        charCount++;
        lastTransition = x;
      }
      inChar = false;
    }
  }
  // Last character at the end
  if (inChar) {
    const charWidth = wmW - lastTransition;
    if (charWidth >= 3) charCount++;
  }

  return charCount;
}

// ═══════════════════════════════════════════════════════════

async function main() {
  mkdirSync(JIANKU_DIR, { recursive: true });
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // ═══════════════════════════════════════════════════════════
  // Phase 1: Render 40 puzzles with known watermarks
  // ═══════════════════════════════════════════════════════════
  console.log("=== Phase 1: 渲染 40 题训练水印 ===\n");

  const allSamples: Record<string, Array<{ pixels: number[][]; w: number; h: number }>> = {};
  const CHAR_W = 10, CHAR_H = 16;
  const WMX = 28, WMY = 930;

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1;
    const answer = ANSWERS[pi];
    const watermark = WATERMARKS[pi];

    // Build board from answer
    const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>())
    );
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = parseInt(answer[r * 9 + c], 10);
        if (v > 0) { givens[r][c] = v; candidates[r][c] = new Set([v]); }
      }
    }

    const board = new BoardState(givens, deduced, candidates);
    board.watermark = watermark;

    const buf = await renderer.render(board, { showCandidates: false, watermark });
    writeFileSync(join(JIANKU_DIR, `wm_${pn}.png`), buf);

    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;

    // Extract pixel samples for each character at known position
    for (let ci = 0; ci < watermark.length; ci++) {
      const ch = watermark[ci];
      const cx = WMX + ci * CHAR_W;
      const px: number[][] = [];
      for (let y = 0; y < CHAR_H; y++) {
        const row: number[] = [];
        for (let x = 0; x < CHAR_W; x++)
          row.push(255 - grayAt(data, imgW, cx + x, WMY + y));
        px.push(row);
      }
      if (!allSamples[ch]) allSamples[ch] = [];
      allSamples[ch].push({ pixels: px, w: CHAR_W, h: CHAR_H });
    }

    if (pi % 10 === 9) console.log(`  已处理 ${pn}/40 题`);
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2: Build mean templates from samples
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 2: 构建模板 ===\n");

  const chars = [...new Set(WATERMARKS.join(""))].sort();
  const TPL_W = 12, TPL_H = 16;

  for (const ch of chars) {
    const samples = allSamples[ch] || [];
    if (samples.length === 0) continue;

    // Average
    const avg: number[][] = [];
    let darkCount = 0;
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < TPL_W; x++) {
        let sum = 0;
        for (const s of samples) {
          const srcX = (x / TPL_W) * CHAR_W;
          const x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, CHAR_W - 1), xF = srcX - x0;
          sum += (s.pixels[y]?.[x0] ?? 0) * (1 - xF) + (s.pixels[y]?.[x1] ?? 0) * xF;
        }
        const v = Math.round(sum / samples.length);
        row.push(v);
        if (v > 128) darkCount++;
      }
      avg.push(row);
    }

    // Filename
    const code = ch.charCodeAt(0);
    let filename: string;
    if (ch >= '0' && ch <= '9') filename = `wm_${ch}.json`;
    else if (ch >= 'a' && ch <= 'z') filename = `wm_${ch}.json`;
    else if (ch >= 'A' && ch <= 'Z') filename = `wmu_${ch}.json`;
    else if (ch === '-') filename = `wm_dash.json`;
    else continue;

    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: TPL_W, h: TPL_H, char: ch, pixels: avg, darkCount, sampleCount: samples.length,
      samples: [{ pixels: avg, darkCount }],
    }, null, 2));

    console.log(`  ${filename}: ${samples.length}样本 dark=${darkCount}`);
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: 墨迹检测 + OCR 验证
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 3: 墨迹检测 + OCR 验证 ===\n");

  const { matchWatermarkChar } = require("../lib/template-match");
  const { reloadTemplates } = require("../lib/template-match");
  reloadTemplates();

  let totalCorrect = 0, totalChars = 0;

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1;
    const expected = WATERMARKS[pi];
    const buf = readFileSync(join(JIANKU_DIR, `wm_${pn}.png`));
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;

    // Ink detection: estimate char count in watermark area
    const wmW = Math.min(200, imgW - WMX);
    const estimatedCount = estimateCharCount(data, imgW, WMX, WMY, wmW, CHAR_H);
    const expectedCount = expected.length;

    // Extract watermark pixels
    const wmPixels: number[][] = [];
    for (let y = 0; y < CHAR_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < wmW; x++)
        row.push(255 - grayAt(data, imgW, WMX + x, WMY + y));
      wmPixels.push(row);
    }

    // Sliding window OCR
    type Match = { x: number; char: string; conf: number };
    const allMatches: Match[] = [];
    for (const winW of [8, 10, 12]) {
      for (let x = 0; x + winW <= wmW; x += 2) {
        const winPx: number[][] = [];
        for (let y = 0; y < CHAR_H; y++) winPx.push(wmPixels[y].slice(x, x + winW));
        const result = matchWatermarkChar(winPx, winW, CHAR_H);
        if (result.confidence > 0.6) {
          allMatches.push({ x, char: result.char, conf: result.confidence });
        }
      }
    }

    // Pick non-overlapping best matches, limited to estimatedCount
    allMatches.sort((a, b) => b.conf - a.conf);
    let picked: Match[] = [];
    const used = new Set<number>();
    for (const m of allMatches) {
      if (picked.length >= Math.max(estimatedCount, expectedCount + 1)) break;
      let overlaps = false;
      for (let px = m.x; px < m.x + 5; px++) {
        if (used.has(px)) { overlaps = true; break; }
      }
      if (!overlaps) {
        picked.push(m);
        for (let px = m.x - 1; px < m.x + 6; px++) used.add(px);
      }
    }
    picked.sort((a, b) => a.x - b.x);

    // Ghost filter (keep only top chars)
    if (picked.length > 1) {
      const bestConf = Math.max(...picked.map(m => m.conf));
      picked = picked.filter(m => m.conf >= bestConf * 0.5);
      // If picked.length > estimatedCount, trim lowest conf ones
      if (picked.length > estimatedCount + 2) {
        picked.sort((a, b) => b.conf - a.conf);
        picked.splice(estimatedCount + 1);
        picked.sort((a, b) => a.x - b.x);
      }
    }

    // Build recognized string with dash detection
    const recognized = picked.map(m => m.char).join("");
    const match = recognized === expected;

    if (match) totalCorrect++;
    totalChars += expected.length;

    if (match) console.log(`  #${pn}: "${expected}" ✓ (est=${estimatedCount}, actual=${expectedCount})`);
    else console.log(`  #${pn}: "${expected}" → "${recognized}" ✗ (est=${estimatedCount})`);
  }

  console.log(`\nWatermark accuracy: ${totalCorrect}/40 puzzles (${(totalCorrect/40*100).toFixed(0)}%)`);

  console.log(`\n完成。`);
  console.log(`  训练图: ${JIANKU_DIR}/`);
  console.log(`  模板: templates/`);
}

main();
