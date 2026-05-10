/**
 * 测试新版水印：解析 #82-4、渲染、二次识别继承
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function main() {
  const { parseCommand } = require("../lib/parser");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  preloadTemplates();

  // Test 1: Parse
  for (const [input, expected] of [
    ["A59 #82-4", "82-4"],
    ["A59 #421", "421"],
    ["A59,B44", undefined],
    ["A59 8题", "8"], // backward compat
    ["A59 #abc", undefined], // letters filtered
  ] as [string, string | undefined][]) {
    const r = parseCommand(input);
    if ("error" in r) { console.log(`[FAIL] "${input}" parse error: ${r.error}`); continue; }
    const ok = r.watermark === expected;
    console.log(`[${ok ? "OK" : "FAIL"}] "${input}" → watermark="${r.watermark}" (expected "${expected}")`);
  }

  // Test 2: Render + re-OCR round-trip
  console.log("\n--- 水印闭环测试 ---");
  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const OUT = join(__dirname, "..", "..", "..", "testwm");
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  for (let i = 1; i <= 3; i++) {
    const imgPath = join(IMG_DIR, `${i}.png`);
    if (!existsSync(imgPath)) continue;

    process.stdout.write(`[${i}] OCR → render(#test-${i}) → re-OCR ... `);

    const buf = readFileSync(imgPath);
    const ocr = await recognizeBoard(buf, logger);
    const board = BoardState.fromOCR(ocr);
    board.watermark = `${i}${i}`;  // "11", "22", "33" — digit-only

    const rendered = await renderer.renderResult(board);
    writeFileSync(join(OUT, `${i}_first.png`), rendered);

    const reOcr = await recognizeBoard(rendered, logger);
    const detected = reOcr.watermark;
    const expected = `${i}${i}`;
    const ok = detected === expected ? "OK" : `FAIL (got "${detected}")`;
    console.log(ok);

    if (detected === expected) {
      const reBoard = BoardState.fromOCR(reOcr);
      const reRendered = await renderer.renderResult(reBoard);
      writeFileSync(join(OUT, `${i}_second.png`), reRendered);
    }
  }

  console.log(`\nDone. Output: testwm/`);
}

main().catch(e => { console.error(e); process.exit(1); });
