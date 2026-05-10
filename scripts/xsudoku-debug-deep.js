/**
 * 双任务：
 * A) 手写模板对 images/1-40.png 的识别测试
 * B) Xsudoku #11 D5/D8 的 4↔8 像素级诊断
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const IMAGES_DIR = join(__dirname, "..", "..", "..", "images");
const XSUDOKU_DIR = join(IMAGES_DIR, "Xsudoku");
const TEMPLATE_DIR = join(__dirname, "..", "templates");
const OUT_DIR = join(__dirname, "..", "debug-output");

const A = ["006002800080600270025000061604070032200304700030201900042080600160925007000006020","005070080030504100000308057500000090080406510004005008056003041140050600070641005","010073005005009130309156870050690700000708050002345001037560200006007510500900007","002005090000800004080000200006000905090001003230000780008506070000400009060070300","043009100816037009097100080734910026625370910981060700350001000460700001179040000","600009005020536047005100609007900513080300974300400286000603751000701490000090360","700208005020050070000000200308010062200805731070320800030070010007590306600183407","310420600020009010009001002032094801080270030040138200070853926203940100098012040","726894315590106000081520000100602450048050100050401000015068020060310500800245001","002068040306020008890070620060490872980002406020086010630249085008600200209810060","813406902570120004402003010925341786104207080080045201600004120008010000001700000","704100069030600407096070023017060030460700001309010746641087390978306004253941678","000197082802050079070020400000900000006005730500030004400500200020089047000000060","034705000728614009600023400800070000370008002002030800263047001497001060581300704","010300040030009200700000038042090070000720400087134092000057010401083020009200300","003800400600400003040030009004000930932018004567943218458200391206380745370004862","140007090002930147907041006001000904058409710409013085700100400090304001014802000","010090703009007010000005490000250009020700000600080070200400307070508000001070050","203007500780563204450200370530920040024005900697834125902050400305009002040302059","060004082002803675500672904006738000000900008000020700900267843003089007070305200","620079103000100060001306500100687009039215706006493015000000001900031050018000000","007006000500010600601205000106030028800652100002108006305860200214593867068020030","120060000006100009400008010200000400004050923090234071051003007000600130300010090","402695308000708025850200009200901080060800092908402500500380206080526900623109850","003008600400000358050300009002090013900003086030004097000005060006200805085060004","210460900408190006396070140001009004640210000509604017004001300100040000000006401","038006020014023000692500003853069000921300006467218359280004030049600005070000400","302090508005328040089500230820900074003481625004000890007600480000839702008040050","500678210008419075071253480107806530800105790050147108400702801010084007780501940","000800540400630208080004000804070350500008907060350824000002700600000005070010002","641208900700040008890071046270800401164723895080014700028460000416007080907182604","005000001090170052102053006051300249040521003200004510060019025027635104510040000","000100002021000038800027100003890050080040300100006084200010060010004800050600013","020493008053708640480006030340079086005800304008304000530940867804037900070085403","010786400408905070907104000004697020000841000070352046700209004002408300040503010","500060079098107056070003800000004060730200001009001000000000008980000020010080700","103570000058103070796284513030407050579018042600725700900000080007002400060000000","120089674004016002000402510401053200002048156500201340010807420700124000248095701","204500003358040720006002450402007500005900042080254376503781204047020005820405007","000000001080200600006010020050006040004950062600300100300800010040007009005090000"];

// ── Utils ──
function ga(d,w,x,y){const i=(Math.round(y)*w+Math.round(x))*4;return Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);}
function rd(d,w,y,th){let c=0;const rs=Math.round(y)*w*4;for(let x=0;x<w;x++){const i=rs+x*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function cd(d,w,h,x,th){let c=0;for(let y=0;y<h;y++){const i=y*w*4+Math.round(x)*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function dgl(d,w,h){const dt=100;function fe(s,fs){const th=0.08;const ix=fs?Array.from({length:s.length},(_,i)=>i):Array.from({length:s.length},(_,i)=>s.length-1-i);let pp=null,ps=0;for(const i of ix){if(s[i].score>th){if(s[i].score>ps){ps=s[i].score;pp=s[i].pos;}}else if(pp!==null)return pp;}return pp;}function lfb(s,e){const sp=e-s;return Array.from({length:10},(_,i)=>Math.round(s+i*sp/9));}const rs=Array.from({length:h},(_,y)=>({pos:y,score:rd(d,w,y,dt)/w}));const tb=fe(rs,true),bb=fe(rs,false);let hl=(tb!=null&&bb!=null&&bb-tb>h*0.45)?lfb(tb,bb):Array.from({length:10},(_,i)=>Math.round((i/9)*(h-1)));const cs=Array.from({length:w},(_,x)=>({pos:x,score:cd(d,w,h,x,dt)/h}));const lb=fe(cs,true),rb=fe(cs,false);let vl=(lb!=null&&rb!=null&&rb-lb>w*0.45)?lfb(lb,rb):Array.from({length:10},(_,i)=>Math.round((i/9)*(w-1)));return{horizontal:hl,vertical:vl};}
function ec(d,w,x1,y1,x2,y2){const pw=Math.round(x2-x1),ph=Math.round(y2-y1);const px=[];for(let y=0;y<ph;y++){const row=[];for(let x=0;x<pw;x++)row.push(255-ga(d,w,Math.round(x1+x),Math.round(y1+y)));px.push(row);}return{pixels:px,w:pw,h:ph};}
function scaleTo(input,inW,inH,outW,outH){const out=[];for(let y=0;y<outH;y++){const row=[],srcY=(y/outH)*inH,y0=Math.floor(srcY),y1=Math.min(y0+1,inH-1),yF=srcY-y0;for(let x=0;x<outW;x++){const srcX=(x/outW)*inW,x0=Math.floor(srcX),x1=Math.min(x0+1,inW-1),xF=srcX-x0;const v00=input[y0]?.[x0]??0,v10=input[y0]?.[x1]??0,v01=input[y1]?.[x0]??0,v11=input[y1]?.[x1]??0;row.push((v00*(1-xF)+v10*xF)*(1-yF)+(v01*(1-xF)+v11*xF)*yF);}out.push(row);}return out;}
function ncc(input,tpl){if(!tpl.pixels||tpl.pixels.length===0)return 0;const tH=tpl.h,tW=tpl.w,iH=input.length,iW=input[0]?.length||0;if(iH===0||iW===0)return 0;const scaled=scaleTo(input,iW,iH,tW,tH);let iSum=0;for(let y=0;y<tH;y++)for(let x=0;x<tW;x++)iSum+=scaled[y][x];const iMean=iSum/(tW*tH);let num=0,dI=0,dT=0;const tMean=tpl.mean||0;for(let y=0;y<tH;y++){for(let x=0;x<tW;x++){const iD=scaled[y][x]-iMean,tD=tpl.pixels[y][x]-tMean;num+=iD*tD;dI+=iD*iD;dT+=tD*tD;}}const denom=Math.sqrt(dI*dT);if(denom<1e-6)return 0;return num/denom;}

function loadTemplates(prefix) {
  const tc = [];
  for (let d = 1; d <= 9; d++) {
    try {
      const raw = JSON.parse(readFileSync(join(TEMPLATE_DIR, prefix + d + ".json"), "utf-8"));
      const entries = raw.samples || [{ pixels: raw.pixels, darkCount: raw.darkCount || 0 }];
      for (const e of entries) {
        let sum = 0, n = 0;
        for (const row of e.pixels) for (const v of row) { sum += v; n++; }
        tc.push({ digit: d, w: raw.w, h: raw.h, pixels: e.pixels, mean: n > 0 ? sum / n : 0 });
      }
    } catch (e) { /* skip */ }
  }
  return tc;
}

