/**
 * 测试第421题的清数指令
 */
import { readFileSync } from "fs";
import { join } from "path";

function solve(grid: number[][]): number[][] | null {
  const board = grid.map(row => [...row]);
  function isValid(r: number, c: number, v: number): boolean {
    for (let i = 0; i < 9; i++)
      if (board[r][i] === v || board[i][c] === v) return false;
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++)
      if (board[br+dr][bc+dc]===v) return false;
    return true;
  }
  function bt(): boolean {
    for (let r=0;r<9;r++) for (let c=0;c<9;c++)
      if (board[r][c]===0) {
        for (let v=1;v<=9;v++)
          if (isValid(r,c,v)) { board[r][c]=v; if (bt()) return true; board[r][c]=0; }
        return false;
      }
    return true;
  }
  return bt() ? board : null;
}

function validateBoard(board: any): string | null {
  const g = board.givens, d = board.deduced;
  for (let r=0;r<9;r++) {
    const seen=new Set<number>();
    for (let c=0;c<9;c++) {
      const v=g[r][c]||d[r][c]||0;
      if(v>0&&seen.has(v)) return `R${r+1} dup ${v}`;
      if(v>0) seen.add(v);
    }
  }
  for (let c=0;c<9;c++) {
    const seen=new Set<number>();
    for (let r=0;r<9;r++) {
      const v=g[r][c]||d[r][c]||0;
      if(v>0&&seen.has(v)) return `C${c+1} dup ${v}`;
      if(v>0) seen.add(v);
    }
  }
  for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3) {
    const seen=new Set<number>();
    for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++) {
      const v=g[br+dr][bc+dc]||d[br+dr][bc+dc]||0;
      if(v>0&&seen.has(v)) return `B${Math.floor(br/3)*3+Math.floor(bc/3)+1} dup ${v}`;
      if(v>0) seen.add(v);
    }
  }
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    if(g[r][c]||d[r][c]) continue;
    for (const cand of board.candidates[r][c]) {
      for (let cc=0;cc<9;cc++) if(cc!==c&&(g[r][cc]===cand||d[r][cc]===cand))
        return `${String.fromCharCode(65+r)}${c+1} cand${cand} conflict row`;
      for (let rr=0;rr<9;rr++) if(rr!==r&&(g[rr][c]===cand||d[rr][c]===cand))
        return `${String.fromCharCode(65+r)}${c+1} cand${cand} conflict col`;
    }
  }
  return null;
}

function buildGrid(board: any): number[][] {
  const g: number[][] = [];
  for (let r=0;r<9;r++) {
    g.push([]);
    for (let c=0;c<9;c++) g[r].push(board.givens[r][c]||board.deduced[r][c]||0);
  }
  return g;
}

function cellLabel(r:number,c:number):string { return `${String.fromCharCode(65+r)}${c+1}`; }

