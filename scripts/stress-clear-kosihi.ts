/**
 * 模拟 Koishi 完整清数流程压力测试
 * 覆盖：指令解析 → 清数 → 求解链 → 规则验证 → 回溯验证
 */
import { readFileSync, existsSync } from "fs";
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

function solve(grid: number[][]): number[][] | null {
  const board = grid.map(row => [...row]);
  function isValid(r: number, c: number, v: number): boolean {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === v || board[i][c] === v) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (board[br + dr][bc + dc] === v) return false;
    return true;
  }
  function bt(): boolean {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (board[r][c] === 0) {
          for (let v = 1; v <= 9; v++)
            if (isValid(r, c, v)) { board[r][c] = v; if (bt()) return true; board[r][c] = 0; }
          return false;
        }
    return true;
  }
  return bt() ? board : null;
}

function answerGrid(s: string): number[][] {
  const g: number[][] = [];
  for (let r = 0; r < 9; r++) {
    g.push([]);
    for (let c = 0; c < 9; c++) g[r].push(parseInt(s[r * 9 + c]));
  }
  return g;
}

function cellLabel(r: number, c: number): string {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function validateBoard(board: any): string | null {
  const g = board.givens, d = board.deduced;
  for (let r = 0; r < 9; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < 9; c++) {
      const v = g[r][c] || d[r][c] || 0;
      if (v > 0 && seen.has(v)) return `R${r+1} dup ${v}`;
      if (v > 0) seen.add(v);
    }
  }
  for (let c = 0; c < 9; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < 9; r++) {
      const v = g[r][c] || d[r][c] || 0;
      if (v > 0 && seen.has(v)) return `C${c+1} dup ${v}`;
      if (v > 0) seen.add(v);
    }
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const seen = new Set<number>();
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) {
          const v = g[br+dr][bc+dc] || d[br+dr][bc+dc] || 0;
          if (v > 0 && seen.has(v)) return `B${Math.floor(br/3)*3+Math.floor(bc/3)+1} dup ${v}`;
          if (v > 0) seen.add(v);
        }
    }
  }
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      if (g[r][c] || d[r][c]) continue;
      for (const cand of board.candidates[r][c]) {
        for (let cc = 0; cc < 9; cc++)
          if (cc !== c && (g[r][cc] === cand || d[r][cc] === cand))
            return `${cellLabel(r,c)} cand ${cand} conflicts row ${cellLabel(r,cc)}`;
        for (let rr = 0; rr < 9; rr++)
          if (rr !== r && (g[rr][c] === cand || d[rr][c] === cand))
            return `${cellLabel(r,c)} cand ${cand} conflicts col ${cellLabel(rr,c)}`;
        const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
        for (let dr = 0; dr < 3; dr++)
          for (let dc = 0; dc < 3; dc++)
            if (g[br+dr][bc+dc] === cand || d[br+dr][bc+dc] === cand)
              return `${cellLabel(r,c)} cand ${cand} conflicts box`;
      }
    }
  return null;
}

function buildGrid(board: any): number[][] {
  const g: number[][] = [];
  for (let r = 0; r < 9; r++) {
    g.push([]);
    for (let c = 0; c < 9; c++)
      g[r].push(board.givens[r][c] || board.deduced[r][c] || 0);
  }
  return g;
}

