/**
 * 精确诊断 I7 的候选5 墨迹
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = Math.round(y) * imgW * 4 + Math.round(x) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

async function main() {
  const { detectGridLines } = require("../lib/ocr");
  preloadTemplates: try { require("../lib/ocr").preloadTemplates(); } catch {}

  const buf = readFileSync(join(__dirname,"..","..","..","images","421.png"));
  const png = PNG.sync.read(buf);
  const data = png.data as Uint8Array;
  const width = png.width, height = png.height;

  const grid = detectGridLines(data, width, height);
  const h = grid.horizontal, v = grid.vertical;

  // Check ALL candidate cells for "missed" candidates
  console.log("=== 候选格墨迹精度诊断 (image 421) ===\n");
  console.log("检查每个候选格：OCR识别 vs 低于1%阈值但仍有墨迹的位置\n");

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x1 = v[c], y1 = h[r];
      const x2 = v[c+1], y2 = h[r+1];
      const cellW = x2 - x1, cellH = y2 - y1;
      if (cellW < 5 || cellH < 5) continue;

      // Check if this is a big number cell
      const inset = Math.max(2, cellW * 0.12);
      let hasBig = false;
      for (let yy = Math.round(y1+inset); yy <= Math.round(y2-inset); yy++)
        for (let xx = Math.round(x1+inset); xx <= Math.round(x2-inset); xx++)
          if (grayAt(data, width, xx, yy) < 100) { hasBig = true; break; }
      if (hasBig) continue;

      // Check each sub-cell
      const subW = cellW / 3, subH = cellH / 3;
      const missed: Array<{val:number;darkCount:number;totalCount:number;ratio:number;minGray:number}> = [];
      const found: number[] = [];

      for (let val = 1; val <= 9; val++) {
        const subR = Math.floor((val - 1) / 3);
        const subC = (val - 1) % 3;
        const pad = 0.15;
        const sx1 = x1 + subC * subW + subW * pad;
        const sy1 = y1 + subR * subH + subH * pad;
        const sx2 = x1 + (subC + 1) * subW - subW * pad;
        const sy2 = y1 + (subR + 1) * subH - subH * pad;

        let darkCount = 0, totalCount = 0, minGray = 255;
        for (let yy = Math.round(sy1); yy <= Math.round(sy2); yy++) {
          for (let xx = Math.round(sx1); xx <= Math.round(sx2); xx++) {
            const g = grayAt(data, width, xx, yy);
            if (g < 100) darkCount++;
            if (g < minGray) minGray = g;
            totalCount++;
          }
        }
        const ratio = darkCount / Math.max(1, totalCount);

        if (ratio > 0.01) {
          found.push(val);
        } else if (darkCount >= 2 && minGray < 150) {
          // Below 1% threshold but still has some dark pixels
          missed.push({ val, darkCount, totalCount, ratio, minGray });
        }
      }

      if (missed.length > 0) {
        const label = `${String.fromCharCode(65+r)}${c+1}`;
        console.log(`${label}: found=[${found.join(",")}], missed(near-threshold):`);
        for (const m of missed)
          console.log(`  候选${m.val}: ${m.darkCount}/${m.totalCount}=${(m.ratio*100).toFixed(2)}% minGray=${m.minGray}`);
      }
    }
  }

  // Also check I7 specifically with lower thresholds
  console.log("\n=== I7 候选5 详细分析 ===");
  const r=8, c=6;
  const x1=v[c], y1=h[r], x2=v[c+1], y2=h[r+1];
  const cellW=x2-x1, cellH=y2-y1, subW=cellW/3, subH=cellH/3;
  const val=5, subR=Math.floor((val-1)/3), subC=(val-1)%3, pad=0.15;
  const sx1=x1+subC*subW+subW*pad, sy1=y1+subR*subH+subH*pad;
  const sx2=x1+(subC+1)*subW-subW*pad, sy2=y1+(subR+1)*subH-subH*pad;

  console.log(`检测区域: (${Math.round(sx1)},${Math.round(sy1)})-(${Math.round(sx2)},${Math.round(sy2)})`);
  let d=0, t=0, mg=255;
  for (let yy=Math.round(sy1); yy<=Math.round(sy2); yy++) {
    for (let xx=Math.round(sx1); xx<=Math.round(sx2); xx++) {
      const g = grayAt(data, width, xx, yy);
      if (g < 100) d++; else if (g < 180) d++; // also count mid-gray
      if (g < mg) mg = g;
      t++;
    }
  }
  console.log(`"暗"像素(<180): ${d}/${t}=${(d/t*100).toFixed(2)}%, minGray=${mg}`);

  // Check: expand detection area (remove padding)
  console.log("\n=== I7 候选5 无padding ===");
  const sx1b=x1+subC*subW, sy1b=y1+subR*subH;
  const sx2b=x1+(subC+1)*subW, sy2b=y1+(subR+1)*subH;
  let d2=0, t2=0;
  for (let yy=Math.round(sy1b); yy<=Math.round(sy2b); yy++) {
    for (let xx=Math.round(sx1b); xx<=Math.round(sx2b); xx++) {
      if (grayAt(data, width, xx, yy) < 100) d2++;
      t2++;
    }
  }
  console.log(`暗像素(<100): ${d2}/${t2}=${(d2/t2*100).toFixed(2)}%`);
}

main().catch(e=>{console.error(e);process.exit(1);});
