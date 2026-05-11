/**
 * 字体模板批量生成脚本
 *
 * 流程:
 *   Phase 1: OCR images/1-40 → 用目标字体渲染 → 输出 jianku/{font}/pass1/
 *   Phase 2: OCR pass1 图片 → 用微软雅黑渲染 → 输出 jianku/{font}/pass2/
 *           同时提取像素样本 → 构建 mean 模板 → 阈值扫描 → 验证 100%
 *
 * 用法:
 *   npx ts-node scripts/gen-font-templates.ts <字体文件路径> <字体注册名> <模板前缀>
 *
 * 示例:
 *   npx ts-node scripts/gen-font-templates.ts C:/Windows/Fonts/simhei.ttf SimHei simhei
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { recognizeBoard, extractGrayscale, detectGridLines } from "../src/ocr";
import { BoardState } from "../src/board";
import { SudokuRenderer, NativeCanvas } from "../src/renderer";

// ═══════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════
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

const IMAGES_DIR = join(__dirname, "..", "..", "..", "images");
const JIANKU_DIR = join(IMAGES_DIR, "jianku");
const TEMPLATE_DIR = join(__dirname, "..", "templates");

// ═══════════════════════════════════════════════════════════════
// Utilities (inline copy to keep script self-contained)
// ═══════════════════════════════════════════════════════════════
function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function extractCellGrayscale(data: Uint8Array, imgW: number, x1: number, y1: number, x2: number, y2: number) {
  const w = Math.round(x2 - x1), h = Math.round(y2 - y1);
  const pixels: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      row.push(255 - grayAt(data, imgW, Math.round(x1 + x), Math.round(y1 + y)));
    }
    pixels.push(row);
  }
  return { pixels, w, h };
}

function scaleTo(input: number[][], inW: number, inH: number, outW: number, outH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < outH; y++) {
    const row: number[] = [], srcY = (y / outH) * inH, y0 = Math.floor(srcY), y1 = Math.min(y0 + 1, inH - 1), yF = srcY - y0;
    for (let x = 0; x < outW; x++) {
      const srcX = (x / outW) * inW, x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, inW - 1), xF = srcX - x0;
      const v00 = input[y0]?.[x0] ?? 0, v10 = input[y0]?.[x1] ?? 0, v01 = input[y1]?.[x0] ?? 0, v11 = input[y1]?.[x1] ?? 0;
      row.push((v00 * (1 - xF) + v10 * xF) * (1 - yF) + (v01 * (1 - xF) + v11 * xF) * yF);
    }
    out.push(row);
  }
  return out;
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
  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < tW; x++) {
      const iD = scaled[y][x] - iMean, tD = tpl.pixels[y][x] - tMean;
      num += iD * tD; dI += iD * iD; dT += tD * tD;
    }
  }
  const denom = Math.sqrt(dI * dT);
  if (denom < 1e-6) return 0;
  return num / denom;
}

function readPNG(path: string) {
  const { PNG } = require("pngjs");
  return PNG.sync.read(readFileSync(path));
}

function findImageFile(dir: string, num: number): string | null {
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const p = join(dir, `${num}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log("用法: npx ts-node scripts/gen-font-templates.ts <字体文件路径> <字体注册名> <模板前缀>");
    console.log("示例: npx ts-node scripts/gen-font-templates.ts C:/Windows/Fonts/simhei.ttf SimHei simhei");
    process.exit(1);
  }

  const [fontPath, fontName, fontPrefix] = args;
  const fontDir = join(JIANKU_DIR, fontPrefix);
  const pass1Dir = join(fontDir, "pass1");
  const pass2Dir = join(fontDir, "pass2");

  mkdirSync(pass1Dir, { recursive: true });
  mkdirSync(pass2Dir, { recursive: true });

  // ── 注册目标字体 ──
  if (!existsSync(fontPath)) {
    console.error(`字体文件不存在: ${fontPath}`);
    process.exit(1);
  }
  const nc = NativeCanvas;
  const gf = nc?.GlobalFonts;
  if (gf && typeof gf.registerFromPath === "function") {
    try {
      gf.registerFromPath(fontPath);
      console.log(`✓ 已注册字体: ${fontName} (${fontPath})`);
    } catch (e: any) {
      console.error(`注册字体失败: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error("Canvas GlobalFonts 不可用");
    process.exit(1);
  }

  // ── 创建 Renderer ──
  const mockCtx = {
    logger: (name: string) => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx as any);

  // ═══════════════════════════════════════════════════════════
  // Phase 1: 用答案直接渲染完整盘面为字体A (获取最大训练样本)
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 1: 答案 → 完整盘面用目标字体渲染 ===\n");

  for (let i = 1; i <= 40; i++) {
    const answer = ANSWERS[i - 1];
    // Build a full board from the answer (all cells as "givens")
    const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates: Set<number>[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>())
    );
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = parseInt(answer[r * 9 + c], 10);
        if (v > 0) {
          givens[r][c] = v;
          candidates[r][c] = new Set([v]);
        }
      }
    }
    const board = new BoardState(givens, deduced, candidates);

    const resultBuf = await renderer.render(board, {
      showCandidates: false,  // No candidates needed for training
      fontFamily: fontName,
    });
    writeFileSync(join(pass1Dir, `${i}.png`), resultBuf);

    const count = givens.flat().filter(v => v > 0).length;
    console.log(`  题${i}: ${count} 大数字 → pass1/${i}.png`);
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 2: OCR pass1 → 用微软雅黑渲染 + 提取样本
  // 自渲染图格线位置精确已知: padding=24, cell=100
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 2: OCR pass1 → 微软雅黑渲染 + 收集样本 ===\n");

  const PAD = 24, CS = 100;
  const samplesByDigit: Record<number, number[][][]> = {};
  for (let d = 1; d <= 9; d++) samplesByDigit[d] = [];

  for (let i = 1; i <= 40; i++) {
    const pass1Path = join(pass1Dir, `${i}.png`);
    if (!existsSync(pass1Path)) { console.log(`  ⚠ 题${i}: pass1 图片不存在`); continue; }

    const buf = readFileSync(pass1Path);
    const png = readPNG(pass1Path);
    const data = png.data as Uint8Array;
    const imgW = png.width, imgH = png.height;

    const ocrResult = await recognizeBoard(buf);
    const board = BoardState.fromOCR(ocrResult);

    // Render with Microsoft YaHei
    const resultBuf = await renderer.render(board, {
      showCandidates: true,
      fontFamily: "Microsoft YaHei",
    });
    writeFileSync(join(pass2Dir, `${i}.png`), resultBuf);

    // 使用精确格线位置提取样本（自渲染图，无需网格检测）
    const answer = ANSWERS[i - 1];
    const inset = Math.max(2, CS * 0.10);
    let sampleCount = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const expectedDigit = parseInt(answer[r * 9 + c], 10);
        if (expectedDigit === 0) continue;

        const x1 = PAD + c * CS, y1 = PAD + r * CS;
        const x2 = x1 + CS, y2 = y1 + CS;
        const { pixels } = extractCellGrayscale(data, imgW, x1 + inset, y1 + inset, x2 - inset, y2 - inset);

        let maxVal = 0;
        for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
        if (maxVal < 30) continue;

        samplesByDigit[expectedDigit].push(pixels);
        sampleCount++;
      }
    }

    const givens = board.givens.flat().filter(v => v > 0).length;
    const deduced = board.deduced.flat().filter(v => v > 0).length;
    console.log(`  题${i}: ${givens}G ${deduced}D, ${sampleCount}样本 → pass2/${i}.png`);
  }

  // ═══════════════════════════════════════════════════════════
  // Phase 3: 构建多样本模板 (5 独立样本 + mean)
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 3: 构建模板 ===\n");

  const N_SAMPLES = 5;
  const templates: Record<number, { w: number; h: number; pixels: number[][]; darkCount: number; mean: number; samples: Array<{ pixels: number[][]; darkCount: number }> }> = {};

  for (let d = 1; d <= 9; d++) {
    const samples = samplesByDigit[d];
    console.log(`  数字${d}: ${samples.length} 样本`);
    if (samples.length === 0) continue;

    // Find most common size
    const sizeMap: Record<string, number> = {};
    for (const s of samples) { const k = `${s.length}x${s[0]?.length || 0}`; sizeMap[k] = (sizeMap[k] || 0) + 1; }
    let bestSize = "", bestCount = 0;
    for (const [k, n] of Object.entries(sizeMap)) if (n > bestCount) { bestCount = n; bestSize = k; }
    const [th, tw] = bestSize.split("x").map(Number);

    // Normalize all
    const norm: number[][][] = [];
    for (const s of samples) {
      const sh = s.length, sw = s[0]?.length || 0;
      if (sh === th && sw === tw) norm.push(s);
      else norm.push(scaleTo(s, sw, sh, tw, th));
    }

    // Mean
    const mean: number[][] = [];
    for (let y = 0; y < th; y++) {
      mean[y] = [];
      for (let x = 0; x < tw; x++) {
        let sum = 0;
        for (const np of norm) sum += np[y][x];
        mean[y][x] = Math.round(sum / norm.length);
      }
    }

    let darkCount = 0, totalSum = 0;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      if (mean[y][x] > 128) darkCount++;
      totalSum += mean[y][x];
    }
    const tMean = totalSum / (tw * th);

    // Select N diverse individual samples
    const scored: Array<{ idx: number; dist: number }> = norm.map((np, i) => {
      let diff = 0;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) diff += (np[y][x] - mean[y][x]) ** 2;
      return { idx: i, dist: diff };
    });
    scored.sort((a, b) => a.dist - b.dist);

    const selectedIdx = new Set<number>();
    selectedIdx.add(scored[Math.floor(scored.length / 2)].idx); // median
    const step = Math.max(1, Math.floor(scored.length / (N_SAMPLES - 1)));
    for (let si = 0; si < N_SAMPLES - 1 && selectedIdx.size < N_SAMPLES; si++) {
      selectedIdx.add(scored[Math.min(si * step, scored.length - 1)].idx);
    }

    const sampleEntries = [...selectedIdx].map(idx => {
      const p = norm[idx];
      let dc = 0;
      for (const row of p) for (const v of row) if (v > 128) dc++;
      return { pixels: p, darkCount: dc };
    });

    templates[d] = { w: tw, h: th, pixels: mean, darkCount, mean: tMean, samples: sampleEntries };
    console.log(`    → ${tw}x${th}, ${sampleEntries.length} samples, darkCount=${darkCount}`);
  }

  // Write templates
  for (let d = 1; d <= 9; d++) {
    if (!templates[d]) continue;
    const t = templates[d];
    writeFileSync(join(TEMPLATE_DIR, `${fontPrefix}_${d}.json`), JSON.stringify({
      w: t.w, h: t.h,
      pixels: t.pixels,
      darkCount: t.darkCount,
      samples: t.samples,
    }, null, 2));
  }
  console.log(`\n模板已保存: templates/${fontPrefix}_*.json`);

  // ═══════════════════════════════════════════════════════════
  // Phase 4: 独立验证 + 阈值扫描
  // ═══════════════════════════════════════════════════════════
  console.log("\n=== Phase 4: 阈值扫描 ===\n");

  const tplCache: Array<{ digit: number; w: number; h: number; pixels: number[][]; mean: number }> = [];
  for (let d = 1; d <= 9; d++) {
    if (!templates[d]) continue;
    for (const s of templates[d].samples) {
      let sum = 0, n = 0;
      for (const row of s.pixels) for (const v of row) { sum += v; n++; }
      tplCache.push({ digit: d, w: templates[d].w, h: templates[d].h, pixels: s.pixels, mean: sum / n });
    }
  }

  for (const THR of [0.60, 0.62, 0.63, 0.64, 0.65, 0.66, 0.67, 0.68, 0.70]) {
    let correct = 0, missed = 0, wrong = 0, fp = 0;
    const inset = Math.max(2, CS * 0.10);

    for (let i = 1; i <= 40; i++) {
      const pass1Path = join(pass1Dir, `${i}.png`);
      if (!existsSync(pass1Path)) continue;
      const png = readPNG(pass1Path);
      const data = png.data as Uint8Array;
      const imgW = png.width, imgH = png.height;
      const answer = ANSWERS[i - 1];

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const solutionDigit = parseInt(answer[r * 9 + c], 10);
          const x1 = PAD + c * CS, y1 = PAD + r * CS;
          const x2 = x1 + CS, y2 = y1 + CS;
          const { pixels } = extractCellGrayscale(data, imgW, x1 + inset, y1 + inset, x2 - inset, y2 - inset);

          let maxVal = 0;
          for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
          let got = 0;
          if (maxVal >= 30) {
            let bs = -Infinity, bd = 0;
            for (const tp of tplCache) {
              const sc = ncc(pixels, tp);
              if (sc > bs) { bs = sc; bd = tp.digit; }
            }
            if ((bs + 1) / 2 > THR) got = bd;
          }

          const hasBigDigit = maxVal >= 30;
          if (!hasBigDigit && got === 0) correct++;
          else if (hasBigDigit && got === solutionDigit) correct++;
          else {
            if (hasBigDigit && got === 0) missed++;
            else if (!hasBigDigit && got !== 0) fp++;
            else wrong++;
          }
        }
      }
    }

    const total = 40 * 81;
    const acc = (correct / total * 100).toFixed(2);
    let st = "";
    if (missed) st += ` 漏识${missed}`;
    if (wrong) st += ` 错识${wrong}`;
    if (fp) st += ` 误报${fp}`;
    if (!st) st = " ✓ 完美";
    console.log(`  阈值${THR.toFixed(2)}: ${acc}%${st}`);
  }

  console.log(`\n=== 完成: ${fontPrefix} ===`);
  console.log(`  pass1: ${pass1Dir}`);
  console.log(`  pass2: ${pass2Dir}`);
  console.log(`  模板: templates/${fontPrefix}_*.json`);
}

main().catch(console.error);
