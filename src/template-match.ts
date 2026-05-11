/**
 * template-match.ts - 归一化互相关(NCC)模板匹配数字识别
 *
 * 替换 tesseract.js：零外部依赖，极快，纯像素运算
 * 支持大数字和候选数两种尺寸
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ── 模板数据结构 ──────────────────────────────────────────────────────────────────

interface DigitTemplate {
  digit: number;
  w: number;
  h: number;
  pixels: number[][];  // 0=白, 255=黑
  /** 暗像素总数（预计算加速NCC） */
  darkCount: number;
  /** 像素均值（预计算加速NCC） */
  mean: number;
}

const bigTemplates: DigitTemplate[] = [];
const smallTemplates: DigitTemplate[] = [];
const digitalTemplates: DigitTemplate[] = [];
const xsudokuTemplates: DigitTemplate[] = [];
const watermarkTemplates: DigitTemplate[] = [];
/** Auto-discovered font templates (key = font prefix like "simhei", "kaiti") */
const fontTemplates: Map<string, DigitTemplate[]> = new Map();
const KNOWN_PREFIXES = new Set(["big", "small", "digital", "xsudoku", "wm"]);

let templatesLoaded = false;

// ── 加载模板 ──────────────────────────────────────────────────────────────────────

function loadTemplates(): void {
  if (templatesLoaded) return;

  const dirs = [
    join(__dirname, "..", "templates"),
    join(__dirname, "..", "..", "templates"),
  ];

  for (const size of ["big", "small"]) {
    const target = size === "big" ? bigTemplates : smallTemplates;
    for (let digit = 1; digit <= 9; digit++) {
      let loaded = false;
      for (const dir of dirs) {
        const path = join(dir, `${size}_${digit}.json`);
        if (existsSync(path)) {
          const raw = JSON.parse(readFileSync(path, "utf-8"));
          const tW = raw.w, tH = raw.h;
          // Support both single-template (pixels) and multi-sample (samples) formats
          const entries = raw.samples || [{ pixels: raw.pixels, darkCount: raw.darkPixels || raw.darkCount || 0 }];
          for (const entry of entries) {
            const pixels: number[][] = entry.pixels;
            const darkCount = entry.darkCount || 0;
            let sum = 0, n = 0;
            for (const row of pixels) for (const v of row) { sum += v; n++; }
            const mean = n > 0 ? sum / n : 0;
            target.push({ digit, w: tW, h: tH, pixels, darkCount, mean });
          }
          loaded = true;
          break;
        }
      }
      if (!loaded) {
        target.push({ digit, w: size === "big" ? 24 : 14, h: size === "big" ? 36 : 20, pixels: [], darkCount: 0, mean: 0 });
      }
    }
  }

  // Load digital templates (system-font self-rendered digits, multi-sample)
  for (let digit = 1; digit <= 9; digit++) {
    for (const dir of dirs) {
      const path = join(dir, `digital_${digit}.json`);
      if (existsSync(path)) {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        const entries = raw.samples || [raw]; // backward compat: single sample without "samples" key
        for (const entry of entries) {
          const pixels: number[][] = entry.pixels;
          let sum = 0, n = 0;
          for (const row of pixels) for (const v of row) { sum += v; n++; }
          const mean = sum / n;
          digitalTemplates.push({
            digit,
            w: raw.w, h: raw.h,
            pixels,
            darkCount: entry.darkCount || 0,
            mean,
          });
        }
        break;
      }
    }
  }

  // Load xsudoku templates (Xsudoku font digits from 1121x1121 images)
  for (let digit = 1; digit <= 9; digit++) {
    for (const dir of dirs) {
      const path = join(dir, `xsudoku_${digit}.json`);
      if (existsSync(path)) {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        const entries = raw.samples || [{ pixels: raw.pixels, darkCount: raw.darkCount || 0 }];
        for (const entry of entries) {
          const pixels: number[][] = entry.pixels;
          let sum = 0, n = 0;
          for (const row of pixels) for (const v of row) { sum += v; n++; }
          const mean = n > 0 ? sum / n : 0;
          xsudokuTemplates.push({ digit, w: raw.w, h: raw.h, pixels, darkCount: entry.darkCount || 0, mean });
        }
        break;
      }
    }
  }

  // Load watermark templates (16px red system-font digits)
  for (let digit = 0; digit <= 9; digit++) {
    for (const dir of dirs) {
      const path = join(dir, `wm_${digit}.json`);
      if (existsSync(path)) {
        const raw = JSON.parse(readFileSync(path, "utf-8"));
        const pixels: number[][] = raw.pixels;
        const darkCount = raw.darkCount || 0;
        let sum = 0, n = 0;
        for (const row of pixels) for (const v of row) { sum += v; n++; }
        watermarkTemplates.push({ digit, w: raw.w, h: raw.h, pixels, darkCount, mean: sum / n });
        break;
      }
    }
  }

  // Auto-discover font templates from templates/ directory
  // Pattern: {prefix}_{digit}.json where digit is 1-9
  for (const dir of dirs) {
    try {
      const files = readdirSync(dir);
      const fontPrefixes = new Set<string>();
      for (const f of files) {
        const m = f.match(/^(.+)_(\d)\.json$/);
        if (m && !KNOWN_PREFIXES.has(m[1])) {
          fontPrefixes.add(m[1]);
        }
      }
      for (const prefix of fontPrefixes) {
        const tpls: DigitTemplate[] = [];
        for (let digit = 1; digit <= 9; digit++) {
          const path = join(dir, `${prefix}_${digit}.json`);
          if (existsSync(path)) {
            const raw = JSON.parse(readFileSync(path, "utf-8"));
            const entries = raw.samples || [{ pixels: raw.pixels, darkCount: raw.darkCount || 0 }];
            for (const entry of entries) {
              const pixels: number[][] = entry.pixels;
              let sum = 0, n = 0;
              for (const row of pixels) for (const v of row) { sum += v; n++; }
              tpls.push({ digit, w: raw.w, h: raw.h, pixels, darkCount: entry.darkCount || 0, mean: n > 0 ? sum / n : 0 });
            }
          }
        }
        if (tpls.length > 0) fontTemplates.set(prefix, tpls);
      }
    } catch { /* dir may not exist */ }
  }

  templatesLoaded = true;
}

