/**
 * ocr.ts - 数独盘面 OCR 识别管线（纯 JS，不依赖 Canvas）
 *
 * 流程：
 *  1. 用 pngjs 解码图片为 RGBA 像素
 *  2. 检测网格线（水平 + 垂直）
 *  3. 分割 81 个单元格
 *  4. 对每个单元格：模板匹配大数字 → 模板匹配候选数 → 空格
 *
 * 依赖：pngjs（像素解码）、内置 NCC 模板匹配（零外部依赖）
 */

import { OCRResult, OCRCell } from "./board";
import { matchBigDigit, matchSmallDigit, matchWatermarkChar, matchWatermarkDigit, preloadTemplates, getFontFamilies } from "./template-match";

// ── 图片解码（pngjs，零原生依赖）────────────────────────────────────────────────

function decodeImage(imageBuf: Buffer): { data: Uint8Array; width: number; height: number } {
  // PNG
  if (imageBuf[0] === 0x89 && imageBuf[1] === 0x50 && imageBuf[2] === 0x4E && imageBuf[3] === 0x47) {
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(imageBuf);
    return { data: png.data, width: png.width, height: png.height };
  }

  // JPEG
  if (imageBuf[0] === 0xFF && imageBuf[1] === 0xD8) {
    const jpeg = require("jpeg-js");
    const raw = jpeg.decode(imageBuf, { useTArray: true });
    return { data: raw.data, width: raw.width, height: raw.height };
  }

  throw new Error("图片格式不支持，目前仅支持 PNG 和 JPEG 格式");
}

// ── 灰度与像素工具 ─────────────────────────────────────────────────────────────

type PixelData = Uint8Array;

function grayAt(data: PixelData, imgW: number, x: number, y: number): number {
  const idx = (Math.round(y) * imgW + Math.round(x)) * 4;
  return Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
}

function rowDarkness(data: PixelData, imgW: number, y: number, threshold = 128): number {
  let count = 0;
  const rowStart = Math.round(y) * imgW * 4;
  for (let x = 0; x < imgW; x++) {
    const idx = rowStart + x * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

function colDarkness(data: PixelData, imgW: number, imgH: number, x: number, threshold = 128): number {
  let count = 0;
  for (let y = 0; y < imgH; y++) {
    const idx = y * imgW * 4 + Math.round(x) * 4;
    const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    if (gray < threshold) count++;
  }
  return count;
}

// ── 网格线检测 ──────────────────────────────────────────────────────────────────

interface GridLines {
  horizontal: number[];
  vertical: number[];
}

export function detectGridLines(data: PixelData, imgW: number, imgH: number): GridLines {
  const darkThreshold = 80; // 更敏感的暗像素检测

  // 扫描边界区域找外框（找峰值中心，非边缘）
  function findBorderEdge(scores: Array<{ pos: number; score: number }>, fromStart: boolean): number | null {
    const threshold = 0.08;
    const indices = fromStart
      ? Array.from({ length: scores.length }, (_, i) => i)
      : Array.from({ length: scores.length }, (_, i) => scores.length - 1 - i);
    let peakPos: number | null = null;
    let peakScore = 0;
    for (const i of indices) {
      if (scores[i].score > threshold) {
        if (scores[i].score > peakScore) { peakScore = scores[i].score; peakPos = scores[i].pos; }
      } else if (peakPos !== null) {
        return peakPos;
      }
    }
    return peakPos;
  }

  // 在方向扫描，收集所有线峰
  function scanPeaks(scores: Array<{ pos: number; score: number }>): number[] {
    const peaks: number[] = [];
    const threshold = 0.10;
    let inPeak = false, bestPos = 0, bestScore = 0;
    for (const s of scores) {
      if (s.score > threshold) {
        if (!inPeak) { inPeak = true; bestPos = s.pos; bestScore = s.score; }
        else if (s.score > bestScore) { bestScore = s.score; bestPos = s.pos; }
      } else {
        if (inPeak) { inPeak = false; peaks.push(bestPos); }
      }
    }
    if (inPeak) peaks.push(bestPos);
    return peaks;
  }

  // 给定外框和方向，生成10条等分线
  function linesFromBorder(outerStart: number, outerEnd: number, total: number): number[] {
    const span = outerEnd - outerStart;
    const cellSize = span / 9;
    const result: number[] = [];
    for (let i = 0; i < 10; i++) {
      result.push(Math.round(outerStart + i * cellSize));
    }
    return result;
  }

  // ── 水平线 ──
  const rowScores = Array.from({ length: imgH }, (_, y) => ({
    pos: y,
    score: rowDarkness(data, imgW, y, darkThreshold) / imgW,
  }));
  const topBorder = findBorderEdge(rowScores, true);
  const bottomBorder = findBorderEdge(rowScores, false);
  const horizontal = (topBorder !== null && bottomBorder !== null && bottomBorder - topBorder > imgH * 0.45)
    ? linesFromBorder(topBorder, bottomBorder, imgH)
    : evenLines(10, imgH);

  // ── 垂直线 ──
  const colScores = Array.from({ length: imgW }, (_, x) => ({
    pos: x,
    score: colDarkness(data, imgW, imgH, x, darkThreshold) / imgH,
  }));
  const leftBorder = findBorderEdge(colScores, true);
  const rightBorder = findBorderEdge(colScores, false);
  const vertical = (leftBorder !== null && rightBorder !== null && rightBorder - leftBorder > imgW * 0.45)
    ? linesFromBorder(leftBorder, rightBorder, imgW)
    : evenLines(10, imgW);

  // Snap nearly-regular grids to exact integer positions (fixes rendered-image jitter)
  snapToExactGrid(horizontal);
  snapToExactGrid(vertical);

  return { horizontal, vertical };
}

/** Snap grid lines to exact integer spacing if detected as nearly regular */
function snapToExactGrid(lines: number[]): void {
  const diffs: number[] = [];
  for (let i = 1; i < lines.length; i++) diffs.push(lines[i] - lines[i - 1]);
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const intDiff = Math.round(avgDiff);
  if (Math.abs(avgDiff - intDiff) > 0.5) return;

  // Check deviation from ideal progression
  let maxDev = 0;
  for (let i = 1; i < lines.length; i++) {
    maxDev = Math.max(maxDev, Math.abs((lines[i] - lines[i - 1]) - intDiff));
  }
  if (maxDev > 2) return;

  // Snap: keep first line, regenerate rest with exact integer spacing
  const start = Math.round(lines[0]);
  for (let i = 0; i < lines.length; i++) {
    lines[i] = start + i * intDiff;
  }
}

function evenLines(count: number, total: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (total - 1)));
}

