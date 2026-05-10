/**
 * 诊断脚本 — 保存格子裁剪图，检查网格检测和 tesseract 输入质量
 */
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");
const { PNG } = require("pngjs");

const logger = {
  info: (m) => console.log(`  [INFO] ${m}`),
  debug: (m) => {},
  warn: (m) => console.log(`  [WARN] ${m}`),
  error: (m) => console.log(`  [ERROR] ${m}`),
};

const OUT_DIR = join(__dirname, "..", "debug-cells");

async function main() {
  const imagePath = join(__dirname, "..", "..", "..", "images", "数独题目1.png");
  console.log(`读取: ${imagePath}`);
  const imageBuf = readFileSync(imagePath);

  const { recognizeBoard, preloadWorker, waitForWorker } = require("../lib/ocr");

  // 先跑一次 OCR，但我们主要想保存格子裁剪图
  // 我们需要直接调用底层函数来截取
  console.log("初始化 tesseract...");
  preloadWorker(logger);
  const ok = await waitForWorker(logger);
  if (!ok) { console.error("tesseract 失败"); return; }

  // 解码图片
  const png = PNG.sync.read(imageBuf);
  const data = png.data;
  const imgW = png.width;
  const imgH = png.height;
  console.log(`图片: ${imgW}x${imgH}`);

  // 模拟网格检测（和 ocr.ts 一样）
  const grid = detectGridLines(data, imgW, imgH);
  const hLines = grid.horizontal.slice(0, 10);
  const vLines = grid.vertical.slice(0, 10);
  console.log(`网格: H=[${hLines.map(v=>Math.round(v)).join(",")}]`);
  console.log(`      V=[${vLines.map(v=>Math.round(v)).join(",")}]`);

  // 创建输出目录
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  // 保存每个裁剪的格子
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x1 = Math.round(vLines[c]);
      const y1 = Math.round(hLines[r]);
      const x2 = Math.round(vLines[c + 1]);
      const y2 = Math.round(hLines[r + 1]);
      const cellW = x2 - x1;
      const cellH = y2 - y1;
      if (cellW < 5 || cellH < 5) continue;

      // Crop at 2x like OCR does
      const scale = 2;
      const outW = Math.ceil(cellW * scale);
      const outH = Math.ceil(cellH * scale);
      const outPng = new PNG({ width: outW, height: outH });

      for (let dy = 0; dy < outH; dy++) {
        for (let dx = 0; dx < outW; dx++) {
          const sx = x1 + Math.round((dx / outW) * cellW);
          const sy = y1 + Math.round((dy / outH) * cellH);
          const srcIdx = (sy * imgW + sx) * 4;
          const dstIdx = (dy * outW + dx) * 4;
          outPng.data[dstIdx] = data[srcIdx];
          outPng.data[dstIdx+1] = data[srcIdx+1];
          outPng.data[dstIdx+2] = data[srcIdx+2];
          outPng.data[dstIdx+3] = 255;
        }
      }

      const rowLabel = String.fromCharCode(65 + r);
      const filename = `cell_${rowLabel}${c+1}.png`;
      writeFileSync(join(OUT_DIR, filename), PNG.sync.write(outPng));
    }
  }
  console.log(`81个格子已保存到: ${OUT_DIR}`);

  // 也保存一张带网格标注的原图
  const { createCanvas, Image } = require("@ahdg/canvas");
  const canvas = createCanvas(imgW, imgH);
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = imageBuf;
  ctx.drawImage(img, 0, 0);

  // 画网格线
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  for (const y of hLines) { ctx.beginPath(); ctx.moveTo(0, Math.round(y)); ctx.lineTo(imgW, Math.round(y)); ctx.stroke(); }
  for (const x of vLines) { ctx.beginPath(); ctx.moveTo(Math.round(x), 0); ctx.lineTo(Math.round(x), imgH); ctx.stroke(); }

  writeFileSync(join(OUT_DIR, "grid_overlay.png"), canvas.toBuffer("image/png"));
  console.log("网格标注图已保存: grid_overlay.png");
}

// 精简版网格检测（和 ocr.ts 一样）
function grayAt(data, w, x, y) {
  const i = (y*w + x)*4;
  return Math.round(0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
}
function rowDarkness(data, w, y, t) {
  let n=0; for (let x=0; x<w; x++) if (grayAt(data,w,x,y) < t) n++; return n;
}
function colDarkness(data, w, h, x, t) {
  let n=0; for (let y=0; y<h; y++) if (grayAt(data,w,x,y) < t) n++; return n;
}
function detectGridLines(data, w, h) {
  const T = 100, TH = 0.15;
  // Horizontal
  const rs = []; for (let y=0; y<h; y++) rs.push({y, s: rowDarkness(data,w,y,T)/w});
  const hc = []; let il=false, by=0, bs=0;
  for (let i=0; i<rs.length; i++) {
    if (rs[i].s > TH) { if (!il) { il=true; by=i; bs=rs[i].s; } else if (rs[i].s>bs) { bs=rs[i].s; by=i; } }
    else { if (il) { il=false; hc.push(by); } }
  }
  if (il) hc.push(by);
  // Vertical
  const cs = []; for (let x=0; x<w; x++) cs.push({x, s: colDarkness(data,w,h,x,T)/h});
  const vc = []; il=false; let bx=0; bs=0;
  for (let i=0; i<cs.length; i++) {
    if (cs[i].s > TH) { if (!il) { il=true; bx=i; bs=cs[i].s; } else if (cs[i].s>bs) { bs=cs[i].s; bx=i; } }
    else { if (il) { il=false; vc.push(bx); } }
  }
  if (il) vc.push(bx);
  return {
    horizontal: clusterLines(hc, 10) || evenLines(10, h),
    vertical: clusterLines(vc, 10) || evenLines(10, w),
  };
}
function clusterLines(arr, n) {
  if (arr.length <= n) return [...arr].sort((a,b)=>a-b);
  const s = [...arr].sort((a,b)=>a-b);
  const r = []; const bs = s.length / n;
  for (let i=0; i<n; i++) { const b = s.slice(Math.round(i*bs), Math.round((i+1)*bs)); if (b.length) r.push(b[Math.floor(b.length/2)]); }
  return r;
}
function evenLines(n, t) { return Array.from({length:n}, (_,i) => Math.round((i/(n-1))*t)); }

main().catch(e => console.error(e));
