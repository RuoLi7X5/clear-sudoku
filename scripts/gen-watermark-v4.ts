/**
 * 水印 v4 — 大写字母宽提取 + 全独立样本
 * - 小写/数字: 10px 提取 → 12×16 模板
 * - 大写字母: 14px 提取 → 14×16 模板 (避免切碎)
 * - 所有字符保留 20 个独立样本 (不取平均, NCC 逐一比对)
 */
import { writeFileSync, mkdirSync } from "fs";
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

function scaleTo(input: number[][], iW: number, iH: number, oW: number, oH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < oH; y++) {
    const row: number[] = [], sY = y / oH * iH, y0 = Math.floor(sY), y1 = Math.min(y0 + 1, iH - 1), yF = sY - y0;
    for (let x = 0; x < oW; x++) {
      const sX = x / oW * iW, x0 = Math.floor(sX), x1 = Math.min(x0 + 1, iW - 1), xF = sX - x0;
      const v00 = input[y0]?.[x0] ?? 0, v10 = input[y0]?.[x1] ?? 0, v01 = input[y1]?.[x0] ?? 0, v11 = input[y1]?.[x1] ?? 0;
      row.push((v00 * (1 - xF) + v10 * xF) * (1 - yF) + (v01 * (1 - xF) + v11 * xF) * yF);
    }
    out.push(row);
  }
  return out;
}

function makeTemplate(pixels: number[][], inW: number, outW: number, outH: number) {
  const sp = inW === outW ? pixels : scaleTo(pixels, inW, outH, outW, outH);
  let dc = 0;
  for (const row of sp) for (const v of row) if (v > 128) dc++;
  return { pixels: sp, darkCount: dc };
}

