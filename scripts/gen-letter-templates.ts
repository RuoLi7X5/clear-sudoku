/**
 * 生成水印字母模板 (a-z, A-Z)
 * 用微软雅黑 16px 红色渲染每个字母，提取像素为模板
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { SudokuRenderer, NativeCanvas } from "../src/renderer";

const TEMPLATE_DIR = join(__dirname, "..", "templates");

function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });

  const nc = NativeCanvas;
  if (!nc) { console.error("Canvas 不可用"); process.exit(1); }

  const canvas = typeof nc.createCanvas === "function"
    ? nc.createCanvas(20, 20) : new nc(20, 20);
  const ctx = canvas.getContext("2d");

  // Use the CJK font stack (Microsoft YaHei for Windows)
  const FONT = '16px "Microsoft YaHei", sans-serif';
  ctx.font = FONT;
  ctx.fillStyle = "#FF0000";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const chars: Array<{ char: string; filename: string }> = [];

  // Lowercase a-z → wm_a.json
  for (let code = 97; code <= 122; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wm_${String.fromCharCode(code)}.json` });
  }
  // Uppercase A-Z → wmu_A.json (wmu_ prefix avoids case-insensitive FS conflict)
  for (let code = 65; code <= 90; code++) {
    chars.push({ char: String.fromCharCode(code), filename: `wmu_${String.fromCharCode(code)}.json` });
  }

  console.log(`生成 ${chars.length} 个字母水印模板...`);

  for (const { char, filename } of chars) {
    // Render on a 20x20 canvas
    const cw = 20, ch = 20;
    const c = typeof nc.createCanvas === "function"
      ? nc.createCanvas(cw, ch) : new nc(cw, ch);
    const cx = c.getContext("2d");

    cx.fillStyle = "#ffffff";
    cx.fillRect(0, 0, cw, ch);
    cx.fillStyle = "#FF0000";
    cx.font = FONT;
    cx.textAlign = "left";
    cx.textBaseline = "top";
    cx.fillText(char, 2, 2);

    // Extract pixels (inverted: dark=255, light=0)
    // Need to get raw pixel data
    let buf: Buffer;
    if (typeof c.toBuffer === "function") buf = c.toBuffer("image/png");
    else if (typeof c.encode === "function") buf = c.encode("png");
    else if (typeof c.png === "function") buf = c.png();
    else { console.error("Cannot get buffer from canvas"); continue; }

    const { PNG } = require("pngjs");
    const png = PNG.sync.read(buf);
    const data = png.data;
    const imgW = png.width;

    // Find character bounding box
    let top = ch, bottom = 0, left = cw, right = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = (y * imgW + x) * 4;
        const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        if (gray < 200) { // red text = dark in grayscale
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    if (top > bottom) { console.log(`  ⚠ ${char}: no content found`); continue; }

    // Add 1px padding
    top = Math.max(0, top - 1);
    bottom = Math.min(ch - 1, bottom + 1);
    left = Math.max(0, left - 1);
    right = Math.min(cw - 1, right + 1);

    const tw = right - left + 1, th = bottom - top + 1;
    const pixels: number[][] = [];
    for (let y = 0; y < th; y++) {
      const row: number[] = [];
      for (let x = 0; x < tw; x++) {
        const idx = ((top + y) * imgW + (left + x)) * 4;
        const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        row.push(255 - gray); // invert
      }
      pixels.push(row);
    }

    let darkCount = 0;
    for (const row of pixels) for (const v of row) if (v > 128) darkCount++;

    writeFileSync(join(TEMPLATE_DIR, filename), JSON.stringify({
      w: tw, h: th,
      char,
      pixels,
      darkCount,
      samples: [{ pixels, darkCount }],
    }, null, 2));
  }

  console.log(`完成。${chars.length} 个字母模板 → ${TEMPLATE_DIR}/`);
}

main();
