/**
 * BoardState - 数独盘面状态管理
 *
 * 坐标系：行 A-I (0-8)，列 1-9 (0-8)
 * givens  = 已知数（黑色，不可变）
 * deduced = 出数（蓝色，由推理得出）
 * candidates = 候选数集
 */

export interface OCRCell {
  /** 该格的值（0=无确定值） */
  value: number;
  /** 是已知数(given)还是出数(deduced) */
  type: "given" | "deduced" | "none";
  /** 候选数集（仅对未确定格有效） */
  candidates: number[];
}

export interface OCRResult {
  /** 9x9 网格识别结果 */
  cells: OCRCell[][];
  /** 每个单元格的识别置信度 0-1 */
  confidence: number[][];
  /** 水印标签（从图片底部红色水印检测，如 "82-4"、"421"） */
  watermark?: string;
}

export class BoardState {
  readonly givens: number[][];
  deduced: number[][];
  candidates: Array<Array<Set<number>>>;
  watermark?: string;

  constructor(
    givens: number[][],
    deduced: number[][],
    candidates: Array<Array<Set<number>>>,
    watermark?: string,
  ) {
    this.givens = givens;
    this.deduced = deduced;
    this.candidates = candidates;
    this.watermark = watermark;
  }

  /** 从OCR结果创建BoardState */
  static fromOCR(ocr: OCRResult): BoardState {
    const givens: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const deduced: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
    const candidates: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set<number>()),
    );

    // 第一步：提取已知数和出数
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = ocr.cells[r][c];
        if (cell.value > 0) {
          if (cell.type === "given") {
            givens[r][c] = cell.value;
          } else if (cell.type === "deduced") {
            deduced[r][c] = cell.value;
          }
        }
      }
    }

    // 第二步：从已知数+出数计算标准候选数消除
    const standardCands = BoardState.computeStandardCandidates(givens, deduced);

    // 第三步：对未确定格，将OCR识别的候选数与标准候选数取交集
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (givens[r][c] !== 0 || deduced[r][c] !== 0) {
          // 已确定格：候选数就是它自己
          candidates[r][c] = new Set([givens[r][c] || deduced[r][c]]);
        } else {
          const ocrCands = new Set(ocr.cells[r][c].candidates);
          const stdCands = standardCands[r][c];
          if (ocrCands.size > 0) {
            // OCR有识别结果：与标准消除取交集
            for (const v of stdCands) {
              if (ocrCands.has(v)) {
                candidates[r][c].add(v);
              }
            }
          } else {
            // OCR无候选数：直接用标准消除结果
            candidates[r][c] = new Set(stdCands);
          }
        }
      }
    }

    return new BoardState(givens, deduced, candidates, ocr.watermark);
  }

  /** 仅从已完成格（已知+出数）计算标准候选数 */
  static computeStandardCandidates(
    givens: number[][],
    deduced: number[][],
  ): Array<Array<Set<number>>> {
    const cands: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])),
    );

    // 对于每个已确定的格，从同行/列/宫的空格中消除该值
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = givens[r][c] || deduced[r][c];
        if (val === 0) continue;
        // 已确定格自身只保留该值
        cands[r][c] = new Set([val]);
        // 同行消除
        for (let cc = 0; cc < 9; cc++) {
          if (cc !== c) cands[r][cc].delete(val);
        }
        // 同列消除
        for (let rr = 0; rr < 9; rr++) {
          if (rr !== r) cands[rr][c].delete(val);
        }
        // 同宫消除
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let dr = 0; dr < 3; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const rr = br + dr, cc = bc + dc;
            if (rr !== r || cc !== c) cands[rr][cc].delete(val);
          }
        }
      }
    }

    return cands;
  }

  /** 获取某格的所有确定值（已知数优先，其次出数） */
  getValue(r: number, c: number): number {
    return this.givens[r][c] || this.deduced[r][c] || 0;
  }

  /** 某格是否已确定（已知数或已出数） */
  isResolved(r: number, c: number): boolean {
    return this.getValue(r, c) !== 0;
  }

  /** 删除指定格子的候选数，返回实际被删除的数量 */
  applyClear(r: number, c: number, clearCands: number[]): number {
    if (this.isResolved(r, c)) return 0;
    let deleted = 0;
    for (const v of clearCands) {
      if (this.candidates[r][c].delete(v)) deleted++;
    }
    return deleted;
  }

  /**
   * 确定一格的值（出数），并消除同行/列/宫中其他格的该候选数。
   * 只用于 deduced（蓝色出数），不修改 givens。
   * 返回受影响的同行/列/宫空格数量。
   */
  /**
   * 检查在(r,c)填入value是否会与同行/列/宫已确定值冲突
   */
  conflictsWithPeers(r: number, c: number, value: number): boolean {
    for (let cc = 0; cc < 9; cc++)
      if (cc !== c && this.getValue(r, cc) === value) return true;
    for (let rr = 0; rr < 9; rr++)
      if (rr !== r && this.getValue(rr, c) === value) return true;
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if ((br + dr !== r || bc + dc !== c) && this.getValue(br + dr, bc + dc) === value) return true;
    return false;
  }

  assignCell(r: number, c: number, value: number): number {
    if (this.getValue(r, c) !== 0) return 0;
    // 拒绝与已确定值冲突的赋值
    if (this.conflictsWithPeers(r, c, value)) return 0;
    this.deduced[r][c] = value;
    this.candidates[r][c] = new Set([value]);
    let affected = 0;
    // 同行
    for (let cc = 0; cc < 9; cc++) {
      if (cc !== c && this.candidates[r][cc].delete(value)) affected++;
    }
    // 同列
    for (let rr = 0; rr < 9; rr++) {
      if (rr !== r && this.candidates[rr][c].delete(value)) affected++;
    }
    // 同宫
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const rr = br + dr, cc = bc + dc;
        if ((rr !== r || cc !== c) && this.candidates[rr][cc].delete(value)) affected++;
      }
    }
    return affected;
  }

  /** 查找所有 Naked Single（候选数只剩1个的格），返回 [{r,c,value}] */
  findNakedSingles(): Array<{ r: number; c: number; value: number }> {
    const result: Array<{ r: number; c: number; value: number }> = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.isResolved(r, c) && this.candidates[r][c].size === 1) {
          const [value] = this.candidates[r][c];
          result.push({ r, c, value });
        }
      }
    }
    return result;
  }

  /** 深拷贝 */
  clone(): BoardState {
    const newCands: Array<Array<Set<number>>> = Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => new Set(this.candidates[r][c])),
    );
    return new BoardState(
      this.givens.map(row => [...row]),
      this.deduced.map(row => [...row]),
      newCands,
      this.watermark,
    );
  }

  /** 调试用：打印盘面 */
  debug(): string {
    const lines: string[] = [];
    for (let r = 0; r < 9; r++) {
      const parts: string[] = [];
      for (let c = 0; c < 9; c++) {
        const v = this.getValue(r, c);
        if (v > 0) {
          const tag = this.givens[r][c] ? "G" : "D";
          parts.push(`${v}${tag}`.padEnd(4));
        } else {
          const candsStr = [...this.candidates[r][c]].sort().join("");
          parts.push(candsStr.padEnd(4));
        }
      }
      lines.push(parts.join("|"));
      if (r === 2 || r === 5) lines.push("─".repeat(40));
    }
    return lines.join("\n");
  }
}