async function main() {
  const { parseCommand } = require("../lib/parser");
  const { BoardState } = require("../lib/board");
  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  const { applyIntuitiveChain } = require("../lib/solver-chain");

  preloadTemplates();
  const logger = { info:()=>{}, debug:()=>{}, warn:()=>{}, error:()=>{} };

  // OCR image 421
  console.log("=== 测试第421题 ===\n");
  const buf = readFileSync(join(__dirname,"..","..","..","images","421.png"));
  const ocr = await recognizeBoard(buf, logger);
  const board = BoardState.fromOCR(ocr);

  // Show initial state
  let resolved=0, candCells=0;
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    if (board.givens[r][c]||board.deduced[r][c]) resolved++;
    else if (board.candidates[r][c].size>0) candCells++;
  }
  console.log(`OCR结果: ${resolved}已填格, ${candCells}候选格\n`);

  // Print initial board
  console.log("初始盘面:");
  for (let r=0;r<9;r++) {
    let line = `${String.fromCharCode(65+r)} `;
    for (let c=0;c<9;c++) {
      const v = board.givens[r][c]||board.deduced[r][c];
      if (v>0) {
        const tag = board.givens[r][c]?"G":"D";
        line += `${v}${tag}`.padEnd(4);
      } else {
        const cs = [...board.candidates[r][c]].sort((a,b)=>a-b).join("");
        line += (cs||"·").padEnd(4);
      }
      if (c===2||c===5) line += "│";
    }
    console.log(line);
    if (r===2||r===5) console.log("  ────────┼────────┼────────");
  }
  console.log();

  // Base validation
  const baseErr = validateBoard(board);
  const baseGrid = buildGrid(board);
  const baseSolvable = solve(baseGrid) !== null;
  console.log(`基础盘面: 规则${baseErr?"违规:"+baseErr:"√"}, 可解性${baseSolvable?"√":"✗"}`);

  // Apply clear command: C1(68),C28
  const cmdText = "C1(68),C28";
  console.log(`\n清数指令: ${cmdText}`);

  const parsed = parseCommand(cmdText);
  if ("error" in parsed) {
    console.log(`解析失败: ${parsed.error}`);
    return;
  }
  console.log(`解析结果: ${parsed.operations.map(o=>`${cellLabel(o.row,o.col)}清[${o.candidates.join(",")}]`).join(", ")}`);

  // Apply clears
  let totalDeleted = 0;
  for (const op of parsed.operations) {
    if (!board.isResolved(op.row, op.col)) {
      const deleted = board.applyClear(op.row, op.col, op.candidates);
      console.log(`  ${cellLabel(op.row,op.col)} 清除 [${op.candidates.join(",")}]: 实际删除${deleted}个`);
      totalDeleted += deleted;
    } else {
      console.log(`  ${cellLabel(op.row,op.col)} 已确定, 跳过`);
    }
  }

  if (totalDeleted === 0) {
    console.log("没有可清除的候选数");
    return;
  }

  // Apply solver chain
  console.log(`\n运行直观技巧链...`);
  const chainResult = applyIntuitiveChain(board);
  if (chainResult.descriptions.length > 0) {
    console.log(`推导步骤 (${chainResult.descriptions.length}):`);
    for (const d of chainResult.descriptions) console.log(`  ${d}`);
  }
  if (chainResult.newResolutions.length > 0) {
    console.log(`新出数 (${chainResult.newResolutions.length}):`);
    for (const r of chainResult.newResolutions)
      console.log(`  ${cellLabel(r.row,r.col)}=${r.value}`);
  }

  // Print result board
  console.log("\n清数后盘面:");
  for (let r=0;r<9;r++) {
    let line = `${String.fromCharCode(65+r)} `;
    for (let c=0;c<9;c++) {
      const v = board.givens[r][c]||board.deduced[r][c];
      if (v>0) {
        const tag = board.givens[r][c]?"G":"D";
        line += `${v}${tag}`.padEnd(4);
      } else {
        const cs = [...board.candidates[r][c]].sort((a,b)=>a-b).join("");
        line += (cs||"·").padEnd(4);
      }
      if (c===2||c===5) line += "│";
    }
    console.log(line);
    if (r===2||r===5) console.log("  ────────┼────────┼────────");
  }

  // Final validation
  const ruleErr = validateBoard(board);
  const finalGrid = buildGrid(board);
  const finalSolvable = solve(finalGrid) !== null;

  let finalResolved = 0;
  for (let r=0;r<9;r++) for (let c=0;c<9;c++)
    if (board.givens[r][c]||board.deduced[r][c]) finalResolved++;

  console.log(`\n=== 结果 ===`);
  console.log(`已填格: ${resolved} → ${finalResolved} (+${finalResolved-resolved})`);
  console.log(`数独规则: ${ruleErr?"违规: "+ruleErr:"√"}`);
  console.log(`回溯可解: ${finalSolvable?"√ (有解)":"✗ (无解!)"}`);
}

main().catch(e=>{console.error(e);process.exit(1);});
