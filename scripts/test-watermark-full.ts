/**
 * 水印闭环完整测试：40题渲染→打水印→二次识别→验证水印保留
 * 同时校准水印模板
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

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
  "813406902570120004402003010925381746104207080080045201600004120008010000001700000",
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

function scaleTo(input: number[][], iW: number, iH: number, oW: number, oH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < oH; y++) {
    const row: number[] = [], sY = y/oH*iH, y0=Math.floor(sY), y1=Math.min(y0+1,iH-1), yF=sY-y0;
    for (let x = 0; x < oW; x++) {
      const sX = x/oW*iW, x0=Math.floor(sX), x1=Math.min(x0+1,iW-1), xF=sX-x0;
      const v00=input[y0]?.[x0]??0, v10=input[y0]?.[x1]??0, v01=input[y1]?.[x0]??0, v11=input[y1]?.[x1]??0;
      row.push((v00*(1-xF)+v10*xF)*(1-yF)+(v01*(1-xF)+v11*xF)*yF);
    }
    out.push(row);
  }
  return out;
}

function grayAt(data: Uint8Array, w: number, x: number, y: number): number {
  const i = Math.round(y)*w*4+Math.round(x)*4;
  return Math.round(0.299*data[i]+0.587*data[i+1]+0.114*data[i+2]);
}

const TPL_W = 12, TPL_H = 16;

async function main() {
  const { parseCommand } = require("../lib/parser");
  const { recognizeBoard, preloadTemplates, extractGrayscale } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");
  const { reloadTemplates, matchWatermarkDigit } = require("../lib/template-match");

  preloadTemplates();

  // Test 1: complex parse
  console.log("=== 测试1: 复杂指令解析 ===");
  for (const [input, expectedWm, expectedOps] of [
    ["ABC56,GH23,F79 #23-4", "23-4", 6],
    ["A59 #8", "8", 1],
    ["A59,B44", undefined, 2],
  ] as [string, string|undefined, number][]) {
    const r = parseCommand(input);
    if ("error" in r) { console.log(`  [FAIL] "${input}" → ${r.error}`); continue; }
    const wmOk = r.watermark === expectedWm;
    const opsOk = r.operations.length === expectedOps;
    console.log(`  [${wmOk&&opsOk?"OK":"FAIL"}] "${input}" → ${r.operations.length}ops, wm="${r.watermark}"`);
  }

  // Test 2: Render 40 images with watermarks
  console.log("\n=== 测试2: 40题渲染+水印 ===");
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const OUT1 = join(__dirname, "..", "..", "..", "testoutput");
  const OUT2 = join(__dirname, "..", "..", "..", "testoutput2");
  if (!existsSync(OUT1)) mkdirSync(OUT1, { recursive: true });
  if (!existsSync(OUT2)) mkdirSync(OUT2, { recursive: true });

  let pass = 0, fail = 0;
  const wmSamples = new Map<string, number[][][]>();
  for (let d = 0; d <= 9; d++) wmSamples.set(String(d), []);

  for (let i = 1; i <= 40; i++) {
    const imgPath = join(IMG_DIR, `${i}.png`);
    if (!existsSync(imgPath)) continue;

    process.stdout.write(`[${i}/40] `);

    try {
      const buf = readFileSync(imgPath);
      const ocr = await recognizeBoard(buf, logger);
      const board = BoardState.fromOCR(ocr);
      board.watermark = String(i);

      const rendered = await renderer.renderResult(board);
      writeFileSync(join(OUT1, `${i}.png`), rendered);

      // Re-OCR
      const reOcr = await recognizeBoard(rendered, logger);
      const wmOk = reOcr.watermark === String(i);

      // Extract watermark digit pixels for calibration
      if (!wmOk && reOcr.watermark) {
        const png = PNG.sync.read(rendered);
        const data = png.data as Uint8Array;
        const wmX = 28, wmY = 930, charW = 10, wmH = 16;
        for (let ci = 0; ci < String(i).length; ci++) {
          const digit = String(i)[ci];
          const cx = wmX + ci * charW;
          const px: number[][] = [];
          for (let y = 0; y < wmH; y++) {
            const row: number[] = [];
            for (let x = 0; x < charW; x++) row.push(255 - grayAt(data, png.width, cx+x, wmY+y));
            px.push(row);
          }
          const scaled = scaleTo(px, charW, wmH, TPL_W, TPL_H);
          if (wmSamples.has(digit)) wmSamples.get(digit)!.push(scaled);
        }
      }

      // Re-render with detected watermark
      const reBoard = BoardState.fromOCR(reOcr);
      const reRendered = await renderer.renderResult(reBoard);
      writeFileSync(join(OUT2, `${i}.png`), reRendered);

      if (wmOk) { pass++; process.stdout.write(`OK wm="${reOcr.watermark}"\n`); }
      else { fail++; process.stdout.write(`FAIL wm="${reOcr.watermark}" (expected "${i}")\n`); }
    } catch (e: any) {
      fail++;
      process.stdout.write(`ERR ${e.message}\n`);
    }
  }

  console.log(`\n水印闭环: ${pass}/${pass+fail} 正确`);

  // Save new watermark samples
  if (fail > 0) {
    const TPL_DIR = join(__dirname, "..", "templates");
    let added = 0;
    for (let d = 0; d <= 9; d++) {
      const samples = wmSamples.get(String(d))!;
      if (samples.length === 0) continue;
      const path = join(TPL_DIR, `wm_${d}.json`);
      const old = existsSync(path) ? JSON.parse(readFileSync(path, "utf-8")) : { pixels: [], darkCount: 0, w: TPL_W, h: TPL_H };
      const allPx = (old.samples || [{ pixels: old.pixels }]).map((s: any) => s.pixels);
      allPx.push(...samples);
      // Average
      const avg: number[][] = [];
      let dc = 0;
      for (let y = 0; y < TPL_H; y++) {
        const row: number[] = [];
        for (let x = 0; x < TPL_W; x++) {
          let sum = 0; for (const s of allPx) sum += s[y]?.[x] ?? 0;
          const v = Math.round(sum / allPx.length);
          row.push(v); if (v > 128) dc++;
        }
        avg.push(row);
      }
      writeFileSync(path, JSON.stringify({ digit: d, w: TPL_W, h: TPL_H, pixels: avg, darkCount: dc, sampleCount: allPx.length }));
      added += samples.length;
    }
    if (added > 0) console.log(`水印模板新增 ${added} 样本`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
