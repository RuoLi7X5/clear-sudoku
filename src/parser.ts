/**
 * 指令解析器
 *
 * 解析 !清数 后的参数，如 A59,B44
 *
 * 坐标系：行 A-I (上到下)，列 1-9 (左到右)
 *
 * 格式规则：
 * - A59       → A行5列，清候选数9
 * - A5(9)     → A行5列，清候选数9
 * - A5(59)    → A行5列，清候选数5和9
 * - A57(9)    → A行5列和7列，清候选数9
 * - AB59      → A行B行，5列，清候选数9
 * - ABC59     → A行B行C行，5列，清候选数9
 * - ABC57(9)  → A行B行C行，5列7列，清候选数9（笛卡尔积）
 * - A579      → 拒绝（≥3位数字无括号，模糊）
 */

export interface ClearOperation {
  /** 行索引 0-8 */
  row: number;
  /** 列索引 0-8 */
  col: number;
  /** 要清除的候选数 */
  candidates: number[];
}

export interface ClearInstruction {
  operations: ClearOperation[];
  /** 水印标签（#xxx 格式，如 #82-4、#421） */
  watermark?: string;
}

export interface ParseError {
  error: string;
}

const ROW_LABELS = "ABCDEFGHI";

function rowIndex(letter: string): number {
  return ROW_LABELS.indexOf(letter.toUpperCase());
}

function colIndex(digit: string): number {
  const n = parseInt(digit, 10);
  return n >= 1 && n <= 9 ? n - 1 : -1;
}

function parseClearGroup(group: string): ClearOperation[] | ParseError {
  const trimmed = group.trim();
  if (!trimmed) return { error: "空白的清数指令" };

  // 分离字母和数字
  const letters: string[] = [];
  const digits: string[] = [];
  let parenContent: string | null = null;

  // 检查是否有括号（兼容中英文括号）
  const parenMatch = trimmed.match(/^([^(（]+)[(（](\d+)[)）]$/);
  if (parenMatch) {
    // 有括号格式：ABC57(9)
    const beforeParen = parenMatch[1];
    parenContent = parenMatch[2];
    // 解析括号前的内容
    for (const ch of beforeParen) {
      if (/[a-zA-Z]/.test(ch)) {
        letters.push(ch);
      } else if (/\d/.test(ch)) {
        digits.push(ch);
      } else {
        return { error: `小仙不认识"${ch}"这个字符呢，请用字母A-I和数字1-9哦` };
      }
    }
  } else {
    // 无括号格式：A59, AB59, ABC59
    for (const ch of trimmed) {
      if (/[a-zA-Z]/.test(ch)) {
        letters.push(ch);
      } else if (/\d/.test(ch)) {
        digits.push(ch);
      } else {
        return { error: `小仙不认识"${ch}"这个字符呢，请用字母A-I和数字1-9哦` };
      }
    }
  }

  // 验证字母
  if (letters.length === 0) {
    return { error: "没有找到行号呢，需要A-I的字母表示行哦~" };
  }
  for (const letter of letters) {
    const ri = rowIndex(letter);
    if (ri < 0) {
      return { error: `"${letter}"不是有效的行号哦，行号只能是A-I~` };
    }
  }

  // 验证和解析数字
  if (parenContent !== null) {
    // 有括号：括号里的是候选数，括号前的是列号
    if (digits.length === 0) {
      return { error: "括号前需要有列号数字呢" };
    }
    const cols = digits.map(d => colIndex(d));
    for (let i = 0; i < cols.length; i++) {
      if (cols[i] < 0) {
        return { error: `"${digits[i]}"不是有效的列号，列号是1-9哦~` };
      }
    }
    const candidates = parenContent.split("").map(d => parseInt(d, 10));
    for (const cand of candidates) {
      if (cand < 1 || cand > 9) {
        return { error: `候选数必须是1-9的数字呢，小仙看不懂"${cand}"` };
      }
    }
    // 笛卡尔积：rows × cols
    const ops: ClearOperation[] = [];
    for (const l of letters) {
      for (const d of digits) {
        ops.push({
          row: rowIndex(l),
          col: colIndex(d),
          candidates: [...candidates],
        });
      }
    }
    return ops;
  } else {
    // 无括号：末尾1位是候选数，前面的是列号
    if (digits.length < 2) {
      return { error: `"${trimmed}"格式不够完整呢，至少需要列号+候选数，比如A59这样~` };
    }
    if (digits.length >= 3) {
      return {
        error: `"${trimmed}"里数字太多了分不清哪个是列哪个是候选数呢…试试用括号标明候选数吧，比如A57(9)这样~`,
      };
    }
    // digits.length === 2：最后一位是候选数，前面的是列号
    const candidateDigit = parseInt(digits[digits.length - 1], 10);
    if (candidateDigit < 1 || candidateDigit > 9) {
      return { error: `候选数必须是1-9的数字呢` };
    }
    const cols = digits.slice(0, -1).map(d => colIndex(d));
    for (let i = 0; i < cols.length; i++) {
      if (cols[i] < 0) {
        return { error: `"${digits[i]}"不是有效的列号，列号是1-9哦~` };
      }
    }
    // 笛卡尔积：rows × cols
    const ops: ClearOperation[] = [];
    for (const l of letters) {
      for (const d of digits.slice(0, -1)) {
        ops.push({
          row: rowIndex(l),
          col: colIndex(d),
          candidates: [candidateDigit],
        });
      }
    }
    return ops;
  }
}

/**
 * 解析完整的清数指令
 * @param text !清数 后面的全部文本
 * @returns 解析后的清除操作列表 + 可选水印标签，或错误信息
 */
export function parseCommand(text: string): ClearInstruction | ParseError {
  let trimmed = (text || "").trim();
  if (!trimmed) {
    return { error: `唔…小仙没看到要清什么数呢，格式是"!清数 A59,B44"这样哦~` };
  }

  // 提取末尾的水印标记（仅支持 #xxx 格式）
  let watermark: string | undefined;
  const wmMatch = trimmed.match(/\s+[#＃]\s*(\S+)$/);
  if (wmMatch) {
    const raw = wmMatch[1] || "";
    // 只保留数字和连字符
    const filtered = raw.replace(/[^\d\-a-zA-Z]/g, "");
    if (filtered.length > 0) watermark = filtered;
    trimmed = trimmed.slice(0, wmMatch.index!).trim();
  }

  if (!trimmed) {
    return { error: `唔…小仙没看到要清什么数呢，格式是"!清数 A59,B44"这样哦~` };
  }

  const groups = trimmed.split(/[,，]/);
  const allOps: ClearOperation[] = [];

  for (const group of groups) {
    const result = parseClearGroup(group.trim());
    if ("error" in result) {
      return result;
    }
    allOps.push(...(result as ClearOperation[]));
  }

  if (allOps.length === 0) {
    return { error: "小仙没有解析到任何有效的清数操作呢…" };
  }

  // 合并重复的 (row, col) 操作：去重 + 合并候选数
  const merged = new Map<string, ClearOperation>();
  for (const op of allOps) {
    const key = `${op.row},${op.col}`;
    if (merged.has(key)) {
      const existing = merged.get(key)!;
      const candSet = new Set([...existing.candidates, ...op.candidates]);
      existing.candidates = [...candSet].sort();
    } else {
      merged.set(key, { ...op, candidates: [...op.candidates] });
    }
  }

  return { operations: [...merged.values()], watermark };
}
