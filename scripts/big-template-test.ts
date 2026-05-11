/**
 * 手写模板独立测试 — 只用 big 模板识别 images/1-40，对比答案
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { matchBigDigit } from "../src/template-match";
import { detectGridLines, extractGrayscale } from "../src/ocr";

const IMG = join(__dirname, "..", "..", "..", "images");
const OUT = join(__dirname, "..", "big-diag");
const A = ["006002800080600270025000061604070032200304700030201900042080600160925007000006020","005070080030504100000308057500000090080406510004005008056003041140050600070641005","010073005005009130309156870050690700000708050002345001037560200006007510500900007","002005090000800004080000200006000905090001003230000780008506070000400009060070300","043009100816037009097100080734910026625370910981060700350001000460700001179040000","600009005020536047005100609007900513080300974300400286000603751000701490000090360","700208005020050070000000200308010062200805731070320800030070010007590306600183407","310420600020009010009001002032094801080270030040138200070853926203940100098012040","726894315590106000081520000100602450048050100050401000015068020060310500800245001","002068040306020008890070620060490872980002406020086010630249085008600200209810060","813406902570120004402003010925341786104207080080045201600004120008010000001700000","704100069030600407096070023017060030460700001309010746641087390978306004253941678","000197082802050079070020400000900000006005730500030004400500200020089047000000060","034705000728614009600023400800070000370008002002030800263047001497001060581300704","010300040030009200700000038042090070000720400087134092000057010401083020009200300","003800400600400003040030009004000930932018004567943218458200391206380745370004862","140007090002930147907041006001000904058409710409013085700100400090304001014802000","010090703009007010000005490000250009020700000600080070200400307070508000001070050","203007500780563204450200370530920040024005900697834125902050400305009002040302059","060004082002803675500672904006738000000900008000020700900267843003089007070305200","620079103000100060001306500100687009039215706006493015000000001900031050018000000","007006000500010600601205000106030028800652100002108006305860200214593867068020030","120060000006100009400008010200000400004050923090234071051003007000600130300010090","402695308000708025850200009200901080060800092908402500500380206080526900623109850","003008600400000358050300009002090013900003086030004097000005060006200805085060004","210460900408190006396070140001009004640210000509604017004001300100040000000006401","038006020014023000692500003853069000921300006467218359280004030049600005070000400","302090508005328040089500230820900074003481625004000890007600480000839702008040050","500678210008419075071253480107806530800105790050147108400702801010084007780501940","000800540400630208080004000804070350500008907060350824000002700600000005070010002","641208900700040008890071046270800401164723895080014700028460000416007080907182604","005000001090170052102053006051300249040521003200004510060019025027635104510040000","000100002021000038800027100003890050080040300100006084200010060010004800050600013","020493008053708640480006030340079086005800304008304000530940867804037900070085403","010786400408905070907104000004697020000841000070352046700209004002408300040503010","500060079098107056070003800000004060730200001009001000000000008980000020010080700","103570000058103070796284513030407050579018042600725700900000080007002400060000000","120089674004016002000402510401053200002048156500201340010807420700124000248095701","204500003358040720006002450402007500005900042080254376503781204047020005820405007","000000001080200600006010020050006040004950062600300100300800010040007009005090000"];

function grayAt(d: Uint8Array, iw: number, x: number, y: number): number {
  const idx = (Math.round(y) * iw + Math.round(x)) * 4;
  return Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
}

function findImg(n: number): string | null {
  for (const ext of [".png", ".jpg"]) { const p = join(IMG, `${n}${ext}`); if (existsSync(p)) return p; }
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // ── Test 1: ONLY big templates, per-cell comparison ──
  console.log("=== core模板(手写+数字+xsudoku)识别 images/1-40 ===\n");

  const allErrors: Array<{ puzzle: number; cell: string; expected: number; got: number }> = [];
  let totalCorrect = 0, totalWrong = 0, totalMissed = 0;

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1, answer = A[pi];
    const imgPath = findImg(pn);
    if (!imgPath) { console.log(`  #${pn}: 图片不存在`); continue; }

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
          const result = matchBigDigit(px, bw, bh, "core");
          if (result.confidence > 0.55) got = result.digit;
        }

        const hasDigit = mv >= 30;
        // 只评估答案中有数字的格（given+deduced），空格不在评估范围
        if (exp === 0) {
          // 空格：由墨迹检测+候选数识别处理，不评估大数模板
          continue;
        }
        if (hasDigit && got === exp) correct++;
        else {
          const cell = `${String.fromCharCode(65 + r)}${c + 1}`;
          if (hasDigit && got === 0) { missed++; totalMissed++; }
          else if (hasDigit && got !== exp) { wrong++; totalWrong++; }
          else if (!hasDigit && exp !== 0) { missed++; totalMissed++; }
          allErrors.push({ puzzle: pn, cell, expected: exp, got });
        }
      }
    }

    totalCorrect += correct;
    const nonZero = answer.split("").filter((ch: string) => ch !== "0").length;
    const status = wrong + missed === 0 ? "✓" : `✗ wrong=${wrong} missed=${missed}`;
    console.log(`  ${status} #${pn}: ${correct}/${nonZero} (wrong=${wrong} missed=${missed})`);
  }

  const totalNonZero = A.join("").split("").filter((ch: string) => ch !== "0").length;
  console.log(`\n=== 汇总 (仅非零格) ===`);
  console.log(`正确: ${totalCorrect}/${totalNonZero} (${(totalCorrect / totalNonZero * 100).toFixed(2)}%)`);
  console.log(`错识: ${totalWrong}, 漏识: ${totalMissed}`);

  // Group errors by expected digit
  console.log("\n按数字分组:");
  for (let d = 1; d <= 9; d++) {
    const missed = allErrors.filter(e => e.expected === d && e.got === 0);
    const wrong = allErrors.filter(e => e.expected === d && e.got !== 0 && e.got !== d);
    if (missed.length + wrong.length > 0) {
      console.log(`  数字${d}: 漏识${missed.length} 错识${wrong.length}`);
    }
  }

  // Confusion matrix
  console.log("\n混淆矩阵 (expected→got):");
  const confusion: Record<string, number> = {};
  for (const e of allErrors) {
    const key = `${e.expected}→${e.got}`;
    confusion[key] = (confusion[key] || 0) + 1;
  }
  const sorted = Object.entries(confusion).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of sorted.slice(0, 20)) console.log(`  ${k}: ${v}`);

  writeFileSync(join(OUT, "errors.json"), JSON.stringify(allErrors, null, 2));
}

main();
