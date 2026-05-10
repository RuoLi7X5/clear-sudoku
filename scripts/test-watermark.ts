/**
 * 测试题号水印闭环：指令解析 → 渲染 → 二次识别继承编号
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function main() {
  const { parseCommand } = require("../lib/parser");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  preloadTemplates();

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  // Test 1: Parse "A59 8题"
  const r1 = parseCommand("A59 8题");
  if ("error" in r1) { console.log(`Parse FAIL: ${r1.error}`); return; }
  console.log(`Parse: A59 8题 → ${r1.operations.length} ops, qn=${r1.questionNumber}`);
  console.assert(r1.questionNumber === 8, "Expected qn=8");

  // Test 2: Parse "A59 #5"
  const r2 = parseCommand("A59,B44 #5");
  if ("error" in r2) { console.log(`Parse FAIL: ${r2.error}`); return; }
  console.log(`Parse: A59,B44 #5 → ${r2.operations.length} ops, qn=${r2.questionNumber}`);
  console.assert(r2.questionNumber === 5, "Expected qn=5");

  // Test 3: Parse without number
  const r3 = parseCommand("A59");
  if ("error" in r3) { console.log(`Parse FAIL: ${r3.error}`); return; }
  console.log(`Parse: A59 → ${r3.operations.length} ops, qn=${r3.questionNumber}`);
  console.assert(r3.questionNumber === undefined, "Expected no qn");

  console.log("\n--- Parser tests PASSED ---\n");

  // Test 4: Render → re-OCR with question number
  const OUT1 = join(__dirname, "..", "..", "..", "testoutput_q");
  const OUT2 = join(__dirname, "..", "..", "..", "testoutput2_q");
  if (!existsSync(OUT1)) mkdirSync(OUT1, { recursive: true });
  if (!existsSync(OUT2)) mkdirSync(OUT2, { recursive: true });

  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  for (let i = 1; i <= 5; i++) {
    const imgPath = join(IMG_DIR, `${i}.png`);
    if (!existsSync(imgPath)) continue;

    process.stdout.write(`[${i}] OCR → render(qn=${i}) → re-OCR ... `);
    try {
      const buf = readFileSync(imgPath);
      const ocr = await recognizeBoard(buf, { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} });
      const board = BoardState.fromOCR(ocr);
      board.questionNumber = i; // simulate user specifying "i题"

      const rendered = await renderer.renderResult(board);
      writeFileSync(join(OUT1, `${i}.png`), rendered);

      // Re-OCR
      const reOcr = await recognizeBoard(rendered, { info: () => {}, debug: (m: string) => process.stdout.write(` [${m}] `), warn: () => {}, error: () => {} });
      const reBoard = BoardState.fromOCR(reOcr);
      const reRendered = await renderer.renderResult(reBoard);
      writeFileSync(join(OUT2, `${i}.png`), reRendered);

      const ok = reOcr.questionNumber === i ? "OK" : `FAIL (got ${reOcr.questionNumber})`;
      const match = reBoard.questionNumber === i ? "✓" : "✗";
      console.log(`${ok} | board.qn=${reBoard.questionNumber} ${match}`);
    } catch (e: any) {
      console.log(`ERR: ${e.message}`);
    }
  }

  console.log("\nDone. Output: testoutput_q/, testoutput2_q/");
}

main().catch(e => { console.error(e); process.exit(1); });
