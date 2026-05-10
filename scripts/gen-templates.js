/**
 * 生成数字模板 — 用 Canvas 渲染 1-9 数字，输出为 JSON 像素数组
 * 生成两个尺寸：大数字(24x36) 和 候选数(14x20)
 * 用法: node scripts/gen-templates.js
 */
const { writeFileSync, mkdirSync, existsSync } = require("fs");
const { join } = require("path");

// 复用 renderer.ts 的 canvas 发现逻辑
let NativeCanvas = null;
try { NativeCanvas = require("@ahdg/canvas"); } catch {}
if (!NativeCanvas) try { NativeCanvas = require("@napi-rs/canvas"); } catch {}
if (!NativeCanvas) try { NativeCanvas = require("canvas"); } catch {}
if (!NativeCanvas) {
  console.error("Canvas not found! Install @ahdg/canvas or canvas");
  process.exit(1);
}

const OUT_DIR = join(__dirname, "..", "templates");
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

function renderDigit(digit, w, h, fontSize, fontFamily) {
  const c = typeof NativeCanvas.createCanvas === "function"
    ? NativeCanvas.createCanvas(w, h)
    : new NativeCanvas(w, h);
  const ctx = c.getContext("2d");

  // 白底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  // 黑字
  ctx.fillStyle = "#000000";
  ctx.font = `${fontSize}px "${fontFamily}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 渲染数字
  const text = String(digit);
  const metrics = ctx.measureText(text);
  // 计算实际渲染位置（居中）
  const x = w / 2;
  // 垂直微调让数字视觉居中
  const y = h / 2 + fontSize * 0.05;
  ctx.fillText(text, x, y);

  // 提取灰度像素
  const imageData = ctx.getImageData(0, 0, w, h);
  const pixels = [];
  for (let row = 0; row < h; row++) {
    const line = [];
    for (let col = 0; col < w; col++) {
      const idx = (row * w + col) * 4;
      // 取红色通道（灰度图），反转：暗=高值
      const v = 255 - imageData.data[idx];
      line.push(v);
    }
    pixels.push(line);
  }
  return pixels;
}

// 尝试多个字体，取第一个可用的
const FONTS = ["Arial", "Helvetica", "sans-serif", "Microsoft YaHei"];

function generate(fontSize, label, w, h) {
  console.log(`\n生成 ${label} 模板 (${w}x${h}, ${fontSize}px)...`);

  for (let digit = 1; digit <= 9; digit++) {
    let best = null;
    for (const font of FONTS) {
      const pixels = renderDigit(digit, w, h, fontSize, font);
      // 检查是否有足够暗像素（确保字体渲染了）
      let darkCount = 0;
      for (const row of pixels) {
        for (const v of row) {
          if (v > 80) darkCount++;
        }
      }
      if (darkCount > 5) {
        best = { pixels, font, darkCount };
        break;
      }
    }
    if (best) {
      const file = join(OUT_DIR, `${label}_${digit}.json`);
      writeFileSync(file, JSON.stringify({ digit, w, h, pixels: best.pixels, font: best.font, darkPixels: best.darkCount }));
      console.log(`  数字${digit}: ${best.darkCount} 暗像素 (字体: ${best.font}) → ${file}`);
    } else {
      console.error(`  数字${digit}: 所有字体渲染失败!`);
    }
  }
}

// 大数字模板: 24x36, 字体30px (占模板80%)
generate(30, "big", 24, 36);

// 候选数模板: 14x20, 字体16px
generate(16, "small", 14, 20);

console.log(`\n模板已保存到: ${OUT_DIR}`);
console.log("下一步: 将这些模板内联到 src/template-match.ts");
