/**
 * 水印全字符模板生成 — 使用1-40题两遍识别法
 *
 * 与字体模板同理：用已知答案渲染 → 二次识别对比 → 提取样本 → 构建模板
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMAGES_DIR = join(__dirname, "..", "..", "..", "images");
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

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

async function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Characters to generate: 0-9, a-z, A-Z, dash
  const allChars: Array<{ char: string; filename: string }> = [];
  for (let d = 0; d <= 9; d++) allChars.push({ char: String(d), filename: `wm_${d}.json` });
  for (let c = 97; c <= 122; c++) allChars.push({ char: String.fromCharCode(c), filename: `wm_${String.fromCharCode(c)}.json` });
  for (let c = 65; c <= 90; c++) allChars.push({ char: String.fromCharCode(c), filename: `wmu_${String.fromCharCode(c)}.json` });
  allChars.push({ char: "-", filename: "wm_dash.json" });

  // Collect samples per character
  const samplesByChar = new Map<string, Array<{ pixels: number[][]; w: number; h: number }>>();
  for (const { char } of allChars) samplesByChar.set(char, []);

  const TPL_W = 12, TPL_H = 16, CHAR_W = 10;

  // Render each puzzle 1-40 with a 6-char watermark containing various characters
  // We'll cycle through all 63 characters across 40 puzzles (each puzzle covers ~6 chars)
  console.log("=== 渲染 40 题水印样本 ===\n");

  for (let pi = 0; pi < 40; pi++) {
    const pn = pi + 1;
    const answer = ANSWERS[pi];

    // Build the board from answer
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

    // Build a 5-char watermark using different characters for each puzzle
    // Cycle: puzzle 1 uses chars 1-5, puzzle 2 uses 6-10, etc.
    const startIdx = (pi * 5) % allChars.length;
    const wmChars: string[] = [];
    for (let ci = 0; ci < 5; ci++) {
      const idx = (startIdx + ci) % allChars.length;
      wmChars.push(allChars[idx].char);
    }
    const watermark = wmChars.join("");

    const board = new BoardState(givens, deduced, candidates);
    board.watermark = watermark;

    const buf = await renderer.render(board, { showCandidates: false, watermark: board.watermark });
    const png = PNG.sync.read(buf);
    const data = png.data as Uint8Array;
    const imgW = png.width;

    // Extract each character at known position (10px per char)
    const wmX = 28, wmY = 930;
    for (let ci = 0; ci < watermark.length; ci++) {
      const char = watermark[ci];
      const cx = wmX + ci * CHAR_W;
      const px: number[][] = [];
      for (let y = 0; y < TPL_H; y++) {
        const row: number[] = [];
        for (let x = 0; x < CHAR_W; x++)
          row.push(255 - grayAt(data, imgW, cx + x, wmY + y));
        px.push(row);
      }
      if (samplesByChar.has(char)) {
        samplesByChar.get(char)!.push({ pixels: px, w: CHAR_W, h: TPL_H });
      }
    }

    if (pi % 10 === 9) console.log(`  已处理 ${pn}/40 题`);
  }

  // Build mean templates
  console.log("\n=== 构建模板 ===\n");

  for (const { char, filename } of allChars) {
    const samples = samplesByChar.get(char) || [];
    if (samples.length === 0) { console.log(`  ⚠ ${char}: 无样本`); continue; }

    // Average pixels
    const avg: number[][] = [];
    let darkCount = 0;
    for (let y = 0; y < TPL_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < TPL_W; x++) {
        let sum = 0;
        for (const s of samples) {
          // Scale 10→12 width via bilinear
          const srcX = (x / TPL_W) * CHAR_W;
          const x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, CHAR_W - 1), xF = srcX - x0;
          const v0 = s.pixels[y]?.[x0] ?? 0, v1 = s.pixels[y]?.[x1] ?? 0;
          sum += v0 * (1 - xF) + v1 * xF;
        }
        const v = Math.round(sum / samples.length);
        row.push(v);
        if (v > 128) darkCount++;
      }
      avg.push(row);
    }

    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: TPL_W, h: TPL_H, char, pixels: avg, darkCount, sampleCount: samples.length,
      samples: [{ pixels: avg, darkCount }],
    }, null, 2));
    console.log(`  ${filename}: ${samples.length}样本 → ${TPL_W}x${TPL_H} dark=${darkCount}`);
  }

  console.log(`\n完成。${allChars.length} 个模板 → templates/`);
}

main();
