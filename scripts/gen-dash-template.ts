/**
 * 生成水印连字符 "-" 模板
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { NativeCanvas } from "../src/renderer";

const TEMPLATE_DIR = join(__dirname, "..", "templates");

function main() {
  mkdirSync(TEMPLATE_DIR, { recursive: true });
  const nc = NativeCanvas;
  if (!nc) { console.error("Canvas 不可用"); process.exit(1); }

  const cw = 20, ch = 20;
  const c = typeof nc.createCanvas === "function" ? nc.createCanvas(cw, ch) : new nc(cw, ch);
  const cx = c.getContext("2d");
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, cw, ch);
  cx.fillStyle = "#FF0000";
  cx.font = '16px "Microsoft YaHei", sans-serif';
  cx.textAlign = "left";
  cx.textBaseline = "top";
  cx.fillText("-", 2, 2);

  let buf: Buffer;
  if (typeof c.toBuffer === "function") buf = c.toBuffer("image/png");
  else if (typeof c.encode === "function") buf = c.encode("png");
  else if (typeof c.png === "function") buf = c.png();
  else { console.error("No buffer"); return; }

  const { PNG } = require("pngjs");
  const png = PNG.sync.read(buf);
  const data = png.data;
  const imgW = png.width;

  let top = ch, bottom = 0, left = cw, right = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const idx = (y * imgW + x) * 4;
      const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      if (gray < 200) {
        if (y < top) top = y; if (y > bottom) bottom = y;
        if (x < left) left = x; if (x > right) right = x;
      }
    }
  }
  if (top > bottom) { console.error("No content"); return; }
  top = Math.max(0, top - 1); bottom = Math.min(ch - 1, bottom + 1);
  left = Math.max(0, left - 1); right = Math.min(cw - 1, right + 1);

  const tw = right - left + 1, th = bottom - top + 1;
  const pixels: number[][] = [];
  for (let y = 0; y < th; y++) {
    const row: number[] = [];
    for (let x = 0; x < tw; x++) {
      const idx = ((top + y) * imgW + (left + x)) * 4;
      const gray = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      row.push(255 - gray);
    }
    pixels.push(row);
  }
  let darkCount = 0;
  for (const row of pixels) for (const v of row) if (v > 128) darkCount++;

  writeFileSync(join(TEMPLATE_DIR, "wm_dash.json"), JSON.stringify({
    w: tw, h: th, char: "-", pixels, darkCount,
    samples: [{ pixels, darkCount }],
  }, null, 2));
  console.log(`wm_dash.json: ${tw}x${th}, darkCount=${darkCount}`);
}

main();
