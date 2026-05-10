/**
 * 清数压力测试 — 回溯法验证清数后盘面是否仍有解
 * 用法: cd external/clear-sudoku && npx ts-node scripts/stress-test-clear.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Answer keys for images 1-20 (81-char strings)
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

// ── Backtracking solver ──────────────────────────────────────────────
function solve(grid: number[][]): number[][] | null {
  const board = grid.map(row => [...row]);

  function isValid(r: number, c: number, v: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === v) return false;
      if (board[i][c] === v) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (board[br + dr][bc + dc] === v) return false;
    return true;
  }

  function bt(): boolean {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          for (let v = 1; v <= 9; v++) {
            if (isValid(r, c, v)) {
              board[r][c] = v;
              if (bt()) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true; // all filled
  }

  return bt() ? board : null;
}

// ── Helpers ─────────────────────────────────────────────────────────
function answerGrid(answerStr: string): number[][] {
  const g: number[][] = [];
  for (let r = 0; r < 9; r++) {
    g.push([]);
    for (let c = 0; c < 9; c++) {
      g[r].push(parseInt(answerStr[r * 9 + c]));
    }
  }
  return g;
}

function cellLabel(r: number, c: number): string {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function formatClearOp(r: number, c: number, cands: number[]): string {
  return `${cellLabel(r, c)}(${cands.join("")})`;
}

function validateSudokuRules(name: string, board: any): string | null {
  const g = board.givens, d = board.deduced;
  // Row duplicate
  for (let r = 0; r < 9; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const v = g[r][c] || d[r][c] || 0;
      if (v > 0 && seen.has(v)) return `R${r + 1} 重复值 ${v}`;
      if (v > 0) seen.add(v);
    }
  }
  // Col duplicate
  for (let c = 0; c < 9; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < 9; r++) {
      const v = g[r][c] || d[r][c] || 0;
      if (v > 0 && seen.has(v)) return `C${c + 1} 重复值 ${v}`;
      if (v > 0) seen.add(v);
    }
  }
  // Box duplicate
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const seen = new Set<number>();
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const v = g[br + dr][bc + dc] || d[br + dr][bc + dc] || 0;
          if (v > 0 && seen.has(v)) return `B${Math.floor(br/3)*3+Math.floor(bc/3)+1} 重复值 ${v}`;
          if (v > 0) seen.add(v);
        }
      }
    }
  }
  // Candidate consistency: no candidate should exist if already resolved in peer
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (g[r][c] || d[r][c]) continue;
      const cands = board.candidates[r][c];
      for (const cand of cands) {
        for (let cc = 0; cc < 9; cc++) {
          if (cc !== c && (g[r][cc] === cand || d[r][cc] === cand))
            return `${cellLabel(r, c)} 候选${cand} 与同行已填${cand}冲突`;
        }
        for (let rr = 0; rr < 9; rr++) {
          if (rr !== r && (g[rr][c] === cand || d[rr][c] === cand))
            return `${cellLabel(r, c)} 候选${cand} 与同列已填${cand}冲突`;
        }
        const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const rr = br + dr, cc = bc + dc;
            if ((rr !== r || cc !== c) && (g[rr][cc] === cand || d[rr][cc] === cand))
              return `${cellLabel(r, c)} 候选${cand} 与同宫已填${cand}冲突`;
          }
        }
      }
    }
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const { BoardState } = require("../lib/board");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { applyIntuitiveChain } = require("../lib/solver-chain");

  preloadTemplates();
  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  console.log("=== 清数压力测试 (回溯法验证) ===\n");
  console.log(`测试范围: 1-20题, 每题随机清数测试\n`);

  let totalClears = 0;
  let totalSolvable = 0;
  let totalUnsolved = 0;
  let totalRuleViolations = 0;
  const failures: string[] = [];

  for (let idx = 0; idx < 20; idx++) {
    const imgPath = join(IMG_DIR, `${idx + 1}.png`);
    if (!existsSync(imgPath)) {
      console.log(`[${idx + 1}] SKIP (no image)`);
      continue;
    }

    const answerStr = ANSWERS[idx];
    const puzzleGrid = answerGrid(answerStr);

    // Solve the puzzle completely for ground truth
    const solution = solve(puzzleGrid);
    if (!solution) {
      console.log(`[${idx + 1}] SKIP (answer puzzle has no solution)`);
      continue;
    }

    // OCR the image
    const buf = readFileSync(imgPath);
    const ocr = await recognizeBoard(buf, logger);
    const board = BoardState.fromOCR(ocr);

    // Build the "filled" grid from OCR (givens + deduced)
    const currentGrid: number[][] = [];
    for (let r = 0; r < 9; r++) {
      currentGrid.push([]);
      for (let c = 0; c < 9; c++) {
        currentGrid[r].push(board.givens[r][c] || board.deduced[r][c] || 0);
      }
    }

    // Verify the current grid is a subset of the solution
    let ocrErrors = 0;
    let candidateCells = 0;
    const cellCandidates: Array<{ r: number; c: number; trueVal: number; currentCands: number[] }> = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = currentGrid[r][c];
        if (v > 0) {
          if (v !== solution[r][c]) ocrErrors++;
        } else {
          const cands = [...board.candidates[r][c]].sort((a, b) => a - b);
          if (cands.length > 0) {
            candidateCells++;
            cellCandidates.push({ r, c, trueVal: solution[r][c], currentCands: cands });
          }
        }
      }
    }

    if (ocrErrors > 0) {
      console.log(`[${idx + 1}] ${ocrErrors} OCR error(s) — skipping stress test`);
      continue;
    }

    // Run solver on current board first
    const boardForSolver = BoardState.fromOCR(ocr);
    applyIntuitiveChain(boardForSolver);

    // Build grid after solver
    const solverGrid: number[][] = [];
    for (let r = 0; r < 9; r++) {
      solverGrid.push([]);
      for (let c = 0; c < 9; c++) {
        solverGrid[r].push(boardForSolver.givens[r][c] || boardForSolver.deduced[r][c] || 0);
      }
    }

    // Verify solver didn't produce conflicts
    const solverSolution = solve(solverGrid);
    const baseSolvable = solverSolution !== null;

    // Stress test: for each cell with candidates, try clearing some
    let imgClears = 0;
    let imgSolvable = 0;
    let imgUnsolved = 0;
    let imgRuleViolations = 0;

    // Test 1: Clear the TRUE value's other candidates one at a time
    for (const { r, c, trueVal, currentCands } of cellCandidates) {
      const others = currentCands.filter(v => v !== trueVal);
      if (others.length === 0) continue;

      for (const cand of others) {
        const testBoard = BoardState.fromOCR(ocr);
        const deleted = testBoard.applyClear(r, c, [cand]);

        if (deleted > 0) {
          imgClears++;
          applyIntuitiveChain(testBoard);

          // Validate sudoku rules after chain
          const ruleErr = validateSudokuRules(`清${cand}`, testBoard);
          if (ruleErr) {
            imgRuleViolations++;
            failures.push(`[${idx + 1}] ${cellLabel(r, c)} true=${trueVal}, 清${cand} → 规则违反: ${ruleErr}`);
            continue;
          }

          const testGrid: number[][] = [];
          for (let rr = 0; rr < 9; rr++) {
            testGrid.push([]);
            for (let cc = 0; cc < 9; cc++) {
              testGrid[rr].push(testBoard.givens[rr][cc] || testBoard.deduced[rr][cc] || 0);
            }
          }

          if (solve(testGrid)) {
            imgSolvable++;
          } else {
            imgUnsolved++;
            failures.push(`[${idx + 1}] ${cellLabel(r, c)} true=${trueVal}, 清${cand} → 无解!`);
          }
        }
      }
    }

    // Test 2: Clear multiple non-true candidates at once
    const multiTestCells = cellCandidates.filter(c => c.currentCands.filter(v => v !== c.trueVal).length >= 2);
    const shuffled = multiTestCells.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(shuffled.length, 10); i++) {
      const { r, c, trueVal, currentCands } = shuffled[i];
      const others = currentCands.filter(v => v !== trueVal);

      // Clear 2 random others
      const toClear = others.sort(() => Math.random() - 0.5).slice(0, 2);
      if (toClear.length < 2) continue;

      const testBoard = BoardState.fromOCR(ocr);
      const deleted = testBoard.applyClear(r, c, toClear);
      if (deleted === 0) continue;

      imgClears++;
      applyIntuitiveChain(testBoard);

      // Validate sudoku rules after chain
      const ruleErr2 = validateSudokuRules(`清[${toClear.join(",")}]`, testBoard);
      if (ruleErr2) {
        imgRuleViolations++;
        failures.push(`[${idx + 1}] ${cellLabel(r, c)} true=${trueVal}, 清[${toClear.join(",")}] → 规则违反: ${ruleErr2}`);
        continue;
      }

      const testGrid: number[][] = [];
      for (let rr = 0; rr < 9; rr++) {
        testGrid.push([]);
        for (let cc = 0; cc < 9; cc++) {
          testGrid[rr].push(testBoard.givens[rr][cc] || testBoard.deduced[rr][cc] || 0);
        }
      }

      if (solve(testGrid)) {
        imgSolvable++;
      } else {
        imgUnsolved++;
        failures.push(`[${idx + 1}] ${cellLabel(r, c)} true=${trueVal}, 清[${toClear.join(",")}] → 无解!`);
      }
    }

    console.log(`[${idx + 1}] ${candidateCells}候选格 | 基础${baseSolvable ? "√" : "✗"} | ${imgClears}次清数: ${imgSolvable}可解 ${imgUnsolved}无解 ${imgRuleViolations}违反规则`);
    totalClears += imgClears;
    totalSolvable += imgSolvable;
    totalUnsolved += imgUnsolved;
    totalRuleViolations += imgRuleViolations;
  }

  console.log(`\n=== 总计 ===`);
  console.log(`清数操作: ${totalClears} 次`);
  console.log(`保持有解: ${totalSolvable} (${(totalSolvable / Math.max(1, totalClears) * 100).toFixed(1)}%)`);
  console.log(`变为无解: ${totalUnsolved}`);
  console.log(`违反数独规则: ${totalRuleViolations}`);

  if (failures.length > 0) {
    console.log(`\n无解详情:`);
    for (const f of failures.slice(0, 30)) console.log(`  ${f}`);
    if (failures.length > 30) console.log(`  ...共${failures.length}条`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
