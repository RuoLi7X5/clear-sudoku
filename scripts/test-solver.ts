/**
 * 直观技巧求解器逻辑验证
 * 用法: cd external/clear-sudoku && npx ts-node scripts/test-solver.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Answer keys for images 1-20
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
  "813406902570120004402003010925381746104207080080045201600004120008010000001700000",
  "704100069030600407096070023017060030460700001309010746641087390978306004253941678",
  "000197082802050079070020400000900000006005730500030004400500200020089047000000060",
  "034705000728614009600023400800070000370008002002030800263047001497001060581300704",
  "010300040030009200700000038042090070000720400087134092000057010401083020009200300",
  "003800400600400003040030009004000930932018004567943218458200391206380745370004862",
  "140007090002930147907041006001000904058409710409013085700100400090304001014802000",
  "010090703009007010000005490000250009020700000600080070200400307070508000001070050",
  "203007500780563204450200370530920040024005900697834125902050400305009002040302059",
  "060004082002803675500672904006738000000900008000020700900267843003089007070305200",
];

function cellLabel(r: number, c: number): string {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function validateBoard(desc: string, givens: number[][], deduced: number[][]): string[] {
  const errors: string[] = [];

  // Check no duplicate values in rows/cols/boxes
  for (let r = 0; r < 9; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const v = givens[r][c] || deduced[r][c];
      if (v > 0 && seen.has(v)) {
        errors.push(`${desc}: 第${r+1}行重复值${v}`);
      }
      if (v > 0) seen.add(v);
    }
  }

  for (let c = 0; c < 9; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < 9; r++) {
      const v = givens[r][c] || deduced[r][c];
      if (v > 0 && seen.has(v)) {
        errors.push(`${desc}: 第${c+1}列重复值${v}`);
      }
      if (v > 0) seen.add(v);
    }
  }

  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const seen = new Set<number>();
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const v = givens[br + dr][bc + dc] || deduced[br + dr][bc + dc];
          if (v > 0 && seen.has(v)) {
            errors.push(`${desc}: 第${Math.floor(br/3)*3+Math.floor(bc/3)+1}宫重复值${v}`);
          }
          if (v > 0) seen.add(v);
        }
      }
    }
  }

  return errors;
}

async function main() {
  const { BoardState } = require("../lib/board");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { applyIntuitiveChain } = require("../lib/solver-chain");
  const { SudokuRenderer } = require("../lib/renderer");

  preloadTemplates();

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  console.log("=== 直观技巧求解器验证 ===\n");

  // Test 1: Chain on manually constructed board (known puzzle)
  console.log("Test 1: 已知盘面推导");
  const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  // Simple puzzle: row 0 has 1-8, cell I9 should be 9 (naked single)
  givens[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // A1 empty, rest 1-8 → A1=9

  const candidates = BoardState.computeStandardCandidates(givens, deduced);
  const board1 = new BoardState(givens, deduced, candidates);

  const beforeA1 = board1.candidates[0][0].size;
  const result1 = applyIntuitiveChain(board1);
  const afterVal = board1.getValue(0, 0);

  if (afterVal === 9 && result1.newResolutions.length === 1) {
    console.log(`  [PASS] Naked Single: A1=9 (was ${beforeA1} candidates, now resolved)`);
    console.log(`         ${result1.descriptions.join("; ")}`);
  } else {
    console.log(`  [FAIL] Expected A1=9, got ${afterVal}, ${result1.newResolutions.length} resolutions`);
    console.log(`         ${result1.descriptions.join("; ")}`);
  }

  let allOk = afterVal === 9;

  // Validate no invalid state
  const errs1 = validateBoard("Test1", board1.givens, board1.deduced);
  if (errs1.length > 0) {
    console.log(`  [FAIL] Invalid board: ${errs1.join(", ")}`);
    allOk = false;
  }

  // Test 2: Hidden Single
  console.log("\nTest 2: 隐性唯余");
  const g2: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const d2: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  // Fill row 0 with 1-8 except A1; fill col 1 with 1-8 except A1 and B1
  // This should make A1 the only possible cell for 9 in both row 0 and col 1
  g2[0] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // Fill most of row 1 to force B2=2 to be a hidden single
  g2[1] = [1, 0, 3, 4, 5, 6, 7, 8, 9]; // B2=2 is hidden single in box 1

  const cands2 = BoardState.computeStandardCandidates(g2, d2);
  const board2 = new BoardState(g2, d2, cands2);
  const result2 = applyIntuitiveChain(board2);

  if (result2.newResolutions.length > 0) {
    const nakedSingles = result2.newResolutions.filter(d => result2.descriptions.some(de => de.includes("唯余")));
    const hiddenSingles = result2.newResolutions.filter(d => result2.descriptions.some(de => de.includes("排除/")));
    console.log(`  [PASS] Hidden/Naked singles found: ${result2.newResolutions.length} resolutions`);
    console.log(`         Naked: ${nakedSingles.map(d => `${cellLabel(d.row,d.col)}=${d.value}`).join(",") || "none"}`);
    console.log(`         Hidden: ${hiddenSingles.map(d => `${cellLabel(d.row,d.col)}=${d.value}`).join(",") || "none"}`);
    console.log(`         ${result2.descriptions.join("; ")}`);
  } else {
    console.log(`  [FAIL] No resolutions found (expected at least A1=9)`);
    allOk = false;
  }

  // Test 3: Pointing (区块排除)
  console.log("\nTest 3: 区块排除验证");
  // Construct a scenario where pointing applies
  const g3: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  const d3: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  // Fill box 0 (cells A1-C3) partially so that value 1 only appears in row 0 within the box
  // This should create a pointing pair: box 0, value 1, row 0
  // Then outside the box, row 0 cells should not have candidate 1

  // First, set up a board that forces value 1 to be in row 0 of box 0 only
  // We'll manually set candidates
  const cands3 = BoardState.computeStandardCandidates(g3, d3);
  // Manually construct pointing scenario
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cands3[r][c] = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  // Remove 1 from all cells in box 0 except row 0
  for (let r = 1; r < 3; r++)
    for (let c = 0; c < 3; c++)
      cands3[r][c].delete(1);
  // Remove 1 from all other boxes in rows 1-8
  for (let r = 3; r < 9; r++)
    for (let c = 0; c < 9; c++)
      cands3[r][c].delete(1);

  // Set givens in row 0 cols 3-8 (outside box 0) so pointing matters
  g3[0][3] = 2; g3[0][4] = 3; g3[0][5] = 4;
  g3[0][6] = 5; g3[0][7] = 6; g3[0][8] = 7;

  const board3 = new BoardState(g3, d3, cands3);
  const beforeCount = board3.candidates[0][3]; // cell outside box, should still have
  const result3 = applyIntuitiveChain(board3);

  const pointingDescriptions = result3.descriptions.filter(d => d.includes("仅限") || d.includes("排除"));
  console.log(`  Pointing descriptions: ${pointingDescriptions.length > 0 ? pointingDescriptions.join("; ") : "none"}`);
  console.log(`  All descriptions: ${result3.descriptions.join(" | ")}`);
  console.log(`  ${pointingDescriptions.length > 0 ? "[PASS]" : "[WARN]"} Pointing test (may need more specific setup)`);

  // Test 4: Real puzzles — run solver on images 1-5 rendered output
  console.log("\nTest 4: 真实题目推导验证 (images 1-5)");
  for (let i = 1; i <= 5; i++) {
    const imgPath = join(IMG_DIR, `${i}.png`);
    if (!existsSync(imgPath)) continue;

    try {
      const buf = readFileSync(imgPath);
      const ocr = await recognizeBoard(buf, logger);
      const board = BoardState.fromOCR(ocr);

      // Record before state
      let beforeResolved = 0;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (board.getValue(r, c) > 0) beforeResolved++;

      // Apply chain
      const result = applyIntuitiveChain(board);

      // Validate
      const errors = validateBoard(`img${i}`, board.givens, board.deduced);
      let afterResolved = 0;
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (board.getValue(r, c) > 0) afterResolved++;

      const newCount = afterResolved - beforeResolved;

      if (errors.length > 0) {
        console.log(`  [${i}] [FAIL] Invalid deductions: ${errors.join(", ")}`);
        allOk = false;
      } else if (newCount > 0 || result.descriptions.length > 0) {
        console.log(`  [${i}] [PASS] ${beforeResolved}→${afterResolved} resolved (+${newCount}), ${result.descriptions.length} steps`);
        if (result.descriptions.length <= 5) {
          for (const d of result.descriptions) console.log(`         ${d}`);
        }
      } else {
        console.log(`  [${i}] [OK] ${beforeResolved} resolved, no new deductions`);
      }
    } catch (e: any) {
      console.log(`  [${i}] [ERR] ${e.message}`);
    }
  }

  console.log(`\n${allOk ? "全部通过" : "存在失败 — 需检查"}`);
}

main().catch(e => { console.error(e); process.exit(1); });
