/**
 * 手写模板校准 v2 — 从 images/1-40 提取已知数字样本，重建 big 模板
 * 迭代至原始匹配 100%
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { detectGridLines, extractGrayscale } from "../src/ocr";
import { scaleTo } from "../src/template-match";

const IMG = join(__dirname, "..", "..", "..", "images");
const TPL = join(__dirname, "..", "templates");
const A = ["006002800080600270025000061604070032200304700030201900042080600160925007000006020","005070080030504100000308057500000090080406510004005008056003041140050600070641005","010073005005009130309156870050690700000708050002345001037560200006007510500900007","002005090000800004080000200006000905090001003230000780008506070000400009060070300","043009100816037009097100080734910026625370910981060700350001000460700001179040000","600009005020536047005100609007900513080300974300400286000603751000701490000090360","700208005020050070000000200308010062200805731070320800030070010007590306600183407","310420600020009010009001002032094801080270030040138200070853926203940100098012040","726894315590106000081520000100602450048050100050401000015068020060310500800245001","002068040306020008890070620060490872980002406020086010630249085008600200209810060","813406902570120004402003010925341786104207080080045201600004120008010000001700000","704100069030600407096070023017060030460700001309010746641087390978306004253941678","000197082802050079070020400000900000006005730500030004400500200020089047000000060","034705000728614009600023400800070000370008002002030800263047001497001060581300704","010300040030009200700000038042090070000720400087134092000057010401083020009200300","003800400600400003040030009004000930932018004567943218458200391206380745370004862","140007090002930147907041006001000904058409710409013085700100400090304001014802000","010090703009007010000005490000250009020700000600080070200400307070508000001070050","203007500780563204450200370530920040024005900697834125902050400305009002040302059","060004082002803675500672904006738000000900008000020700900267843003089007070305200","620079103000100060001306500100687009039215706006493015000000001900031050018000000","007006000500010600601205000106030028800652100002108006305860200214593867068020030","120060000006100009400008010200000400004050923090234071051003007000600130300010090","402695308000708025850200009200901080060800092908402500500380206080526900623109850","003008600400000358050300009002090013900003086030004097000005060006200805085060004","210460900408190006396070140001009004640210000509604017004001300100040000000006401","038006020014023000692500003853069000921300006467218359280004030049600005070000400","302090508005328040089500230820900074003481625004000890007600480000839702008040050","500678210008419075071253480107806530800105790050147108400702801010084007780501940","000800540400630208080004000804070350500008907060350824000002700600000005070010002","641208900700040008890071046270800401164723895080014700028460000416007080907182604","005000001090170052102053006051300249040521003200004510060019025027635104510040000","000100002021000038800027100003890050080040300100006084200010060010004800050600013","020493008053708640480006030340079086005800304008304000530940867804037900070085403","010786400408905070907104000004697020000841000070352046700209004002408300040503010","500060079098107056070003800000004060730200001009001000000000008980000020010080700","103570000058103070796284513030407050579018042600725700900000080007002400060000000","120089674004016002000402510401053200002048156500201340010807420700124000248095701","204500003358040720006002450402007500005900042080254376503781204047020005820405007","000000001080200600006010020050006040004950062600300100300800010040007009005090000"];

function findImg(n: number): string | null {
  for (const ext of [".png", ".jpg"]) { const p = join(IMG, `${n}${ext}`); if (existsSync(p)) return p; }
  return null;
}

function ncc(input: number[][], tpl: { pixels: number[][]; w: number; h: number; mean: number }): number {
  if (!tpl.pixels || tpl.pixels.length === 0) return 0;
  const tH = tpl.h, tW = tpl.w, iH = input.length, iW = input[0]?.length || 0;
  if (iH === 0 || iW === 0) return 0;
  const scaled = scaleTo(input, iW, iH, tW, tH);
  let iSum = 0;
  for (let y = 0; y < tH; y++) for (let x = 0; x < tW; x++) iSum += scaled[y][x];
  const iMean = iSum / (tW * tH);
  let num = 0, dI = 0, dT = 0;
  const tMean = tpl.mean || 0;
  for (let y = 0; y < tH; y++) for (let x = 0; x < tW; x++) {
    const iD = scaled[y][x] - iMean, tD = tpl.pixels[y][x] - tMean;
    num += iD * tD; dI += iD * iD; dT += tD * tD;
  }
  const denom = Math.sqrt(dI * dT);
  if (denom < 1e-6) return 0;
  return num / denom;
}

async function main() {
  mkdirSync(TPL, { recursive: true });

  // ── Step 1: Extract ALL known digital pixel samples from images/1-40 ──
  console.log("=== 提取已知数字样本 ===\n");
  const byDigit: Record<number, number[][][]> = {};
  for (let d = 1; d <= 9; d++) byDigit[d] = [];

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1, answer = A[pi];
    const imgPath = findImg(pn);
    if (!imgPath) continue;

    const buf = readFileSync(imgPath);
    let data: Uint8Array, imgW: number, imgH: number;
    if (buf[0] === 0x89) {
      const { PNG } = require("pngjs"); const p = PNG.sync.read(buf);
      data = p.data as Uint8Array; imgW = p.width; imgH = p.height;
    } else {
      const jpeg = require("jpeg-js"); const raw = jpeg.decode(buf, { useTArray: true });
      data = raw.data as Uint8Array; imgW = raw.width; imgH = raw.height;
    }

    const grid = detectGridLines(data, imgW, imgH);
    const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const exp = parseInt(answer[r * 9 + c], 10);
        if (exp === 0) continue;
        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const cw = x2 - x1, ch = y2 - y1;
        if (cw < 10 || ch < 10) continue;
        const inset = Math.max(2, cw * 0.12);
        const px = extractGrayscale(data, imgW, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
        let mv = 0;
        for (const row of px) for (const v of row) if (v > mv) mv = v;
        if (mv < 30) continue;
        byDigit[exp].push(px);
      }
    }
  }

  for (let d = 1; d <= 9; d++) console.log(`  数字${d}: ${byDigit[d].length} 样本`);

  // ── Step 2: Build mean templates (keep existing template size 24×36) ──
  console.log("\n=== 构建模板 (24×36) ===\n");
  const TPL_W = 24, TPL_H = 36;

  for (let d = 1; d <= 9; d++) {
    const samples = byDigit[d];
    // Normalize each sample to 24×36
    const norm: number[][][] = [];
    for (const s of samples) {
      norm.push(scaleTo(s, s[0]?.length || 1, s.length, TPL_W, TPL_H));
    }

    const mean: number[][] = [];
    let darkCount = 0;
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < TPL_W; x++) {
        let sum = 0;
        for (const np of norm) sum += np[y][x];
        const v = Math.round(sum / norm.length);
        row.push(v);
        if (v > 128) darkCount++;
      }
      mean.push(row);
    }

    writeFileSync(join(TPL, `big_${d}.json`), JSON.stringify({
      digit: d, w: TPL_W, h: TPL_H, pixels: mean, darkCount,
      samples: [{ pixels: mean, darkCount }],
    }, null, 2));
    console.log(`  big_${d}.json: ${samples.length}→${TPL_W}×${TPL_H} dark=${darkCount}`);
  }

  // ── Step 3: Test with rebuilt templates ──
  console.log("\n=== 测试新模板 ===\n");
  const { reloadTemplates, matchBigDigit } = require("../lib/template-match");
  reloadTemplates();

  let totalCorrect = 0, totalWrong = 0, totalMissed = 0;
  const errors: string[] = [];

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1, answer = A[pi];
    const imgPath = findImg(pn);
    if (!imgPath) continue;
    const buf = readFileSync(imgPath);
    let data: Uint8Array, imgW: number, imgH: number;
    if (buf[0] === 0x89) {
      const { PNG } = require("pngjs"); const p = PNG.sync.read(buf);
      data = p.data as Uint8Array; imgW = p.width; imgH = p.height;
    } else {
      const jpeg = require("jpeg-js"); const raw = jpeg.decode(buf, { useTArray: true });
      data = raw.data as Uint8Array; imgW = raw.width; imgH = raw.height;
    }
    const grid = detectGridLines(data, imgW, imgH);
    const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

    let correct = 0, wrong = 0, missed = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const exp = parseInt(answer[r * 9 + c], 10);
        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const cw = x2 - x1, ch = y2 - y1;
        if (cw < 5 || ch < 5) continue;
        const inset = Math.max(2, cw * 0.12);
        const px = extractGrayscale(data, imgW, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
        const bw = Math.round(x2 - x1 - 2 * inset), bh = Math.round(y2 - y1 - 2 * inset);
        let mv = 0;
        for (const row of px) for (const v of row) if (v > mv) mv = v;
        let got = 0;
        if (mv >= 30 && bw >= 5 && bh >= 5) {
          const result = matchBigDigit(px, bw, bh, "big");
          if (result.confidence > 0.5) got = result.digit;
        }
        const hasDigit = mv >= 30;
        if (!hasDigit && exp === 0) correct++;
        else if (hasDigit && got === exp) correct++;
        else {
          const cell = `${String.fromCharCode(65 + r)}${c + 1}`;
          if (hasDigit && got === 0) missed++;
          else if (hasDigit && got !== exp) wrong++;
          else if (!hasDigit && exp !== 0) missed++;
        }
      }
    }
    totalCorrect += correct; totalWrong += wrong; totalMissed += missed;
    const status = wrong + missed === 0 ? "✓" : `✗ wrong=${wrong} missed=${missed}`;
    console.log(`  ${status} #${pn}: ${correct}/81`);
  }

  const total = 40 * 81;
  console.log(`\n合计: ${totalCorrect}/${total} (${(totalCorrect / total * 100).toFixed(2)}%) wrong=${totalWrong} missed=${totalMissed}`);
}

main();
