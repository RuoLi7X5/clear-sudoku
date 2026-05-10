/**
 * 诊断 421 题 I2 格候选数识别问题
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PNG } from "pngjs";

function grayAt(data: Uint8Array, imgW: number, x: number, y: number): number {
  const idx = Math.round(y) * imgW * 4 + Math.round(x) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function hasInk(data: Uint8Array, imgW: number, x1: number, y1: number, x2: number, y2: number): { ink: boolean; ratio: number; minGray: number } {
  let darkCount = 0, totalCount = 0;
  let minGray = 255;
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      const gray = grayAt(data, imgW, x, y);
      if (gray < 100) darkCount++;
      if (gray < minGray) minGray = gray;
      totalCount++;
    }
  }
  const ratio = darkCount / totalCount;
  return { ink: ratio > 0.01, ratio, minGray };
}

function cellLabel(r:number,c:number):string { return `${String.fromCharCode(65+r)}${c+1}`; }

async function main() {
  const { recognizeBoard, preloadTemplates, detectGridLines } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");

  preloadTemplates();

  // Load and decode image 421
  const buf = readFileSync(join(__dirname,"..","..","..","images","421.png"));
  const png = PNG.sync.read(buf);
  const data = png.data as Uint8Array;
  const width = png.width, height = png.height;

  // OCR
  const logger = { info: (m:string)=>console.log(`  ${m}`), debug:()=>{}, warn:()=>{}, error:()=>{} };
  const ocr = await recognizeBoard(buf, logger);
  const board = BoardState.fromOCR(ocr);

  // Focus on I2 (r=8, c=1)
  const r = 8, c = 1;
  const grid = detectGridLines(data, width, height);
  const hLines = grid.horizontal.slice(0,10), vLines = grid.vertical.slice(0,10);

  const x1 = vLines[c], y1 = hLines[r];
  const x2 = vLines[c+1], y2 = hLines[r+1];
  const cellW = x2 - x1, cellH = y2 - y1;
  const subW = cellW / 3, subH = cellH / 3;

  console.log(`=== 诊断 ${cellLabel(r,c)} (image 421) ===\n`);
  console.log(`网格: H=[${hLines.map((v:number)=>Math.round(v)).join(",")}]`);
  console.log(`      V=[${vLines.map((v:number)=>Math.round(v)).join(",")}]`);
  console.log(`格大小: ${cellW.toFixed(1)}×${cellH.toFixed(1)}, 子格: ${subW.toFixed(1)}×${subH.toFixed(1)}`);

  // Big digit check
  const inset = Math.max(2, cellW * 0.12);
  const cx1 = x1 + inset, cy1 = y1 + inset;
  const cx2 = x2 - inset, cy2 = y2 - inset;
  let maxGray = 0;
  for (let y = Math.round(cy1); y <= Math.round(cy2); y++)
    for (let x = Math.round(cx1); x <= Math.round(cx2); x++)
      maxGray = Math.max(maxGray, grayAt(data, width, x, y));
  console.log(`\n大数区域: 最大灰度=${maxGray} (接近0=黑, 255=白), ${maxGray < 100 ? "有墨迹(可能是大数)" : "无墨迹(候选格)"}`);

  // Show OCR result
  const ocrCell = ocr.cells[r][c];
  console.log(`\nOCR结果: value=${ocrCell.value}, type=${ocrCell.type}, candidates=[${ocrCell.candidates.join(",")}]`);

  // Show standard candidates
  const stdCands = BoardState.computeStandardCandidates(board.givens, board.deduced);
  console.log(`标准候选: [${[...stdCands[r][c]].sort((a,b)=>a-b).join(",")}]`);

  // Show actual board candidates
  console.log(`最终候选: [${[...board.candidates[r][c]].sort((a,b)=>a-b).join(",")}]`);

  // Check each sub-cell
  console.log(`\n子格墨迹检测 (候选数位置 1-9):`);
  console.log(`  位置  │ 墨迹占比  │ 最暗像素 │ 判定`);
  console.log(`  ──────┼──────────┼──────────┼──────`);
  for (let v = 1; v <= 9; v++) {
    const subR = Math.floor((v - 1) / 3);
    const subC = (v - 1) % 3;
    const pad = 0.15;
    const sx1 = x1 + subC * subW + subW * pad;
    const sy1 = y1 + subR * subH + subH * pad;
    const sx2 = x1 + (subC + 1) * subW - subW * pad;
    const sy2 = y1 + (subR + 1) * subH - subH * pad;
    const { ink, ratio, minGray } = hasInk(data, width, sx1, sy1, sx2, sy2);
    const inStd = stdCands[r][c].has(v) ? "标准" : "";
    const inBoard = board.candidates[r][c].has(v) ? "最终" : "";
    console.log(`  ${v}(${subR},${subC}) │ ${(ratio*100).toFixed(1)}%`.padEnd(10) + `│ ${minGray}`.padEnd(10) + `│ ${ink ? "✓墨迹" : "✗无"} ${inStd}${inBoard}`);
  }

  // Also check I7 (r=8, c=6)
  const r2 = 8, c2 = 6;
  const ocrCell2 = ocr.cells[r2][c2];
  console.log(`\n\n=== 诊断 ${cellLabel(r2,c2)} ===`);
  console.log(`OCR结果: value=${ocrCell2.value}, type=${ocrCell2.type}, candidates=[${ocrCell2.candidates.join(",")}]`);
  console.log(`标准候选: [${[...stdCands[r2][c2]].sort((a,b)=>a-b).join(",")}]`);
  console.log(`最终候选: [${[...board.candidates[r2][c2]].sort((a,b)=>a-b).join(",")}]`);

  // Also check A1 (r=0, c=0) and A5 (r=0, c=4) for comparison
  for (const [rr,cc,label] of [[0,0,"A1"],[0,4,"A5"]] as [number,number,string][]) {
    const oc = ocr.cells[rr][cc];
    console.log(`\n=== ${label} ===`);
    console.log(`OCR: value=${oc.value}, type=${oc.type}, candidates=[${oc.candidates.join(",")}]`);
    console.log(`标准: [${[...stdCands[rr][cc]].sort((a,b)=>a-b).join(",")}]`);
    console.log(`最终: [${[...board.candidates[rr][cc]].sort((a,b)=>a-b).join(",")}]`);
  }
}

main().catch(e=>{console.error(e);process.exit(1);});
