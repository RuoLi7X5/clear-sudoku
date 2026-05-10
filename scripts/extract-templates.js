/**
 * 从图片中自提取数字模板（bootstrapping）
 *
 * 原理：
 *  1. 用当前Arial模板做初步OCR
 *  2. 数独规则校验通过的数字 = 高概率正确的识别
 *  3. 从原图中裁剪这些数字的像素 → 作为新模板
 *  4. 同一数字多次出现取平均 → 更鲁棒
 *  5. 保存为新的模板JSON，覆盖Arial模板
 *
 * 用法: node scripts/extract-templates.js [图片数量] [输出目录]
 */
const { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } = require("fs");
const { join, extname } = require("path");
const { PNG } = require("pngjs");

const IMG_DIR = join(__dirname, "..", "..", "..", "images");
const OUT_DIR = join(__dirname, "..", "templates_extracted");

async function main() {
  const imgCount = parseInt(process.argv[2]) || 20;

  const { recognizeBoard, preloadTemplates } = require("../lib/ocr");
  preloadTemplates();

  const logger = { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };

  const files = readdirSync(IMG_DIR)
    .filter(f => ['.png', '.jpg', '.jpeg'].includes(extname(f).toLowerCase()))
    .sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .slice(0, imgCount);

  console.log(`从 ${files.length} 张图片中提取数字模板...\n`);

  // 累积器：每个数字的像素总和 + 计数
  const accumulators = {
    big: Array.from({ length: 10 }, () => ({ sum: null, count: 0, w: 24, h: 36 })),
    small: Array.from({ length: 10 }, () => ({ sum: null, count: 0, w: 14, h: 20 })),
  };

  let totalExtracted = 0;
  let totalBig = 0, totalSmall = 0;

  for (const file of files) {
    const imgPath = join(IMG_DIR, file);
    const buf = readFileSync(imgPath);

    // 解码图片
    const png = PNG.sync.read(buf);
    const data = png.data;
    const imgW = png.width;
    const imgH = png.height;

    // OCR识别
    const result = await recognizeBoard(buf, logger);

    // 对每个确认的大数字，提取像素
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = result.cells[r][c];
        if (cell.type !== "given" && cell.type !== "deduced") continue;
        if (cell.value < 1 || cell.value > 9) continue;

        const digit = cell.value;

        // 需要网格坐标来裁剪 — 这需要重新检测网格
        // 简化：用均匀网格估算（1190x1190图片的典型网格）
        // 实际网格: H=[18,146,274,402,530,658,786,914,1042,1170]
        // 格宽 ≈ 128, 格高 ≈ 128
        const cellSize = (imgW - 36) / 9;  // 估算
        const margin = 18;
        const x1 = margin + c * cellSize;
        const y1 = margin + r * cellSize;
        const cellW = cellSize;
        const cellH = cellSize;

        // 裁剪大数字（中心区域）
        const inset = cellW * 0.12;
        const cx1 = Math.round(x1 + inset);
        const cy1 = Math.round(y1 + inset);
        const cx2 = Math.round(x1 + cellW - inset);
        const cy2 = Math.round(y1 + cellH - inset);

        // 提取并缩放到模板尺寸
        const bigPixels = extractScaled(data, imgW, cx1, cy1, cx2, cy2, 24, 36);
        if (bigPixels) {
          const acc = accumulators.big[digit];
          if (!acc.sum) {
            acc.sum = bigPixels.map(row => row.slice());
          } else {
            for (let y = 0; y < 36; y++)
              for (let x = 0; x < 24; x++)
                acc.sum[y][x] += bigPixels[y][x];
          }
          acc.count++;
          totalBig++;
        }

        // 裁剪候选数区域
        const subW = cellW / 3, subH = cellH / 3;
        for (let v = 1; v <= 9; v++) {
          if (!cell.candidates.includes(v)) continue;
          const subR = Math.floor((v - 1) / 3);
          const subC = (v - 1) % 3;
          const pad = 0.15;
          const sx1 = Math.round(x1 + subC * subW + subW * pad);
          const sy1 = Math.round(y1 + subR * subH + subH * pad);
          const sx2 = Math.round(x1 + (subC + 1) * subW - subW * pad);
          const sy2 = Math.round(y1 + (subR + 1) * subH - subH * pad);

          const smallPixels = extractScaled(data, imgW, sx1, sy1, sx2, sy2, 14, 20);
          if (smallPixels) {
            const acc = accumulators.small[v];
            if (!acc.sum) {
              acc.sum = smallPixels.map(row => row.slice());
            } else {
              for (let y = 0; y < 20; y++)
                for (let x = 0; x < 14; x++)
                  acc.sum[y][x] += smallPixels[y][x];
            }
            acc.count++;
            totalSmall++;
          }
        }
      }
    }

    totalExtracted += result.cells.flat().filter(c => c.type === "given" || c.type === "deduced").length;
    process.stdout.write(`  ${file}: 提取 ${result.cells.flat().filter(c => c.type === "given" || c.type === "deduced").length} 个大数字 + 候选\n`);
  }

  console.log(`\n总计提取: ${totalBig}个大数字样本, ${totalSmall}个候选数样本\n`);

  // 平均化并保存
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const size of ["big", "small"]) {
    const accs = size === "big" ? accumulators.big : accumulators.small;
    for (let digit = 1; digit <= 9; digit++) {
      const acc = accs[digit];
      if (acc.count === 0) {
        console.log(`  ${size}_${digit}: 无样本，跳过`);
        continue;
      }

      // 平均化
      const pixels = acc.sum!.map(row => row.map(v => Math.round(v / acc.count)));
      let darkCount = 0;
      for (const row of pixels) for (const v of row) if (v > 80) darkCount++;

      const out = { digit, w: acc.w, h: acc.h, pixels, darkCount, sampleCount: acc.count };
      writeFileSync(join(OUT_DIR, `${size}_${digit}.json`), JSON.stringify(out));
      console.log(`  ${size}_${digit}: ${acc.count}样本, ${darkCount}暗像素 → ${size}_${digit}.json`);
    }
  }

  console.log(`\n模板已保存到: ${OUT_DIR}`);
  console.log(`下一步: 复制模板到 templates/ 目录替换Arial模板`);
}