// ── 颜色分析 ────────────────────────────────────────────────────────────────────

function analyzeCellColor(
  data: PixelData, imgW: number,
  x1: number, y1: number, x2: number, y2: number,
): { r: number; g: number; b: number; pixelCount: number } {
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  const margin = 4;
  for (let y = Math.round(y1) + margin; y <= Math.round(y2) - margin; y++) {
    for (let x = Math.round(x1) + margin; x <= Math.round(x2) - margin; x++) {
      const idx = y * imgW * 4 + x * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      if (gray < 200) { rSum += r; gSum += g; bSum += b; count++; }
    }
  }
  return { r: rSum / count || 0, g: gSum / count || 0, b: bSum / count || 0, pixelCount: count };
}

function isBlue(r: number, g: number, b: number, count: number): boolean {
  if (count < 5) return false;
  return b > r * 1.3 && b > g * 1.1;
}

// ── 子格墨迹检测 ──────────────────────────────────────────────────────────────

function hasInk(data: PixelData, imgW: number, x1: number, y1: number, x2: number, y2: number): boolean {
  let darkCount = 0, totalCount = 0;
  for (let y = Math.round(y1); y <= Math.round(y2); y++) {
    for (let x = Math.round(x1); x <= Math.round(x2); x++) {
      const gray = grayAt(data, imgW, x, y);
      if (gray < 100) darkCount++;
      totalCount++;
    }
  }
  return darkCount / totalCount > 0.01; // 校准后最佳阈值: 1%
}

// ── 灰度提取（供模板匹配使用）──────────────────────────────────────────────────

export function extractGrayscale(
  data: PixelData, imgW: number,
  x1: number, y1: number, x2: number, y2: number,
): number[][] {
  const w = Math.round(x2 - x1);
  const h = Math.round(y2 - y1);
  const result: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const gray = grayAt(data, imgW, Math.round(x1 + x), Math.round(y1 + y));
      row.push(255 - gray); // 反转：暗像素=255(墨迹), 亮=0(白纸)
    }
    result.push(row);
  }
  return result;
}

