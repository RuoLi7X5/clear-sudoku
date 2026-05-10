/**
 * solver-chain.ts - L1-L3 直观技巧链式求解
 *
 * 改编自 sudoku-bot/src/solver.ts，仅保留 L1-L3 技巧：
 *  L1: 隐性唯余-宫/行/列 (Hidden Single)
 *  L2: 区块排除 (Pointing)
 *  L3: 显性唯余 (Naked Single)、显性数对/数组 (Naked Pair/Triple)、
 *       隐性数对/数组 (Hidden Pair/Triple)
 *
 * 对全盘迭代应用上述技巧，直到无新进展。
 */

import { BoardState } from "./board";

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChainResult {
  progressed: boolean;
  newResolutions: Array<{ row: number; col: number; value: number }>;
  descriptions: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════════

function rowLabel(r: number): string {
  return String.fromCharCode(65 + r); // A-I
}

function cellLabel(r: number, c: number): string {
  return `${rowLabel(r)}${c + 1}`;
}

function sortedArr(s: Set<number> | number[]): number[] {
  return (s instanceof Set ? [...s] : [...s]).sort((a, b) => a - b);
}

function boxOrigin(r: number, c: number): [number, number] {
  return [Math.floor(r / 3) * 3, Math.floor(c / 3) * 3];
}

function boxNumber(r: number, c: number): number {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
}

function boxCellList(r: number, c: number): Array<[number, number]> {
  const [br, bc] = boxOrigin(r, c);
  const cells: Array<[number, number]> = [];
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      cells.push([br + dr, bc + dc]);
    }
  }
  return cells;
}

/** 全部27个单元（9行 + 9列 + 9宫） */
function getAllUnits(): Array<{ name: string; cells: Array<[number, number]> }> {
  const units: Array<{ name: string; cells: Array<[number, number]> }> = [];
  for (let i = 0; i < 9; i++) {
    units.push({ name: `第${rowLabel(i)}行`, cells: Array.from({ length: 9 }, (_, c) => [i, c] as [number, number]) });
    units.push({ name: `第${i + 1}列`, cells: Array.from({ length: 9 }, (_, r) => [r, i] as [number, number]) });
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      units.push({ name: `第${boxNumber(br, bc)}宫`, cells: boxCellList(br, bc) });
    }
  }
  return units;
}

function combinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, size - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, size);
  return [...withFirst, ...withoutFirst];
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1: Hidden Single (隐性唯余)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 在某单元中查找候选数v仅出现在唯一个未确定格的情况。
 */