// ── 归一化互相关(NCC) ────────────────────────────────────────────────────────────
//
// NCC = Σ[(I - μI) * (T - μT)] / sqrt(Σ(I - μI)² * Σ(T - μT)²)
// 值域: -1 到 1，1=完全匹配，-1=完全反相

function ncc(input: number[][], template: DigitTemplate): number {
  if (template.pixels.length === 0) return 0;

  const tH = template.h, tW = template.w;
  const iH = input.length, iW = input[0]?.length || 0;
  if (iH === 0 || iW === 0) return 0;

  // 将input缩放到模板尺寸
  const scaled = scaleTo(input, iW, iH, tW, tH);

  // 计算input均值
  let iSum = 0;
  for (let y = 0; y < tH; y++)
    for (let x = 0; x < tW; x++)
      iSum += scaled[y][x];
  const iMean = iSum / (tW * tH);

  // NCC计算
  let numerator = 0, denomI = 0, denomT = 0;
  const tMean = template.mean;

  for (let y = 0; y < tH; y++) {
    for (let x = 0; x < tW; x++) {
      const iDiff = scaled[y][x] - iMean;
      const tDiff = template.pixels[y][x] - tMean;
      numerator += iDiff * tDiff;
      denomI += iDiff * iDiff;
      denomT += tDiff * tDiff;
    }
  }

  const denom = Math.sqrt(denomI * denomT);
  if (denom < 1e-6) return 0;
  return numerator / denom;
}

// ── 双线性缩放 ──────────────────────────────────────────────────────────────────

export function scaleTo(input: number[][], inW: number, inH: number, outW: number, outH: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < outH; y++) {
    const row: number[] = [];
    const srcY = (y / outH) * inH;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, inH - 1);
    const yFrac = srcY - y0;

    for (let x = 0; x < outW; x++) {
      const srcX = (x / outW) * inW;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, inW - 1);
      const xFrac = srcX - x0;

      // 双线性插值
      const v00 = input[y0]?.[x0] ?? 0;
      const v10 = input[y0]?.[x1] ?? 0;
      const v01 = input[y1]?.[x0] ?? 0;
      const v11 = input[y1]?.[x1] ?? 0;

      const top = v00 * (1 - xFrac) + v10 * xFrac;
      const bottom = v01 * (1 - xFrac) + v11 * xFrac;
      row.push(top * (1 - yFrac) + bottom * yFrac);
    }
    out.push(row);
  }
  return out;
}


export interface MatchResult {
  digit: number;     // 1-9，0=未识别
  confidence: number; // 0-1，NCC相似度
}

/**
 * 大数字识别：输入单元格裁剪区域的灰度像素
 * @param pixels - 2D灰度数组 (0=白, 255=黑)
 * @param w - 宽
 * @param h - 高
 */