// ── 主识别函数 ──────────────────────────────────────────────────────────────────

export async function recognizeBoard(imageBuf: Buffer, logger?: any): Promise<OCRResult> {
  logger?.info(`[OCR] 开始识别, 大小: ${(imageBuf.length / 1024).toFixed(1)}KB`);

  // Step 0: 解码图片（pngjs，无 canvas 依赖）
  const { data, width, height } = decodeImage(imageBuf);
  logger?.info(`[OCR] 图片解码: ${width}x${height}`);

  // Step 1: 检测网格
  const grid = detectGridLines(data, width, height);
  const hLines = grid.horizontal.slice(0, 10);
  const vLines = grid.vertical.slice(0, 10);
  logger?.info(`[OCR] 网格: H=[${hLines.map(v=>Math.round(v)).join(",")}]`);
  logger?.info(`[OCR]       V=[${vLines.map(v=>Math.round(v)).join(",")}]`);

  // 渲染图识别：检测网格是否接近已知尺寸 (948×948, cellSize≈100, padding≈24)
  // 如果是，直接使用精确格线位置消除检测抖动
  const avgCellW = (vLines[9] - vLines[0]) / 9;
  const avgCellH = (hLines[9] - hLines[0]) / 9;
  if (Math.abs(width - 948) <= 10 && Math.abs(height - 948) <= 10 &&
      Math.abs(avgCellW - 100) < 2 && Math.abs(avgCellH - 100) < 2) {
    const PAD = 24, CS = 100;
    for (let i = 0; i < 10; i++) {
      hLines[i] = PAD + i * CS;
      vLines[i] = PAD + i * CS;
    }
    logger?.info(`[OCR] 网格已对齐到精确位置 (${width}x${height}, cellSize=${CS})`);
  }

  // Step 2: 初始化结果
  const cells: OCRCell[][] = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, (): OCRCell => ({ value: 0, type: "none", candidates: [] })),
  );
  const confidence: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

  // Step 3: 遍历81格 — 模板匹配识别 (core: 手写+数字+xsudoku)
  let bigDigitCount = 0;
  let candidateCellCount = 0;
  // 保存每格的大数字像素，供第二遍字体切换使用
  const savedBigPixels: Array<{ r: number; c: number; pixels: number[][]; w: number; h: number }> = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x1 = vLines[c], y1 = hLines[r];
      const x2 = vLines[c + 1], y2 = hLines[r + 1];
      const cellW = x2 - x1, cellH = y2 - y1;
      if (cellW < 5 || cellH < 5) continue;

      // 大数字：裁剪格子中心区域做 NCC 模板匹配
      const inset = Math.max(2, cellW * 0.12);
      const cx1 = x1 + inset, cy1 = y1 + inset;
      const cx2 = x2 - inset, cy2 = y2 - inset;
      const bigPixels = extractGrayscale(data, width, cx1, cy1, cx2, cy2);
      const bw = Math.round(cx2 - cx1), bh = Math.round(cy2 - cy1);

      let isBig = false;
      let bigDigit = 0;
      let bigConf = 0;

      if (bw >= 5 && bh >= 5) {
        savedBigPixels.push({ r, c, pixels: bigPixels, w: bw, h: bh });
        const bigResult = matchBigDigit(bigPixels, bw, bh);
        if (bigResult.confidence > 0.70) {
          // 高置信度 → 确定为大数字
          isBig = true;
          bigDigit = bigResult.digit;
          bigConf = bigResult.confidence;
        } else if (bigResult.confidence > 0.50) {
          // 边界情况：检查是否有多个候选数 → 有多候选=候选格，否则=大数字
          let subMatches = 0;
          const subW = cellW / 3, subH = cellH / 3;
          for (let v = 1; v <= 9 && subMatches < 2; v++) {
            const subR = Math.floor((v - 1) / 3);
            const subC = (v - 1) % 3;
            const pad = 0.15;
            const sx1 = x1 + subC * subW + subW * pad;
            const sy1 = y1 + subR * subH + subH * pad;
            const sx2 = x1 + (subC + 1) * subW - subW * pad;
            const sy2 = y1 + (subR + 1) * subH - subH * pad;
            if (hasInk(data, width, sx1, sy1, sx2, sy2)) subMatches++;
          }
          if (subMatches < 2) {
            isBig = true;
            bigDigit = bigResult.digit;
            bigConf = bigResult.confidence;
          }
        }
      }

      if (isBig) {
        bigDigitCount++;
        cells[r][c].value = bigDigit;
        confidence[r][c] = bigConf;
        const color = analyzeCellColor(data, width,
          x1 + cellW * 0.2, y1 + cellH * 0.2,
          x2 - cellW * 0.2, y2 - cellH * 0.2,
        );
        cells[r][c].type = isBlue(color.r, color.g, color.b, color.pixelCount) ? "deduced" : "given";
        continue;
      }

      // 候选数：墨迹检测 + 模板匹配双重确认
      const subW = cellW / 3, subH = cellH / 3;
      const cands: number[] = [];

      for (let v = 1; v <= 9; v++) {
        const subR = Math.floor((v - 1) / 3);
        const subC = (v - 1) % 3;
        const pad = 0.15;
        const sx1 = x1 + subC * subW + subW * pad;
        const sy1 = y1 + subR * subH + subH * pad;
        const sx2 = x1 + (subC + 1) * subW - subW * pad;
        const sy2 = y1 + (subR + 1) * subH - subH * pad;

        // 墨迹检测（快速初筛）
        if (hasInk(data, width, sx1, sy1, sx2, sy2)) {
          cands.push(v);
          continue;
        }

        // 墨迹未检测到 → 模板匹配兜底（捕获浅色/细小候选数）
        const subPixels = extractGrayscale(data, width, sx1, sy1, sx2, sy2);
        const sw = Math.round(sx2 - sx1), sh = Math.round(sy2 - sy1);
        const subMatch = matchSmallDigit(subPixels, sw, sh);
        if (subMatch.digit === v && subMatch.confidence > 0.50) {
          cands.push(v);
        }
      }

      if (cands.length > 0) {
        cells[r][c].candidates = [...new Set(cands)].sort();
        confidence[r][c] = 0.7;
        candidateCellCount++;
      }
      // else: 空格
    }
  }

  logger?.info(`[OCR] 模板匹配: ${bigDigitCount}大数字, ${candidateCellCount}候选格`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: 数独规则校验 — 迭代式确认（高置信度优先）
  // ═══════════════════════════════════════════════════════════════════════════

  // 收集所有识别结果，按置信度降序排列
  type RecognizedCell = { r: number; c: number; value: number; type: "given" | "deduced" | "none"; conf: number };
  const recogs: RecognizedCell[] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (cells[r][c].value > 0) {
        recogs.push({
          r, c,
          value: cells[r][c].value,
          type: cells[r][c].type,
          conf: confidence[r][c],
        });
        // 先全部清空
        cells[r][c].value = 0;
        cells[r][c].type = "none";
        confidence[r][c] = 0;
      }
    }
  }
  recogs.sort((a, b) => b.conf - a.conf);

  // 迭代确认：维护已确认的数字板
  const confirmed: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  let keptCount = 0;
  let rejectedCount = 0;

  for (const rec of recogs) {
    const { r, c, value, type, conf } = rec;

    // 检查是否与已确认的数字冲突
    if (isValidPlacement(confirmed, r, c, value)) {
      confirmed[r][c] = value;
      cells[r][c].value = value;
      cells[r][c].type = type;
      confidence[r][c] = conf;
      keptCount++;
    } else {
      rejectedCount++;
    }
  }

  // ═════════════════════════════════════════════════════════════
  // 第二遍: core 模板冲突过多 → 尝试其他字体重识全盘
  // ═════════════════════════════════════════════════════════════
  if (rejectedCount > 3) {
    const families = getFontFamilies();
    let bestFamily = "";
    let bestRejected = rejectedCount;
    let bestCells: OCRCell[][] | null = null;
    let bestConf: number[][] | null = null;

    for (const family of families) {
      if (family === "xsudoku") continue; // already tried as core
      const testCells: OCRCell[][] = Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, (): OCRCell => ({ value: 0, type: "none", candidates: [] })),
      );
      const testConf: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));

      // Re-run matchBigDigit with this font family on all saved pixels
      for (const saved of savedBigPixels) {
        const { r, c, pixels, w, h } = saved;
        const result = matchBigDigit(pixels, w, h, family);
        if (result.confidence > 0.55) {
          testCells[r][c].value = result.digit;
          testCells[r][c].type = "given"; // assume given for validation
          testConf[r][c] = result.confidence;
        }
      }

      // Validate: count conflicts
      const testConfirmed: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
      let testRejected = 0;
      const recogs2: Array<{ r: number; c: number; value: number; conf: number }> = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (testCells[r][c].value > 0) {
            recogs2.push({ r, c, value: testCells[r][c].value, conf: testConf[r][c] });
          }
        }
      }
      recogs2.sort((a, b) => b.conf - a.conf);
      for (const rec of recogs2) {
        if (isValidPlacement(testConfirmed, rec.r, rec.c, rec.value)) {
          testConfirmed[rec.r][rec.c] = rec.value;
        } else {
          testRejected++;
        }
      }

      // Count how many cells got a digit
      const digitCount = testConfirmed.flat().filter(v => v > 0).length;

      if (testRejected < bestRejected && digitCount >= keptCount * 0.8) {
        bestRejected = testRejected;
        bestFamily = family;
        // Apply to cells
        bestCells = Array.from({ length: 9 }, (_, br: number) =>
          Array.from({ length: 9 }, (_, bc: number) => ({
            value: testConfirmed[br][bc],
            type: "given" as const,
            candidates: [] as number[],
          })),
        );
        bestConf = testConf;
      }
      if (testRejected === 0) break; // perfect match, stop searching
    }

    if (bestCells && bestRejected < rejectedCount) {
      logger?.info(`[OCR] 字体切换: core(${rejectedCount}冲突) → ${bestFamily}(${bestRejected}冲突)`);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (bestCells[r][c].value > 0) {
            cells[r][c] = bestCells[r][c];
            confidence[r][c] = bestConf![r][c];
          }
        }
      }
      // Rebuild confirmed from best cells
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          confirmed[r][c] = bestCells[r][c].value;
        }
      }
    }
  }

  // 用最终确认的数字板构建约束网格，重算候选数
  const constraintGrid = computeConstraintGrid(confirmed);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (cells[r][c].value > 0) {
        // 已确定格：候选数就是它自己
        cells[r][c].candidates = [cells[r][c].value];
      } else if (cells[r][c].candidates.length > 0) {
        // OCR 有候选数：与约束网格取交集
        cells[r][c].candidates = cells[r][c].candidates.filter(v => constraintGrid[r][c].has(v));
      } else {
        // OCR 无候选数：用约束网格填充
        cells[r][c].candidates = [...constraintGrid[r][c]];
      }
    }
  }

  if (rejectedCount > 0) logger?.info(`[OCR] 数独校验: ${rejectedCount}个冲突已排除, 保留${keptCount}个`);

  // 统计
  let givenCount = 0, deducedCount = 0, candidateCount = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (cells[r][c].type === "given") givenCount++;
      else if (cells[r][c].type === "deduced") deducedCount++;
      if (cells[r][c].candidates.length > 0) candidateCount++;
    }
  }
  logger?.info(`[OCR] 完成: ${givenCount}G ${deducedCount}D ${candidateCount}cands (模板匹配:${bigDigitCount}确认->${rejectedCount}排除)`);

  // Step 4.5: detect watermark (red text in bottom-left padding)
  let watermark: string | undefined;
  if (Math.abs(width - 948) <= 10 && Math.abs(height - 948) <= 10) {
    // Watermark at y=930 (padding+gridSize+6), 16px red font, left-aligned at x=28
    const wmX1 = 28, wmY = 930, wmH = 16, wmMaxW = 200;
    const wmX2 = Math.min(wmX1 + wmMaxW, width);

    // Extract grayscale, check for non-white content
    const wmPixels = extractGrayscale(data, width, wmX1, wmY, wmX2, wmY + wmH);
    const wmW = wmPixels[0]?.length || 0, wmHVal = wmPixels.length;

    // Check if there's any dark content (red text → inverted ≈179 on white 0)
    let maxDark = 0;
    for (const row of wmPixels) for (const v of row) if (v > maxDark) maxDark = v;
    if (maxDark > 80) {
      // Ink density: estimate character count to limit ghost matches
      const proj: number[] = [];
      for (let x = 0; x < wmW; x++) {
        let dark = 0;
        for (let y = 0; y < wmHVal; y++) if (wmPixels[y][x] > 80) dark++;
        proj.push(dark);
      }
      const projMax = Math.max(...proj);
      let estimatedChars = 0, inChar = false, inkLastEnd = 0;
      for (let x = 0; x < wmW; x++) {
        if (proj[x] > projMax * 0.12 && !inChar) { inChar = true; }
        else if (proj[x] <= projMax * 0.12 && inChar) {
          if (x - inkLastEnd >= 3) { estimatedChars++; inkLastEnd = x; }
          inChar = false;
        }
      }
      if (inChar && wmW - inkLastEnd >= 3) estimatedChars++;
      const maxChars = Math.max(estimatedChars + 1, 3);

      // Multi-size sliding window: match against 0-9 + a-z + A-Z templates
      type Match = { x: number; char: string; conf: number };
      const allMatches: Match[] = [];

      for (const winW of [8, 10, 12]) {
        for (let x = 0; x + winW <= wmW; x += 2) {
          const winPx: number[][] = [];
          for (let y = 0; y < wmHVal; y++) winPx.push(wmPixels[y].slice(x, x + winW));
          const result = matchWatermarkChar(winPx, winW, wmHVal);
          if (result.confidence > 0.65) {
            allMatches.push({ x, char: result.char, conf: result.confidence });
          }
        }
      }

      // Sort by confidence, pick non-overlapping best matches
      allMatches.sort((a, b) => b.conf - a.conf);
      const picked: Match[] = [];
      const used = new Set<number>();
      for (const m of allMatches) {
        if (picked.length >= maxChars) break;
        let overlaps = false;
        for (let px = m.x; px < m.x + 5; px++) {
          if (used.has(px)) { overlaps = true; break; }
        }
        if (!overlaps) {
          picked.push(m);
          for (let px = m.x - 1; px < m.x + 6; px++) used.add(px);
        }
      }
      picked.sort((a, b) => a.x - b.x);

      // Build string with dash detection in gaps
      const parts: string[] = [];
      let lastEnd = 0;
      for (const m of picked) {
        if (parts.length > 0 && m.x - lastEnd >= 4) {
          // Check for dash in the gap
          const gapPx: number[][] = [];
          for (let y = 0; y < wmHVal; y++) gapPx.push(wmPixels[y].slice(lastEnd, m.x));
          const gw = gapPx[0]?.length || 0;
          if (gw >= 3) {
            let midDark = 0, midTotal = 0;
            const midY = Math.floor(wmHVal / 2);
            for (let dx = 0; dx < gw; dx++) {
              if ((gapPx[midY]?.[dx] ?? 0) > 100) midDark++;
              midTotal++;
            }
            if (midDark / Math.max(1, midTotal) > 0.2) parts.push("-");
          }
        }
        parts.push(m.char);
        lastEnd = m.x + 8;
      }

      if (parts.length > 0) {
        watermark = parts.join("");
        if (!/^[\d\-]+$/.test(watermark)) watermark = undefined;
        if (watermark) logger?.info(`[OCR] 检测到水印: ${watermark}`);
      }
    }
  }

  return { cells, confidence, watermark };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 数独工具函数