async function main() {
  const { parseCommand } = require("../lib/parser");
  const { BoardState } = require("../lib/board");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { applyIntuitiveChain } = require("../lib/solver-chain");

  preloadTemplates();
  const IMG_DIR = join(__dirname, "..", "..", "..", "images");
  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  console.log("=== Koishi 完整清数流程压力测试 ===\n");

  let totalClears = 0, totalSolvable = 0, totalUnsolved = 0, totalViolations = 0;
  const failures: string[] = [];

  for (let idx = 0; idx < 20; idx++) {
    const imgPath = join(IMG_DIR, `${idx + 1}.png`);
    if (!existsSync(imgPath)) continue;

    const sol = solve(answerGrid(ANSWERS[idx]))!;
    const buf = readFileSync(imgPath);
    const ocr = await recognizeBoard(buf, logger);
    const baseBoard = BoardState.fromOCR(ocr);

    // Verify base board is valid
    const baseErr = validateBoard(baseBoard);
    const baseSolvable = solve(buildGrid(baseBoard)) !== null;

    // Collect candidate cells with their true values
    type CellInfo = { r: number; c: number; trueVal: number; cands: number[] };
    const cells: CellInfo[] = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const v = baseBoard.givens[r][c] || baseBoard.deduced[r][c];
        if (v > 0 && v !== sol[r][c]) {
          console.log(`[${idx+1}] WARN: OCR ${cellLabel(r,c)}=${v}, true=${sol[r][c]}`);
        }
        if (v === 0) {
          const cands = [...baseBoard.candidates[r][c]].sort((a,b)=>a-b);
          if (cands.length > 0) cells.push({ r, c, trueVal: sol[r][c], cands });
        }
      }

    // Generate clear commands: for each cell, clear non-true candidates
    // Test single-candidate clears
    let imgClears = 0, imgSolvable = 0, imgUnsolved = 0, imgViolations = 0;

    for (const cell of cells) {
      const others = cell.cands.filter(v => v !== cell.trueVal);
      for (const cand of others) {
        // Build full Koishi command text
        const cmdText = `${cellLabel(cell.r, cell.c)}(${cand})`;
        const parsed = parseCommand(cmdText);

        if ("error" in parsed) {
          failures.push(`[${idx+1}] PARSE FAIL: "${cmdText}" → ${parsed.error}`);
          continue;
        }

        // Clone board and simulate index.ts flow
        const board = BoardState.fromOCR(ocr);

        // Step: apply clears (same as index.ts Step 6)
        let deleted = 0;
        for (const op of parsed.operations) {
          if (!board.isResolved(op.row, op.col))
            deleted += board.applyClear(op.row, op.col, op.candidates);
        }
        if (deleted === 0) continue;

        imgClears++;

        // Step: apply intuitive chain (same as index.ts Step 7)
        applyIntuitiveChain(board);

        // Validate
        const ruleErr = validateBoard(board);
        if (ruleErr) {
          imgViolations++;
          failures.push(`[${idx+1}] "${cmdText}" → RULE: ${ruleErr}`);
          continue;
        }

        const grid = buildGrid(board);
        if (solve(grid)) {
          imgSolvable++;
        } else {
          imgUnsolved++;
          failures.push(`[${idx+1}] "${cmdText}" → UNSOLVABLE (true=${cell.trueVal})`);
        }
      }
    }

    // Multi-candidate clears: random 2 non-true candidates
    const multiCells = cells.filter(c => c.cands.filter(v => v !== c.trueVal).length >= 2);
    for (const cell of multiCells.sort(() => Math.random() - 0.5).slice(0, 8)) {
      const others = cell.cands.filter(v => v !== cell.trueVal)
        .sort(() => Math.random() - 0.5).slice(0, 2);
      if (others.length < 2) continue;

      const cmdText = `${cellLabel(cell.r, cell.c)}(${others.join("")})`;
      const parsed = parseCommand(cmdText);
      if ("error" in parsed) continue;

      const board = BoardState.fromOCR(ocr);
      let deleted = 0;
      for (const op of parsed.operations)
        if (!board.isResolved(op.row, op.col))
          deleted += board.applyClear(op.row, op.col, op.candidates);
      if (deleted === 0) continue;

      imgClears++;
      applyIntuitiveChain(board);

      const ruleErr = validateBoard(board);
      if (ruleErr) {
        imgViolations++;
        failures.push(`[${idx+1}] "${cmdText}" → RULE: ${ruleErr}`);
        continue;
      }

      if (solve(buildGrid(board))) imgSolvable++;
      else {
        imgUnsolved++;
        failures.push(`[${idx+1}] "${cmdText}" → UNSOLVABLE (true=${cell.trueVal})`);
      }
    }

    console.log(`[${idx+1}] base=${baseSolvable?"√":"✗"}${baseErr?" RULE_ERR":""} | ${imgClears}清数: ${imgSolvable}解 ${imgUnsolved}无解 ${imgViolations}违规`);
    totalClears += imgClears; totalSolvable += imgSolvable;
    totalUnsolved += imgUnsolved; totalViolations += imgViolations;
  }

  console.log(`\n=== ${totalClears}次清数 ===`);
  console.log(`有解: ${totalSolvable} (${(totalSolvable/Math.max(1,totalClears)*100).toFixed(1)}%)`);
  console.log(`无解: ${totalUnsolved}  违规: ${totalViolations}`);

  if (failures.length > 0) {
    console.log(`\n问题详情 (前30条):`);
    for (const f of failures.slice(0, 30)) console.log(`  ${f}`);
    if (failures.length > 30) console.log(`  ...共${failures.length}条`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
