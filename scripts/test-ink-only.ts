/**
 * 纯墨迹检测候选数 — 只靠小9宫格位置，不用约束网格
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { detectGridLines, extractGrayscale } from "../src/ocr";
import { matchBigDigit, reloadTemplates } from "../src/template-match";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";

const IMG = join(__dirname, "..", "..", "..", "images");
const OUT = join(IMG, "testoutput");

function findImg(n: number): string | null {
  for (const ext of [".png", ".jpg"]) { const p = join(IMG, `${n}${ext}`); if (existsSync(p)) return p; }
  return null;
}

function grayAt(d: Uint8Array, iw: number, x: number, y: number): number {
  const idx = (Math.round(y) * iw + Math.round(x)) * 4;
  return Math.round(0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]);
}

/** 纯墨迹检测：子格暗像素 > 1% */
function hasInk(d: Uint8Array, iw: number, x1: number, y1: number, x2: number, y2: number): boolean {
  let dark = 0, total = 0;
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      total++;
      if (grayAt(d, iw, x, y) < 100) dark++;
    }
  }
  return dark / total > 0.01;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  reloadTemplates();

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  for (let i = 1; i <= 10; i++) {
    const imgPath = findImg(i);
    if (!imgPath) { console.log(`#p${i}: skip`); continue; }
    const buf = readFileSync(imgPath);
    let data: Uint8Array, imgW: number, imgH: number;
    if (buf[0] === 0x89) {
      const { PNG } = require("pngjs"); const p = PNG.sync.read(buf);
      data = p.data as Uint8Array; imgW = p.width; imgH = p.height;
    } else {
      const jpeg = require("jpeg-js"); const r = jpeg.decode(buf, { useTArray: true });
      data = r.data as Uint8Array; imgW = r.width; imgH = r.height;
    }

    const grid = detectGridLines(data, imgW, imgH);
    const hL = grid.horizontal.slice(0, 10), vL = grid.vertical.slice(0, 10);

    // ── 大数识别 (复用) ──
    const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates: Set<number>[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>())
    );

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const cw = x2 - x1, ch = y2 - y1;
        if (cw < 5 || ch < 5) continue;
        const inset = Math.max(2, cw * 0.12);
        const px = extractGrayscale(data, imgW, x1 + inset, y1 + inset, x2 - inset, y2 - inset);
        const bw = Math.round(x2 - x1 - 2 * inset), bh = Math.round(y2 - y1 - 2 * inset);
        let mv = 0;
        for (const row of px) for (const v of row) if (v > mv) mv = v;
        if (mv >= 30 && bw >= 5 && bh >= 5) {
          const result = matchBigDigit(px, bw, bh);
          if (result.confidence > 0.55) {
            givens[r][c] = result.digit;
            candidates[r][c] = new Set([result.digit]);
          }
        }
      }
    }

    // ── 候选数：纯墨迹检测 (只用9宫格位置) ──
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (givens[r][c] > 0) continue; // 大数格跳过

        const x1 = vL[c], y1 = hL[r], x2 = vL[c + 1], y2 = hL[r + 1];
        const subW = (x2 - x1) / 3, subH = (y2 - y1) / 3;
        const pad = 0.15;

        const cands: number[] = [];
        for (let v = 1; v <= 9; v++) {
          const sr = Math.floor((v - 1) / 3), sc = (v - 1) % 3;
          const sx1 = x1 + sc * subW + subW * pad;
          const sy1 = y1 + sr * subH + subH * pad;
          const sx2 = x1 + (sc + 1) * subW - subW * pad;
          const sy2 = y1 + (sr + 1) * subH - subH * pad;
          if (hasInk(data, imgW, sx1, sy1, sx2, sy2)) {
            cands.push(v);
          }
        }
        if (cands.length > 0) {
          candidates[r][c] = new Set(cands);
        }
      }
    }

    const board = new BoardState(givens, deduced, candidates);
    const outBuf = await renderer.renderResult(board);
    writeFileSync(join(OUT, `result_${i}.png`), outBuf);

    let g = 0, d2 = 0, cCount = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board.givens[r][c]) g++;
      else if (board.deduced[r][c]) d2++;
      if (board.candidates[r][c].size > 0) cCount++;
    }
    console.log(`#p${i}: ${g}G ${d2}D ${cCount}cands → result_${i}.png`);
  }
}

main();