// ═══════════════════════════════════════════════════════════════════════════════

function cellName(r: number, c: number): string {
  return `${String.fromCharCode(65 + r)}${c + 1}`;
}

function isValidPlacement(board: number[][], r: number, c: number, v: number): boolean {
  // Check row
  for (let cc = 0; cc < 9; cc++) {
    if (board[r][cc] === v) return false;
  }
  // Check column
  for (let rr = 0; rr < 9; rr++) {
    if (board[rr][c] === v) return false;
  }
  // Check box
  const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if (board[br + dr][bc + dc] === v) return false;
    }
  }
  return true;
}

function computeConstraintGrid(values: number[][]): Array<Array<Set<number>>> {
  const grid: Array<Array<Set<number>>> = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => new Set([1, 2, 3, 4, 5, 6, 7, 8, 9])));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (values[r][c] !== 0) grid[r][c] = new Set([values[r][c]]);
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = values[r][c];
      if (v === 0) continue;
      for (let cc = 0; cc < 9; cc++) if (cc !== c) grid[r][cc].delete(v);
      for (let rr = 0; rr < 9; rr++) if (rr !== r) grid[rr][c].delete(v);
      const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++)
          if (br + dr !== r || bc + dc !== c) grid[br + dr][bc + dc].delete(v);
    }
  }
  return grid;
}

/** 预加载模板（插件初始化时调用） */
export { preloadTemplates } from "./template-match";