function findHiddenSingleInUnit(
  board: BoardState,
  unitCells: Array<[number, number]>,
): { r: number; c: number; v: number } | null {
  const vPos = new Map<number, Array<[number, number]>>();
  for (const [r, c] of unitCells) {
    if (board.getValue(r, c) !== 0) continue;
    for (const v of board.candidates[r][c]) {
      if (!vPos.has(v)) vPos.set(v, []);
      vPos.get(v)!.push([r, c]);
    }
  }
  for (const [v, positions] of vPos) {
    if (positions.length === 1) {
      const [r, c] = positions[0];
      if (board.candidates[r][c].size > 1) {
        return { r, c, v };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// L2: Pointing (区块排除)
// ═══════════════════════════════════════════════════════════════════════════════

interface PointingResult {
  desc: string;
  elimCells: Array<[number, number]>;
}

function applyPointingPairs(board: BoardState): PointingResult | null {
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      for (let v = 1; v <= 9; v++) {
        const rows = new Set<number>();
        const cols = new Set<number>();
        const cells: Array<[number, number]> = [];
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const r = br + dr, c = bc + dc;
            if (board.getValue(r, c) === 0 && board.candidates[r][c].has(v)) {
              rows.add(r);
              cols.add(c);
              cells.push([r, c]);
            }
          }
        }
        if (cells.length < 2) continue;
        const bNum = boxNumber(br, bc);

        // 同一行：从该行宫外的格删除v
        if (rows.size === 1) {
          const row = [...rows][0];
          const elimCells: Array<[number, number]> = [];
          for (let c = 0; c < 9; c++) {
            if ((c < bc || c >= bc + 3) && board.getValue(row, c) === 0 && board.candidates[row][c].delete(v)) {
              elimCells.push([row, c]);
            }
          }
          if (elimCells.length > 0) {
            return {
              desc: `第${bNum}宫数字${v}仅限第${rowLabel(row)}行 → 该行宫外${elimCells.length}格排除${v}`,
              elimCells,
            };
          }
        }

        // 同一列：从该列宫外的格删除v
        if (cols.size === 1) {
          const col = [...cols][0];
          const elimCells: Array<[number, number]> = [];
          for (let r = 0; r < 9; r++) {
            if ((r < br || r >= br + 3) && board.getValue(r, col) === 0 && board.candidates[r][col].delete(v)) {
              elimCells.push([r, col]);
            }
          }
          if (elimCells.length > 0) {
            return {
              desc: `第${bNum}宫数字${v}仅限第${col + 1}列 → 该列宫外${elimCells.length}格排除${v}`,
              elimCells,
            };
          }
        }
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// L3: Naked Set (显性数对/数组)
// ═══════════════════════════════════════════════════════════════════════════════

interface SetResult {
  desc: string;
  elimCells: Array<[number, number]>;
}

function applyNakedSet(
  board: BoardState,
  unitCells: Array<[number, number]>,
  setSize: 2 | 3,
): SetResult | null {
  const candidates = unitCells
    .filter(([r, c]) => {
      return board.getValue(r, c) === 0 &&
        board.candidates[r][c].size >= 2 &&
        board.candidates[r][c].size <= setSize;
    })
    .map(([r, c]) => ({ r, c, vals: sortedArr(board.candidates[r][c]) }));

  const combos = combinations(candidates, setSize);
  for (const combo of combos) {
    const union = new Set<number>();
    for (const cell of combo) cell.vals.forEach((v) => union.add(v));
    if (union.size !== setSize) continue;

    // 从同单元其他格中消除这些值
    const vals = [...union].sort((a, b) => a - b);
    const elimCells: Array<[number, number]> = [];
    for (const [r, c] of unitCells) {
      if (combo.some((x) => x.r === r && x.c === c)) continue;
      if (board.getValue(r, c) !== 0) continue;
      let changed = false;
      for (const v of vals) {
        if (board.candidates[r][c].delete(v)) changed = true;
      }
      if (changed) elimCells.push([r, c]);
    }
    if (elimCells.length > 0) {
      const cellNames = combo.map((x) => cellLabel(x.r, x.c)).join(",");
      const typeName = setSize === 2 ? "显性数对" : "显性数组";
      return {
        desc: `${cellNames}=[${vals.join(",")}](${typeName}) → 排除${elimCells.length}格`,
        elimCells,
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// L3: Hidden Set (隐性数对/数组)
// ═══════════════════════════════════════════════════════════════════════════════

function applyHiddenSet(
  board: BoardState,
  unitCells: Array<[number, number]>,
  setSize: 2 | 3,
): SetResult | null {
  // 统计每个候选数在本单元中出现的格子
  const vPos = new Map<number, Array<[number, number]>>();
  for (const [r, c] of unitCells) {
    if (board.getValue(r, c) !== 0) continue;
    for (const v of board.candidates[r][c]) {
      if (!vPos.has(v)) vPos.set(v, []);
      vPos.get(v)!.push([r, c]);
    }
  }

  // 筛选出出现次数在 2 到 setSize 之间的候选数
  const candidates = [...vPos.entries()]
    .filter(([, pos]) => pos.length >= 2 && pos.length <= setSize)
    .map(([v, pos]) => ({ v, pos }));

  const combos = combinations(candidates, setSize);
  for (const combo of combos) {
    // 检查这 setSize 个候选数是否共享相同的 setSize 个格子
    const allCells = new Map<string, [number, number]>();
    for (const { pos } of combo) {
      for (const [r, c] of pos) {
        allCells.set(`${r},${c}`, [r, c]);
      }
    }
    if (allCells.size !== setSize) continue;

    // 清除这些格中不属于该组的候选数
    const keepVals = new Set(combo.map((x) => x.v));
    const elimCells: Array<[number, number]> = [];
    for (const [r, c] of allCells.values()) {
      let changed = false;
      for (const v of [...board.candidates[r][c]]) {
        if (!keepVals.has(v)) {
          board.candidates[r][c].delete(v);
          changed = true;
        }
      }
      if (changed) elimCells.push([r, c]);
    }
    if (elimCells.length > 0) {
      const vals = combo.map((x) => x.v).sort((a, b) => a - b);
      const cellNames = [...allCells.values()].map(([r, c]) => cellLabel(r, c)).join(",");
      const typeName = setSize === 2 ? "隐性数对" : "隐性数组";
      return {
        desc: `数字${vals.join(",")}仅限${cellNames}(${typeName}) → 清除${elimCells.length}格多余候选`,
        elimCells,
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main: L1-L3 Intuitive Chain
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_ITERATIONS = 200;

/**
 * 对全盘应用L1-L3直观技巧，迭代直到无新进展。
 * 会原地修改 board。
 */
export function applyIntuitiveChain(board: BoardState): ChainResult {
  const newResolutions: Array<{ row: number; col: number; value: number }> = [];
  const descriptions: string[] = [];
  const units = getAllUnits();

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let madeProgress = false;

    // --- 1. Naked Single (显性唯余) ---
    const nakedSingles = board.findNakedSingles();
    for (const { r, c, value } of nakedSingles) {
      const affected = board.assignCell(r, c, value);
      if (affected > 0) {
        newResolutions.push({ row: r, col: c, value });
        descriptions.push(`${cellLabel(r, c)}=${value}(唯余)`);
        madeProgress = true;
      }
    }

    // --- 2. Hidden Single (隐性唯余，所有27个单元) ---
    for (const unit of units) {
      const hs = findHiddenSingleInUnit(board, unit.cells);
      if (hs) {
        const affected = board.assignCell(hs.r, hs.c, hs.v);
        if (affected > 0) {
          newResolutions.push({ row: hs.r, col: hs.c, value: hs.v });
          descriptions.push(`${cellLabel(hs.r, hs.c)}=${hs.v}(排除/${unit.name})`);
          madeProgress = true;
        }
        break; // 一次只做一个，让naked single有机会被触发
      }
    }

    // --- 3. Pointing (区块排除) — 逐次应用，每次一个指向对 ---
    for (let p = 0; p < 9; p++) {
      const pointing = applyPointingPairs(board);
      if (pointing) {
        descriptions.push(pointing.desc);
        madeProgress = true;
      } else {
        break; // 无更多指向对
      }
    }

    // --- 4. Naked Set (显性数对/数组，27个单元) ---
    for (const setSize of [2, 3] as const) {
      for (const unit of units) {
        const ns = applyNakedSet(board, unit.cells, setSize);
        if (ns) {
          descriptions.push(`${unit.name}: ${ns.desc}`);
          madeProgress = true;
        }
      }
    }

    // --- 5. Hidden Set (隐性数对/数组，27个单元) ---
    for (const setSize of [2, 3] as const) {
      for (const unit of units) {
        const hs = applyHiddenSet(board, unit.cells, setSize);
        if (hs) {
          descriptions.push(`${unit.name}: ${hs.desc}`);
          madeProgress = true;
        }
      }
    }

    if (!madeProgress) break;
  }

  return {
    progressed: newResolutions.length > 0 || descriptions.length > 0,
    newResolutions,
    descriptions,
  };
}
