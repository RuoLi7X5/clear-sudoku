/**
 * 诊断脚本：对比数字模板在已知答案上的 NCC 匹配情况
 */
import { readFileSync } from "fs";
import { join } from "path";

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
];

async function main() {
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { BoardState } = require("../lib/board");
  const { SudokuRenderer } = require("../lib/renderer");

  preloadTemplates();

  const mockCtx = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const IMG_DIR = join(__dirname, "..", "..", "..", "images");

  let totalDigits = 0, totalMatch = 0, totalConflict = 0;

  for (let idx = 0; idx < 10; idx++) {
    const imgPath = join(IMG_DIR, `${idx + 1}.png`);
    const buf = readFileSync(imgPath);
    const ocrResult = await recognizeBoard(buf, { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} });
    const board = BoardState.fromOCR(ocrResult);
    const rendered = await renderer.renderResult(board);

    // Re-OCR the rendered image
    const reResult = await recognizeBoard(rendered, { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} });
    const reBoard = BoardState.fromOCR(reResult);

    const answer = ANSWERS[idx];
    let imgDigits = 0, imgMatch = 0, imgConflict = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const origVal = board.givens[r][c] || board.deduced[r][c];
        const reVal = reBoard.givens[r][c] || reBoard.deduced[r][c];
        const ansVal = parseInt(answer[r * 9 + c]);

        if (origVal > 0) imgDigits++;
        if (origVal > 0 && reVal > 0 && reVal !== origVal) imgConflict++;
        if (origVal > 0 && reVal === origVal) imgMatch++;
      }
    }

    const rate = imgDigits > 0 ? (imgMatch / imgDigits * 100).toFixed(0) : "N/A";
    console.log(`[${idx + 1}] ${imgMatch}/${imgDigits} correct (${rate}%), ${imgConflict} misread`);
    totalDigits += imgDigits;
    totalMatch += imgMatch;
    totalConflict += imgConflict;
  }

  console.log(`\n总计: ${totalMatch}/${totalDigits} (${(totalMatch/totalDigits*100).toFixed(1)}%), ${totalConflict} misread`);
}

main().catch(e => { console.error(e); process.exit(1); });
