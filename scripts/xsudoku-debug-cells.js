/**
 * 诊断 4 个错误格：查看实际提取的像素和网格位置
 */
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");
const DEBUG_DIR = join(__dirname, "..", "xsudoku-debug-cells");

function ga(d,w,x,y){const i=(Math.round(y)*w+Math.round(x))*4;return Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);}
function rd(d,w,y,th){let c=0;const rs=Math.round(y)*w*4;for(let x=0;x<w;x++){const i=rs+x*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function cd(d,w,h,x,th){let c=0;for(let y=0;y<h;y++){const i=y*w*4+Math.round(x)*4;if(Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])<th)c++;}return c;}
function dgl(d,w,h){const dt=100;function fe(s,fs){const th=0.08;const ix=fs?Array.from({length:s.length},(_,i)=>i):Array.from({length:s.length},(_,i)=>s.length-1-i);let pp=null,ps=0;for(const i of ix){if(s[i].score>th){if(s[i].score>ps){ps=s[i].score;pp=s[i].pos;}}else if(pp!==null)return pp;}return pp;}function lfb(s,e){const sp=e-s;return Array.from({length:10},(_,i)=>Math.round(s+i*sp/9));}const rs=Array.from({length:h},(_,y)=>({pos:y,score:rd(d,w,y,dt)/w}));const tb=fe(rs,true),bb=fe(rs,false);let hl=(tb!=null&&bb!=null&&bb-tb>h*0.45)?lfb(tb,bb):Array.from({length:10},(_,i)=>Math.round((i/9)*(h-1)));const cs=Array.from({length:w},(_,x)=>({pos:x,score:cd(d,w,h,x,dt)/h}));const lb=fe(cs,true),rb=fe(cs,false);let vl=(lb!=null&&rb!=null&&rb-lb>w*0.45)?lfb(lb,rb):Array.from({length:10},(_,i)=>Math.round((i/9)*(w-1)));return{horizontal:hl,vertical:vl};}
function ec(d,w,x1,y1,x2,y2){const pw=Math.round(x2-x1),ph=Math.round(y2-y1);const px=[];for(let y=0;y<ph;y++){const row=[];for(let x=0;x<pw;x++)row.push(255-ga(d,w,Math.round(x1+x),Math.round(y1+y)));px.push(row);}return{pixels:px,w:pw,h:ph};}

// Check all 4 errors
const checks = [
  { puzzle: 11, row: 3, col: 4, expected: 4 },
  { puzzle: 11, row: 3, col: 7, expected: 8 },
  { puzzle: 29, row: 5, col: 3, expected: 1 },
  { puzzle: 37, row: 5, col: 3, expected: 7 },
];

// Also check a known-good cell for comparison
checks.push({ puzzle: 19, row: 0, col: 0, expected: 2 }); // known good

mkdirSync(DEBUG_DIR, { recursive: true });

for (const ch of checks) {
  const buf = readFileSync(join(XSUDOKU_DIR, ch.puzzle + ".png"));
  const png = PNG.sync.read(buf);
  const { data, width: w, height: h } = png;
  const grid = dgl(data, w, h);
  const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

  const cell = String.fromCharCode(65 + ch.row) + (ch.col + 1);
  console.log("\n=== #" + ch.puzzle + " " + cell + " (expected " + ch.expected + ") ===");

  // Grid lines around this cell
  const x1 = vL[ch.col], y1 = hL[ch.row], x2 = vL[ch.col + 1], y2 = hL[ch.row + 1];
  const cw = x2 - x1, ch2 = y2 - y1;
  console.log("Cell bounds: (" + Math.round(x1) + "," + Math.round(y1) + ")-(" + Math.round(x2) + "," + Math.round(y2) + ") size=" + cw.toFixed(1) + "x" + ch2.toFixed(1));
  console.log("Adjacent lines: H[" + hL.slice(Math.max(0, ch.row - 1), Math.min(10, ch.row + 3)).map(v => Math.round(v)).join(",") + "]");
  console.log("                V[" + vL.slice(Math.max(0, ch.col - 1), Math.min(10, ch.col + 3)).map(v => Math.round(v)).join(",") + "]");

  // Extract at different insets
  for (const insetPct of [0.10, 0.12, 0.15, 0.20]) {
    const inset = Math.max(2, cw * insetPct);
    const { pixels } = ec(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
    const bw = Math.round(x2 - x1 - 2 * inset), bh = Math.round(y2 - y1 - 2 * inset);

    let maxVal = 0, darkCount = 0;
    for (const row of pixels) for (const v of row) { if (v > maxVal) maxVal = v; if (v > 128) darkCount++; }
    const darkPct = (darkCount / (bw * bh) * 100).toFixed(1);
    console.log("  inset=" + (insetPct * 100).toFixed(0) + "%: " + bw + "x" + bh + " maxVal=" + maxVal + " dark=" + darkCount + " (" + darkPct + "%)");
  }

  // Save the full cell including some context (for debugging)
  const ctxPad = 20;
  const ctxX1 = Math.max(0, x1 - ctxPad), ctxY1 = Math.max(0, y1 - ctxPad);
  const ctxX2 = Math.min(w, x2 + ctxPad), ctxY2 = Math.min(h, y2 + ctxPad);
  const { pixels: ctxPixels } = ec(data, w, ctxX1, ctxY1, ctxX2, ctxY2);

  writeFileSync(join(DEBUG_DIR, "p" + ch.puzzle + "_" + cell + "_ctx.json"),
    JSON.stringify({ pixels: ctxPixels, w: ctxPixels[0]?.length || 0, h: ctxPixels.length,
      cell: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)] }, null, 2));

  // Show pixel "silhouette" - which rows/cols have content
  const inset = Math.max(2, cw * 0.10);
  const { pixels: cellPx } = ec(data, w, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
  const bh2 = cellPx.length, bw2 = cellPx[0]?.length || 0;

  // Compute horizontal and vertical projections
  const hProj = [];
  for (let y = 0; y < bh2; y++) { let s = 0; for (let x = 0; x < bw2; x++) s += cellPx[y][x]; hProj.push(s); }
  const vProj = [];
  for (let x = 0; x < bw2; x++) { let s = 0; for (let y = 0; y < bh2; y++) s += cellPx[y][x]; vProj.push(s); }

  const hMax = Math.max(...hProj), vMax = Math.max(...vProj);
  // Find content extent
  let hStart = 0, hEnd = bh2 - 1, vStart = 0, vEnd = bw2 - 1;
  while (hStart < bh2 && hProj[hStart] < hMax * 0.1) hStart++;
  while (hEnd > 0 && hProj[hEnd] < hMax * 0.1) hEnd--;
  while (vStart < bw2 && vProj[vStart] < vMax * 0.1) vStart++;
  while (vEnd > 0 && vProj[vEnd] < vMax * 0.1) vEnd--;

  console.log("  Content bounds: row " + hStart + "-" + hEnd + " (of " + bh2 + "), col " + vStart + "-" + vEnd + " (of " + bw2 + ")");
  console.log("  Content is " + (hStart > bh2 * 0.1 ? "OFF-CENTER (top gap=" + hStart + ")" : "centered") +
    (vStart > bw2 * 0.1 ? " OFF-CENTER (left gap=" + vStart + ")" : ""));
  console.log("  Digit fills " + ((hEnd - hStart + 1) / bh2 * 100).toFixed(0) + "% height, " +
    ((vEnd - vStart + 1) / bw2 * 100).toFixed(0) + "% width");
}

console.log("\nDebug data saved to: " + DEBUG_DIR);
