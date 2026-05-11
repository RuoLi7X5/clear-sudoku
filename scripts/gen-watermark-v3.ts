/**
 * 水印模板 v3 — 单字符水印 × 多题 = 充足样本
 * 每个字符渲染在 10 个不同盘面上，提取 10+ 样本取平均
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

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
];

function grayAt(d: Uint8Array, iw: number, x: number, y: number): number {
  const idx = (Math.round(y) * iw + Math.round(x)) * 4;
  return Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
}

async function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const ALL_CHARS: Array<{ char: string; filename: string }> = [];
  for (let d = 0; d <= 9; d++) ALL_CHARS.push({ char: String(d), filename: `wm_${d}.json` });
  for (let c = 97; c <= 122; c++) ALL_CHARS.push({ char: String.fromCharCode(c), filename: `wm_${String.fromCharCode(c)}.json` });
  for (let c = 65; c <= 90; c++) ALL_CHARS.push({ char: String.fromCharCode(c), filename: `wmu_${String.fromCharCode(c)}.json` });
  ALL_CHARS.push({ char: "-", filename: "wm_dash.json" });

  const TPL_W = 12, TPL_H = 16, CHAR_W = 10;
  const PAD = 24, CS = 100, WMX = 28, WMY = 930;

  console.log(`=== 生成 ${ALL_CHARS.length} 个水印字符模板 (每字符 ${10} 样本) ===\n`);

  for (let ci = 0; ci < ALL_CHARS.length; ci++) {
    const { char, filename } = ALL_CHARS[ci];
    const samples: number[][][] = [];

    // Render this char as watermark on 20 different puzzles
    for (let pi = 0; pi < 20; pi++) {
      const answer = ANSWERS[pi];
      const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
      const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => new Set<number>())
      );
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          const v = parseInt(answer[r * 9 + c], 10);
          if (v > 0) { givens[r][c] = v; candidates[r][c] = new Set([v]); }
        }

      const board = new BoardState(givens, Array.from({ length: 9 }, () => Array(9).fill(0)), candidates);
      board.watermark = char;

      const buf = await renderer.render(board, { showCandidates: false, watermark: char });
      const png = PNG.sync.read(buf);
      const data = png.data as Uint8Array;
      const imgW = png.width;

      const px: number[][] = [];
      for (let y = 0; y < TPL_H; y++) {
        const row: number[] = [];
        for (let x = 0; x < CHAR_W; x++)
          row.push(255 - grayAt(data, imgW, WMX + x, WMY + y));
        px.push(row);
      }
      samples.push(px);
    }

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
          sum += (s[y]?.[x0] ?? 0) * (1 - xF) + (s[y]?.[x1] ?? 0) * xF;
        }
        const v = Math.round(sum / samples.length);
        row.push(v);
        if (v > 128) darkCount++;
      }
      avg.push(row);
    }

    // Store all individual samples (not just mean)
    const sampleEntries = samples.map(s => {
      // Scale 10→12 width
      const sp: number[][] = [];
      let dc = 0;
      for (let y = 0; y < TPL_H; y++) {
        const row: number[] = [];
        for (let x = 0; x < TPL_W; x++) {
          const srcX = (x / TPL_W) * CHAR_W;
          const x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, CHAR_W - 1), xF = srcX - x0;
          const v = Math.round((s[y]?.[x0] ?? 0) * (1 - xF) + (s[y]?.[x1] ?? 0) * xF);
          row.push(v);
          if (v > 128) dc++;
        }
        sp.push(row);
      }
      return { pixels: sp, darkCount: dc };
    });

    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: TPL_W, h: TPL_H, char, pixels: avg, darkCount, sampleCount: samples.length,
      samples: sampleEntries,
    }, null, 2));

    if ((ci + 1) % 10 === 0 || ci === ALL_CHARS.length - 1)
      console.log(`  ${ci + 1}/${ALL_CHARS.length}: ${filename} dark=${darkCount}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 验证
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== 验证水印识别 ===\n");
  const { matchWatermarkChar, reloadTemplates } = require("../lib/template-match");
  reloadTemplates();

  // Test watermarks
  const testWMs = ['421', 'dd-65', 'AB-12', 'x-9', 'abc', 'A1b-2C', 'DD-88', 'Test', 'Hi-42'];

  let allOk = true;
  for (const wm of testWMs) {
    const answer = ANSWERS[0];
    const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>())
    );
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const v = parseInt(answer[r * 9 + c], 10);
        if (v > 0) { givens[r][c] = v; candidates[r][c] = new Set([v]); }
      }
    const board = new BoardState(givens, Array.from({ length: 9 }, () => Array(9).fill(0)), candidates);
    board.watermark = wm;

    const buf = await renderer.render(board, { showCandidates: false, watermark: wm });
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;
    const wmW = Math.min(200, imgW - WMX);

    // Extract and OCR
    const wmPixels: number[][] = [];
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < wmW; x++)
        row.push(255 - grayAt(data, imgW, WMX + x, WMY + y));
      wmPixels.push(row);
    }

    type Match = { x: number; char: string; conf: number };
    const allMatches: Match[] = [];
    for (const winW of [8, 10, 12]) {
      for (let x = 0; x + winW <= wmW; x += 2) {
        const wp: number[][] = [];
        for (let y = 0; y < TPL_H; y++) wp.push(wmPixels[y].slice(x, x + winW));
        const r = matchWatermarkChar(wp, winW, TPL_H);
        if (r.confidence > 0.6) allMatches.push({ x, char: r.char, conf: r.confidence });
      }
    }
    allMatches.sort((a, b) => b.conf - a.conf);
    let picked: Match[] = [];
    const used = new Set<number>();
    for (const m of allMatches) {
      let ov = false;
      for (let px = m.x; px < m.x + 5; px++) { if (used.has(px)) { ov = true; break; } }
      if (!ov) { picked.push(m); for (let px = m.x - 1; px < m.x + 6; px++) used.add(px); }
    }
    if (picked.length > 1) {
      const bc = Math.max(...picked.map(m => m.conf));
      picked = picked.filter(m => m.conf >= bc * 0.55);
    }
    picked.sort((a, b) => a.x - b.x);

    const recognized = picked.map(m => m.char).join("");
    const pass = recognized === wm;
    console.log("  " + wm.padEnd(10) + " → " + recognized.padEnd(12) + (pass ? " ✓" : " ✗"));
    if (!pass) allOk = false;
  }
  console.log(allOk ? "\n✓ All pass" : "\n✗ Some failed");
}

main();