export function matchBigDigit(pixels: number[][], w: number, h: number): MatchResult {
  loadTemplates();

  // 检查是否有足够暗像素（无内容=不识别）
  let maxVal = 0;
  for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
  if (maxVal < 30) return { digit: 0, confidence: 0 };

  // 场景自动分离：数字模板高分 → 渲染图，低分 → 用户照片
  // 避免两套模板交叉竞争导致手写数字被数字模板误匹配

  // Pass 1: 数字模板（无偏差）
  let bestDigitalScore = -1, bestDigitalDigit = 0;
  for (const tpl of digitalTemplates) {
    if (tpl.pixels.length === 0) continue;
    const score = ncc(pixels, tpl);
    if (score > bestDigitalScore) { bestDigitalScore = score; bestDigitalDigit = tpl.digit; }
  }

  // 数字模板高分 → 确定是自渲染图，直接采信
  if (bestDigitalScore > 0.80) {
    return { digit: bestDigitalDigit, confidence: clamp01((bestDigitalScore + 1) / 2) };
  }

  // Pass 2: Xsudoku 模板（适配 xsudoku 字体）
  let bestXsudokuScore = -1, bestXsudokuDigit = 0;
  if (xsudokuTemplates.length > 0) {
    for (const tpl of xsudokuTemplates) {
      if (tpl.pixels.length === 0) continue;
      const score = ncc(pixels, tpl);
      if (score > bestXsudokuScore) { bestXsudokuScore = score; bestXsudokuDigit = tpl.digit; }
    }
  }

  // Xsudoku 高分且超过 digital → 采信 (最优阈值 0.64, 零误报)
  const xsudokuConf = clamp01((bestXsudokuScore + 1) / 2);
  if (xsudokuConf > 0.64 && xsudokuConf > clamp01((bestDigitalScore + 1) / 2)) {
    return { digit: bestXsudokuDigit, confidence: xsudokuConf };
  }

  // Pass 2.5: Auto-discovered font templates (simhei, kaiti, etc.)
  let bestFontScore = -1, bestFontDigit = 0;
  for (const [, tpls] of fontTemplates) {
    for (const tpl of tpls) {
      if (tpl.pixels.length === 0) continue;
      const score = ncc(pixels, tpl);
      if (score > bestFontScore) { bestFontScore = score; bestFontDigit = tpl.digit; }
    }
  }
  const fontConf = clamp01((bestFontScore + 1) / 2);
  if (fontConf > 0.64 && fontConf > xsudokuConf && fontConf > clamp01((bestDigitalScore + 1) / 2)) {
    return { digit: bestFontDigit, confidence: fontConf };
  }

  // Pass 3: 用户照片 → 只用手写模板
  let bestDigit = 0, bestScore = -1;
  for (const tpl of bigTemplates) {
    if (tpl.pixels.length === 0) continue;
    const score = ncc(pixels, tpl);
    if (score > bestScore) { bestScore = score; bestDigit = tpl.digit; }
  }

  const bigConf = clamp01((bestScore + 1) / 2);
  // xsudoku 偏低分但仍优于手写 → 采信 xsudoku
  if (xsudokuConf > 0.64 && xsudokuConf > bigConf) {
    return { digit: bestXsudokuDigit, confidence: xsudokuConf };
  }
  // font template 优于手写 → 采信
  if (fontConf > 0.64 && fontConf > bigConf) {
    return { digit: bestFontDigit, confidence: fontConf };
  }

  return { digit: bestScore > 0.1 ? bestDigit : 0, confidence: bigConf };
}

/**
 * 候选数识别：输入子格区域灰度像素
 */
export function matchSmallDigit(pixels: number[][], w: number, h: number): MatchResult {
  loadTemplates();

  // 检查是否有足够暗像素（无内容=不识别）
  let maxVal = 0;
  for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
  if (maxVal < 20) return { digit: 0, confidence: 0 };

  let bestDigit = 0;
  let bestScore = -1; // 需要正匹配才输出

  for (const tpl of smallTemplates) {
    if (tpl.pixels.length === 0) continue;
    const score = ncc(pixels, tpl);
    if (score > bestScore) {
      bestScore = score;
      bestDigit = tpl.digit;
    }
  }

  return { digit: bestScore > 0.05 ? bestDigit : 0, confidence: clamp01((bestScore + 1) / 2) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 预加载模板（可选，在插件初始化时调用）
 */
export function preloadTemplates(): void {
  loadTemplates();
}

/**
 * 水印数字识别 — 使用16px红色水印专用模板
 */
export function matchWatermarkDigit(pixels: number[][], w: number, h: number): MatchResult {
  loadTemplates();

  let maxVal = 0;
  for (const row of pixels) for (const v of row) if (v > maxVal) maxVal = v;
  if (maxVal < 30) return { digit: 0, confidence: 0 };

  let bestDigit = 0, bestScore = -1;
  for (const tpl of watermarkTemplates) {
    if (tpl.pixels.length === 0) continue;
    const score = ncc(pixels, tpl);
    if (score > bestScore) { bestScore = score; bestDigit = tpl.digit; }
  }

  return { digit: bestScore > 0.1 ? bestDigit : 0, confidence: clamp01((bestScore + 1) / 2) };
}

/**
 * 强制重新加载模板（模板文件变更后使用）
 */
export function reloadTemplates(): void {
  templatesLoaded = false;
  bigTemplates.length = 0;
  smallTemplates.length = 0;
  digitalTemplates.length = 0;
  watermarkTemplates.length = 0;
  loadTemplates();
}