async function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const ALL_CHARS: Array<{ char: string; filename: string; charW: number; tplW: number }> = [];
  for (let d = 0; d <= 9; d++) ALL_CHARS.push({ char: String(d), filename: `wm_${d}.json`, charW: 10, tplW: 12 });
  for (let c = 97; c <= 122; c++) ALL_CHARS.push({ char: String.fromCharCode(c), filename: `wm_${String.fromCharCode(c)}.json`, charW: 10, tplW: 12 });
  // Uppercase: wider extraction
  for (let c = 65; c <= 90; c++) ALL_CHARS.push({ char: String.fromCharCode(c), filename: `wmu_${String.fromCharCode(c)}.json`, charW: 14, tplW: 14 });
  ALL_CHARS.push({ char: "-", filename: "wm_dash.json", charW: 10, tplW: 12 });

  const TPL_H = 16, WMX = 28, WMY = 930;
  const N_SAMPLES = 20;

  console.log(`=== 生成 ${ALL_CHARS.length} 字符 × ${N_SAMPLES} 独立样本 ===\n`);

  for (let ci = 0; ci < ALL_CHARS.length; ci++) {
    const { char, filename, charW, tplW } = ALL_CHARS[ci];
    const sampleEntries: Array<{ pixels: number[][]; darkCount: number }> = [];
    const allPx: number[][][] = [];

    for (let pi = 0; pi < N_SAMPLES; pi++) {
      const answer = ANSWERS[pi % ANSWERS.length];
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
        for (let x = 0; x < charW; x++)
          row.push(255 - grayAt(data, imgW, WMX + x, WMY + y));
        px.push(row);
      }
      allPx.push(px);
      sampleEntries.push(makeTemplate(px, charW, tplW, TPL_H));
    }

    // Mean for the main pixels field
    const mean: number[][] = [];
    let meanDc = 0;
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < tplW; x++) {
        let sum = 0;
        for (const s of sampleEntries) sum += s.pixels[y][x];
        const v = Math.round(sum / sampleEntries.length);
        row.push(v);
        if (v > 128) meanDc++;
      }
      mean.push(row);
    }

    // Use mean template only (1 sample) — more stable than individual samples
    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: tplW, h: TPL_H, char, pixels: mean, darkCount: meanDc,
      samples: [{ pixels: mean, darkCount: meanDc }],
    }, null, 2));

    if ((ci + 1) % 10 === 0 || ci === ALL_CHARS.length - 1)
      console.log(`  ${ci + 1}/${ALL_CHARS.length}: ${filename} (${charW}→${tplW})×${TPL_H} ${sampleEntries.length}样本`);
  }

  // Verify
  console.log("\n=== 验证 ===\n");
  const { matchWatermarkChar, reloadTemplates } = require("../lib/template-match");
  reloadTemplates();

  const tests = ['421', 'dd-65', 'AB-12', 'x-9', 'abc', 'A1b-2C', 'DD-88', 'Test', 'Hi-42'];
  let ok = 0;

  for (const wm of tests) {
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

    const wmPx: number[][] = [];
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < wmW; x++) row.push(255 - grayAt(data, imgW, WMX + x, WMY + y));
      wmPx.push(row);
    }

    // Ink estimation
    const proj: number[] = [];
    for (let x = 0; x < wmW; x++) { let dk = 0; for (let y = 0; y < TPL_H; y++) if (wmPx[y][x] > 80) dk++; proj.push(dk); }
    const pm = Math.max(...proj);
    let est = 0, inC = false, le = 0;
    for (let x = 0; x < wmW; x++) {
      if (proj[x] > pm * 0.12 && !inC) inC = true;
      else if (proj[x] <= pm * 0.12 && inC) { if (x - le >= 3) { est++; le = x; } inC = false; }
    }
    if (inC && wmW - le >= 3) est++;
    const maxChars = Math.max(est + 1, 4);

    type M = { x: number; char: string; conf: number };
    const am: M[] = [];
    for (const ww of [8, 10, 12, 14]) {
      for (let x = 0; x + ww <= wmW; x += 2) {
        const wp: number[][] = [];
        for (let y = 0; y < TPL_H; y++) wp.push(wmPx[y].slice(x, x + ww));
        const r = matchWatermarkChar(wp, ww, TPL_H);
        if (r.confidence > 0.6) am.push({ x, char: r.char, conf: r.confidence });
      }
    }
    am.sort((a, b) => b.conf - a.conf);
    let picked: M[] = [];
    const used = new Set<number>();
    for (const m of am) {
      if (picked.length >= maxChars) break;
      let ov = false;
      for (let px = m.x; px < m.x + 5; px++) { if (used.has(px)) { ov = true; break; } }
      if (!ov) { picked.push(m); for (let px = m.x - 1; px < m.x + 6; px++) used.add(px); }
    }
    if (picked.length > 1) {
      const bc = Math.max(...picked.map(m => m.conf));
      picked = picked.filter(m => m.conf >= bc * 0.55);
    }
    // Trim trailing low-confidence chars
    if (picked.length > 1) {
      const avgConf = picked.reduce((s, m) => s + m.conf, 0) / picked.length;
      while (picked.length > 0 && picked[picked.length - 1].conf < avgConf * 0.7) {
        picked.pop();
      }
    }
    picked.sort((a, b) => a.x - b.x);

    // Build with dash detection
    const parts: string[] = [];
    let lastEnd = 0;
    for (const m of picked) {
      if (parts.length > 0 && m.x - lastEnd >= 4) {
        const gp: number[][] = [];
        for (let y = 0; y < TPL_H; y++) gp.push(wmPx[y].slice(lastEnd, m.x));
        const gw = gp[0]?.length || 0;
        if (gw >= 3) {
          let md = 0, mt = 0, midY = Math.floor(TPL_H / 2);
          for (let dx = 0; dx < gw; dx++) { if ((gp[midY]?.[dx] ?? 0) > 100) md++; mt++; }
          if (md / Math.max(1, mt) > 0.2) parts.push("-");
        }
      }
      parts.push(m.char);
      lastEnd = m.x + 8;
    }
    const reco = parts.join("");
    const pass = reco === wm;
    if (pass) ok++;
    console.log("  " + wm.padEnd(10) + " → " + reco.padEnd(12) + (pass ? " ✓" : " ✗"));
  }
  console.log(`\n${ok}/${tests.length} pass`);
}

main();