// 从图片中裁剪区域并缩放到目标尺寸
function extractScaled(data, imgW, x1, y1, x2, y2, outW, outH) {
  const inW = x2 - x1;
  const inH = y2 - y1;
  if (inW < 2 || inH < 2) return null;

  const result = [];
  for (let y = 0; y < outH; y++) {
    const row = [];
    const srcY = y1 + (y / outH) * inH;
    const y0 = Math.floor(srcY);
    const y1f = Math.min(y0 + 1, Math.round(y2) - 1);
    const yFrac = srcY - y0;

    for (let x = 0; x < outW; x++) {
      const srcX = x1 + (x / outW) * inW;
      const x0 = Math.floor(srcX);
      const x1f = Math.min(x0 + 1, Math.round(x2) - 1);
      const xFrac = srcX - x0;

      const v00 = grayAt(data, imgW, x0, y0);
      const v10 = grayAt(data, imgW, x1f, y0);
      const v01 = grayAt(data, imgW, x0, y1f);
      const v11 = grayAt(data, imgW, x1f, y1f);

      const top = v00 * (1 - xFrac) + v10 * xFrac;
      const bottom = v01 * (1 - xFrac) + v11 * xFrac;
      row.push(Math.round(255 - (top * (1 - yFrac) + bottom * yFrac)));
    }
    result.push(row);
  }
  return result;
}

function grayAt(data, w, x, y) {
  const i = (Math.round(y) * w + Math.round(x)) * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

main().catch(e => { console.error(e); process.exit(1); });
