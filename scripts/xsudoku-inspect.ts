/**
 * Xsudoku 图片检查脚本 — 了解图片格式和维度
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const XSUDOKU_DIR = join(__dirname, "..", "..", "..", "images", "Xsudoku");

function inspectImage(path: string): { width: number; height: number } | null {
  const buf = readFileSync(path);
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const { PNG } = require("pngjs");
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height };
  }
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    return { width: -1, height: -1 }; // jpeg
  }
  return null;
}

console.log("检查 Xsudoku 图片...\n");
for (let i = 1; i <= 40; i++) {
  const file = join(XSUDOKU_DIR, `${i}.png`);
  const info = inspectImage(file);
  if (info) {
    console.log(`${i}.png: ${info.width}x${info.height}`);
  } else {
    console.log(`${i}.png: 无法识别格式`);
  }
}