// ═══════════════════════════════════════════════════════════════
// A) 手写模板对 images/1-40.png 测试
// ═══════════════════════════════════════════════════════════════
function testHandwritten() {
  console.log("=== A) 手写模板 (big) 对 images/1-40.png 测试 ===\n");

  const bigTemplates = loadTemplates("big_");
  console.log("手写模板: " + bigTemplates.length + " samples");

  // First check image dimensions
  const testImg = join(IMAGES_DIR, "1.png");
  const png = PNG.sync.read(readFileSync(testImg));
  console.log("images/1.png 尺寸: " + png.width + "x" + png.height + "\n");

  for (const THR of [0.55, 0.60, 0.65, 0.70]) {
    let correct = 0, missed = 0, wrong = 0, fp = 0;
    const errors = [];

    for (let pi = 0; pi < 40; pi++) {
      const pn = pi + 1, answer = A[pi];
      const imgPath = join(IMAGES_DIR, pn + ".png");
      let data, w, h;
      try {
        const p = PNG.sync.read(readFileSync(imgPath));
        data = p.data; w = p.width; h = p.height;
      } catch (e) { console.log("  ⚠ #" + pn + " read error: " + e.message); continue; }

      const grid = dgl(data, w, h);
      const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const solutionDigit = parseInt(answer[r * 9 + c], 10);
          const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
          const cw = x2 - x1, ch = y2 - y1;
          if (cw < 5 || ch < 5) continue;
          const inset = Math.max(2, cw * 0.10);
          const { pixels } = ec(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
          const bw = Math.round(x2 - x1 - 2 * inset), bh = Math.round(y2 - y1 - 2 * inset);

          let mv = 0;
          for (const row of pixels) for (const v of row) if (v > mv) mv = v;
          let got = 0;
          if (mv >= 30 && bw >= 5 && bh >= 5) {
            let bs = -Infinity, bd = 0;
            for (const tp of bigTemplates) {
              const sc = ncc(pixels, tp);
              if (sc > bs) { bs = sc; bd = tp.digit; }
            }
            if ((bs + 1) / 2 > THR) got = bd;
          }

          const hasBigDigit = mv >= 30;
          if (!hasBigDigit && got === 0) correct++;
          else if (hasBigDigit && got === solutionDigit) correct++;
          else {
            if (hasBigDigit && got === 0) missed++;
            else if (!hasBigDigit && got !== 0) fp++;
            else if (hasBigDigit && got !== solutionDigit) { wrong++; errors.push({ puzzle: pn, cell: String.fromCharCode(65 + r) + (c + 1), expected: solutionDigit, got }); }
          }
        }
      }
    }

    const total = 40 * 81;
    const acc = (correct / total * 100).toFixed(2);
    let st = [];
    if (missed) st.push("漏识" + missed);
    if (wrong) st.push("错识" + wrong);
    if (fp) st.push("误报" + fp);
    console.log("  阈值" + THR.toFixed(2) + ": " + acc + "% " + (st.length ? st.join(",") : ""));

    if (errors.length > 0 && errors.length <= 10) {
      for (const e of errors) console.log("    #" + e.puzzle + " " + e.cell + ": " + e.expected + "→" + e.got);
    } else if (errors.length > 10) {
      console.log("    (前10个)");
      for (const e of errors.slice(0, 10)) console.log("    #" + e.puzzle + " " + e.cell + ": " + e.expected + "→" + e.got);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// B) Xsudoku #11 D5/D8 深度诊断
// ═══════════════════════════════════════════════════════════════
function debugXsudoku11() {
  console.log("\n=== B) Xsudoku #11 D5/D8 像素诊断 ===\n");

  const xsudokuTemplates = loadTemplates("xsudoku_");
  const tpl4 = xsudokuTemplates.filter(t => t.digit === 4);
  const tpl8 = xsudokuTemplates.filter(t => t.digit === 8);
  console.log("4模板: " + tpl4.length + " samples, 8模板: " + tpl8.length + " samples");

  // Extract #11 D5 and D8
  const buf11 = readFileSync(join(XSUDOKU_DIR, "11.png"));
  const p11 = PNG.sync.read(buf11);
  const { data: d11, width: w11, height: h11 } = p11;
  const grid11 = dgl(d11, w11, h11);
  const hL11 = grid11.horizontal.slice(0, 10), vL11 = grid11.vertical.slice(0, 10);

  // Also extract a known-good 4 and 8 from other puzzles for comparison
  // Use puzzle #19 which has many correctly recognized digits

  const testCells = [
    { puzzle: 11, row: 3, col: 4, label: "#11 D5 (应=4, 识别=8)" },
    { puzzle: 11, row: 3, col: 7, label: "#11 D8 (应=8, 识别=4)" },
  ];

  // Find reference 4 and 8 cells from puzzle #19
  const answer19 = A[18]; // puzzle 19
  const buf19 = readFileSync(join(XSUDOKU_DIR, "19.png"));
  const p19 = PNG.sync.read(buf19);
  const { data: d19, width: w19, height: h19 } = p19;
  const grid19 = dgl(d19, w19, h19);
  const hL19 = grid19.horizontal.slice(0, 10), vL19 = grid19.vertical.slice(0, 10);

  // Find a correctly-recognized 4 in #19
  let ref4 = null, ref8 = null;
  for (let r = 0; r < 9 && (!ref4 || !ref8); r++) {
    for (let c = 0; c < 9 && (!ref4 || !ref8); c++) {
      const d = parseInt(answer19[r * 9 + c], 10);
      if (d === 4 && !ref4) ref4 = { puzzle: 19, row: r, col: c };
      if (d === 8 && !ref8) ref8 = { puzzle: 19, row: r, col: c };
    }
  }

  if (ref4) testCells.push({ ...ref4, label: "#19 " + String.fromCharCode(65 + ref4.row) + (ref4.col + 1) + " (正确4)" });
  if (ref8) testCells.push({ ...ref8, label: "#19 " + String.fromCharCode(65 + ref8.row) + (ref8.col + 1) + " (正确8)" });

  // For each test cell, show NCC scores vs ALL xsudoku templates
  for (const tc of testCells) {
    const buf = tc.puzzle === 11 ? buf11 : buf19;
    const p = PNG.sync.read(buf);
    const { data, width: w, height: h } = p;
    const grid = tc.puzzle === 11 ? grid11 : grid19;
    const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

    const x1 = vL[tc.col], y1 = hL[tc.row], x2 = vL[tc.col + 1], y2 = hL[tc.row + 1];
    const cw = x2 - x1, ch = y2 - y1;
    const inset = Math.max(2, cw * 0.10);
    const { pixels } = ec(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);

    let mv = 0;
    for (const row of pixels) for (const v of row) if (v > mv) mv = v;

    console.log("\n" + tc.label + ":");
    console.log("  格子位置: (" + Math.round(x1) + "," + Math.round(y1) + ")-(" + Math.round(x2) + "," + Math.round(y2) + "), size=" + cw.toFixed(1) + "x" + ch.toFixed(1));
    console.log("  maxVal=" + mv);

    // Score vs each digit template
    const scores = [];
    for (let d = 1; d <= 9; d++) {
      const tpls = xsudokuTemplates.filter(t => t.digit === d);
      let bestSc = -Infinity;
      for (const tpl of tpls) {
        const sc = ncc(pixels, tpl);
        if (sc > bestSc) bestSc = sc;
      }
      scores.push({ digit: d, ncc: bestSc, conf: (bestSc + 1) / 2 });
    }
    scores.sort((a, b) => b.ncc - a.ncc);
    console.log("  NCC 得分 (前5):");
    for (const s of scores.slice(0, 5)) {
      const marker = (s.digit === 4 || s.digit === 8) ? " ←" : "";
      console.log("    数字" + s.digit + ": ncc=" + s.ncc.toFixed(4) + " conf=" + s.conf.toFixed(4) + marker);
    }

    // Also compare 4 vs 8 margin
    const score4 = scores.find(s => s.digit === 4).ncc;
    const score8 = scores.find(s => s.digit === 8).ncc;
    console.log("  4 vs 8 margin: " + (score4 - score8).toFixed(4) + " (正=偏4, 负=偏8)");
  }

  // Now compare: the #11 D5 pixel array vs the mean 4 template pixel array
  // Calculate pixel-by-pixel absolute difference
  console.log("\n\n=== 像素级差异分析 ===");
  for (const tc of testCells.slice(0, 2)) {
    const buf = tc.puzzle === 11 ? buf11 : buf19;
    const p = PNG.sync.read(buf);
    const { data, width: w, height: h } = p;
    const grid = tc.puzzle === 11 ? grid11 : grid19;
    const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

    const x1 = vL[tc.col], y1 = hL[tc.row], x2 = vL[tc.col + 1], y2 = hL[tc.row + 1];
    const cw = x2 - x1, ch = y2 - y1;
    const inset = Math.max(2, cw * 0.10);
    const { pixels } = ec(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);

    // Scale to template size
    const expectedDigit = tc.label.includes("(应=4)") ? 4 : 8;
    const tpl = xsudokuTemplates.find(t => t.digit === expectedDigit);
    const scaled = scaleTo(pixels, pixels[0]?.length || 0, pixels.length, tpl.w, tpl.h);

    // Compute absolute diff per pixel
    let totalDiff = 0, maxDiff = 0;
    for (let y = 0; y < tpl.h; y++) {
      for (let x = 0; x < tpl.w; x++) {
        const diff = Math.abs(scaled[y][x] - tpl.pixels[y][x]);
        totalDiff += diff;
        if (diff > maxDiff) maxDiff = diff;
      }
    }
    const avgDiff = totalDiff / (tpl.w * tpl.h);
    console.log("\n" + tc.label + " vs 数字" + expectedDigit + "模板:");
    console.log("  平均像素差: " + avgDiff.toFixed(1) + " (范围 0-255)");
    console.log("  最大像素差: " + maxDiff.toFixed(1));

    // Compare vs the OTHER digit's template
    const otherDigit = expectedDigit === 4 ? 8 : 4;
    const otherTpl = xsudokuTemplates.find(t => t.digit === otherDigit);
    const scaled2 = scaleTo(pixels, pixels[0]?.length || 0, pixels.length, otherTpl.w, otherTpl.h);
    let totalDiff2 = 0;
    for (let y = 0; y < otherTpl.h; y++) {
      for (let x = 0; x < otherTpl.w; x++) {
        totalDiff2 += Math.abs(scaled2[y][x] - otherTpl.pixels[y][x]);
      }
    }
    console.log("  vs 数字" + otherDigit + "模板 平均像素差: " + (totalDiff2 / (otherTpl.w * otherTpl.h)).toFixed(1));
  }
}

// ═══════════════════════════════════════════════════════════════
function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  testHandwritten();
  debugXsudoku11();
}

main();
