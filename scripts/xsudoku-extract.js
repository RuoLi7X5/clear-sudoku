/**
 * Xsudoku 模板提取 - 直接从已知答案中提取每个数字的一个干净样本
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
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

function decodePNG(buf) { return PNG.sync.read(buf); }
function grayAt(data, imgW, x, y) {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}
function rowDarkness(data, imgW, y, th) {
  let c = 0; const rs = Math.round(y) * imgW * 4;
  for (let x = 0; x < imgW; x++) {
    const idx = rs + x * 4;
    if (Math.round(0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2]) < th) c++;
  }
  return c;
}
function colDarkness(data, imgW, imgH, x, th) {
  let c = 0;
  for (let y = 0; y < imgH; y++) {
    const idx = y*imgW*4 + Math.round(x)*4;
    if (Math.round(0.299*data[idx]+0.587*data[idx+1]+0.114*data[idx+2]) < th) c++;
  }
  return c;
}

function detectGridLines(data, imgW, imgH) {
  const dt = 100;
  function findEdge(scores, fromStart) {
    const th = 0.08;
    const idxs = fromStart
      ? Array.from({length:scores.length},(_,i)=>i)
      : Array.from({length:scores.length},(_,i)=>scores.length-1-i);
    let pp = null, ps = 0;
    for (const i of idxs) {
      if (scores[i].score > th) {
        if (scores[i].score > ps) { ps = scores[i].score; pp = scores[i].pos; }
      } else if (pp !== null) return pp;
    }
    return pp;
  }
  function linesFromBorder(s, e) {
    const span = e - s;
    return Array.from({length:10}, (_,i) => Math.round(s + i*span/9));
  }

  const rs = Array.from({length:imgH}, (_,y) => ({
    pos: y, score: rowDarkness(data,imgW,y,dt)/imgW
  }));
  const tb = findEdge(rs, true), bb = findEdge(rs, false);
  let h = (tb!=null && bb!=null && bb-tb > imgH*0.45)
    ? linesFromBorder(tb, bb)
    : Array.from({length:10}, (_,i) => Math.round((i/9)*(imgH-1)));

  const cs = Array.from({length:imgW}, (_,x) => ({
    pos: x, score: colDarkness(data,imgW,imgH,x,dt)/imgH
  }));
  const lb = findEdge(cs, true), rb = findEdge(cs, false);
  let v = (lb!=null && rb!=null && rb-lb > imgW*0.45)
    ? linesFromBorder(lb, rb)
    : Array.from({length:10}, (_,i) => Math.round((i/9)*(imgW-1)));

  return {horizontal:h, vertical:v};
}

function extractCellGrayscale(data, imgW, x1, y1, x2, y2) {
  const w = Math.round(x2-x1), h = Math.round(y2-y1);
  const pixels = [];
  for (let y=0; y<h; y++) {
    const row = [];
    for (let x=0; x<w; x++) {
      row.push(255 - grayAt(data, imgW, Math.round(x1+x), Math.round(y1+y)));
    }
    pixels.push(row);
  }
  return {pixels, w, h};
}

// ═════════════════════════════════════════
// Main
// ═════════════════════════════════════════

function main() {
  mkdirSync(TEMPLATE_DIR, {recursive:true});

  // Use puzzle 19 (100% accurate in previous test) as reference
  const REF_PUZZLE = 19;
  const buf = readFileSync(join(XSUDOKU_DIR, `${REF_PUZZLE}.png`));
  const png = decodePNG(buf);
  const {data, width:imgW, height:imgH} = png;
  const grid = detectGridLines(data, imgW, imgH);
  const hL = grid.horizontal.slice(0,10);
  const vL = grid.vertical.slice(0,10);

  console.log(`使用 puzzle #${REF_PUZZLE} 提取模板`);
  console.log(`格线: H[${hL.map(v=>Math.round(v)).join(",")}]`);
  console.log(`      V[${vL.map(v=>Math.round(v)).join(",")}]`);
  console.log(`cell≈${((vL[9]-vL[0])/9).toFixed(1)}x${((hL[9]-hL[0])/9).toFixed(1)}`);

  const answer = ANSWERS[REF_PUZZLE-1];

  for (let d = 1; d <= 9; d++) {
    // Find first cell with this digit
    let found = false;
    for (let r = 0; r < 9 && !found; r++) {
      for (let c = 0; c < 9 && !found; c++) {
        if (parseInt(answer[r*9+c], 10) !== d) continue;

        const x1 = vL[c], y1 = hL[r], x2 = vL[c+1], y2 = hL[r+1];
        const cw = x2-x1, ch = y2-y1;
        if (cw < 10 || ch < 10) continue;

        const inset = Math.max(2, cw * 0.10);
        const {pixels, w, h} = extractCellGrayscale(
          data, imgW, x1+inset, y1+inset, x2-inset, y2-inset
        );

        // Trim whitespace around the digit
        const trimmed = trimWhitespace(pixels, w, h);

        const darkCount = trimmed.pixels.reduce(
          (s, row) => s + row.reduce((ss, v) => ss + (v > 128 ? 1 : 0), 0), 0
        );

        // Write template
        const tpl = {
          w: trimmed.w,
          h: trimmed.h,
          pixels: trimmed.pixels,
          darkCount,
          samples: [{
            pixels: trimmed.pixels,
            darkCount,
          }],
        };

        const path = join(TEMPLATE_DIR, `xsudoku_${d}.json`);
        writeFileSync(path, JSON.stringify(tpl));
        console.log(`  xsudoku_${d}.json: ${trimmed.w}x${trimmed.h}, darkCount=${darkCount}, from ${String.fromCharCode(65+r)}${c+1}`);

        found = true;
      }
    }
    if (!found) console.log(`  ⚠ 数字${d}: 在puzzle#${REF_PUZZLE}中未找到!`);
  }

  console.log("\n完成!");
}

function trimWhitespace(pixels, w, h) {
  // Find content bounds
  let top = h, bottom = 0, left = w, right = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y][x] > 20) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top > bottom) return {pixels:[[]], w:1, h:1};

  // Add 1px padding
  top = Math.max(0, top - 1);
  bottom = Math.min(h - 1, bottom + 1);
  left = Math.max(0, left - 1);
  right = Math.min(w - 1, right + 1);

  const nw = right - left + 1, nh = bottom - top + 1;
  const result = [];
  for (let y = 0; y < nh; y++) {
    const row = [];
    for (let x = 0; x < nw; x++) {
      row.push(pixels[top + y][left + x]);
    }
    result.push(row);
  }
  return {pixels: result, w: nw, h: nh};
}

main();
