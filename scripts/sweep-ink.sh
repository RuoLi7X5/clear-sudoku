#!/bin/bash
# 墨迹阈值扫描 1%-8%
cd /d/koishi-dev/mybot1/external/clear-sudoku

for pct in 1 2 3 4 5 6 7 8; do
  outdir="../images/testoutput/ink${pct}pct"
  mkdir -p "$outdir"
  echo "=== 阈值 ${pct}% → ink${pct}pct/ ==="

  # Patch ocr.ts
  sed -i "s/return darkCount \/ totalCount > 0\.0[1-8]/return darkCount \/ totalCount > 0.0${pct}/" src/ocr.ts

  npx tsc 2>/dev/null

  # Render 1-40
  for i in $(seq 1 40); do
    node -e "
      const { readFileSync, writeFileSync, existsSync } = require('fs');
      const { join } = require('path');
      const { recognizeBoard } = require('./lib/ocr');
      const { BoardState } = require('./lib/board');
      const { SudokuRenderer } = require('./lib/renderer');
      const BASE = process.cwd() + '/../..';
      const imgPath = (['.png','.jpg'].map(e=>join(BASE,'images',${i}+e)).find(p=>existsSync(p)));
      if(!imgPath) process.exit();
      const buf = readFileSync(imgPath);
      (async()=>{
        const ocr = await recognizeBoard(buf, null);
        const board = BoardState.fromOCR(ocr);
        const mCtx = { logger: (n) => ({ info:()=>{}, warn:()=>{}, error:()=>{}, debug:()=>{} }), baseDir: process.cwd() };
        const r = new SudokuRenderer(mCtx);
        writeFileSync(join(BASE,'images','testoutput','ink${pct}pct','result_${i}.png'), await r.renderResult(board));
      })();
    " 2>/dev/null
    echo -n " ${i}"
  done
  echo ""
done

# Restore original
sed -i "s/return darkCount \/ totalCount > 0\.0[1-8]/return darkCount \/ totalCount > 0.01/" src/ocr.ts
npx tsc 2>/dev/null
echo "Done. See images/testoutput/ink1pct/ through ink8pct/"
