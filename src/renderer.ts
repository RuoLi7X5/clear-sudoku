/**
 * renderer.ts - 数独盘面 Canvas 渲染
 *
 * 改编自 sudoku-bot/src/renderer.ts，适配清数插件的渲染需求：
 * - 三级线粗：外框4px > 宫线2.5px > 格线1px
 * - 已知数：黑色大号
 * - 出数：蓝色大号
 * - 候选数：黑色小号，标准小九宫格排列
 */

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { Context } from "koishi";
import { BoardState } from "./board";

// ── Canvas 模块发现 ────────────────────────────────────────────────────────────

export let NativeCanvas: any = null;

(function discoverCanvasModule() {
  // 1. @ahdg/canvas 直接 require
  try { NativeCanvas = require("@ahdg/canvas"); if (NativeCanvas) return; } catch {}

  // 2. 通过 koishi-plugin-skia-canvas 定位 @ahdg/canvas
  try {
    const { dirname } = require("path") as typeof import("path");
    const skiaEntry = require.resolve("koishi-plugin-skia-canvas");
    const searchPaths = [dirname(skiaEntry), dirname(dirname(skiaEntry))];
    const nativePath = require.resolve("@ahdg/canvas", { paths: searchPaths });
    NativeCanvas = require(nativePath);
    if (NativeCanvas) return;
  } catch {}

  // 3. 尝试在上级目录（通常 koishi-app/node_modules 下也会有一份）
  try {
    const paths = [
      ...require.resolve.paths?.("koishi-plugin-skia-canvas") ?? [],
      ...((require.main?.paths) ?? []),
    ];
    const nativePath = require.resolve("@ahdg/canvas", { paths });
    NativeCanvas = require(nativePath);
    if (NativeCanvas) return;
  } catch {}

  // 4. @napi-rs/canvas（旧版 koishi-plugin-canvas）
  try { NativeCanvas = require("@napi-rs/canvas"); if (NativeCanvas) return; } catch {}

  // 5. 最终降级：legacy node-canvas
  try { NativeCanvas = require("canvas"); } catch {}
})();

// ── 中文字体配置 ────────────────────────────────────────────────────────────────

const CJK_FONT_FILES: Array<[string, string]> = [
  ["/usr/share/fonts/google-droid/DroidSansFallback.ttf", "Droid Sans Fallback"],
  ["/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc", "WenQuanYi Zen Hei"],
  ["/usr/share/fonts/wqy-microhei/wqy-microhei.ttc", "WenQuanYi Micro Hei"],
  ["/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
  ["/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "WenQuanYi Zen Hei"],
  ["/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", "WenQuanYi Micro Hei"],
  ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
  ["/usr/share/fonts/truetype/droid/DroidSansFallback.ttf", "Droid Sans Fallback"],
  ["/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
  ["/usr/local/share/fonts/wqy-zenhei.ttc", "WenQuanYi Zen Hei"],
  ["/System/Library/Fonts/PingFang.ttc", "PingFang SC"],
  ["C:\\Windows\\Fonts\\msyh.ttc", "Microsoft YaHei"],
  ["C:\\Windows\\Fonts\\simsun.ttc", "SimSun"],
];

export const CJK_FONT_STACK = [
  '"LXGW WenKai Lite"',
  '"Microsoft YaHei"',
  '"WenQuanYi Zen Hei"',
  '"WenQuanYi Micro Hei"',
  '"Noto Sans CJK SC"',
  '"Noto Sans SC"',
  '"PingFang SC"',
  '"Droid Sans Fallback"',
  "Arial",
  "sans-serif",
].join(", ");

function loadCJKFonts(extraDirs: string[], nativeCanvasOverride?: any): number {
  const nc = nativeCanvasOverride || NativeCanvas;
  const gf: any = nc?.GlobalFonts ?? null;
  if (!gf || typeof gf.registerFromPath !== "function") return 0;

  let loaded = 0;
  const testPaths = [...extraDirs, ...CJK_FONT_FILES.map(([p]) => p)];

  for (const path of testPaths) {
    try {
      if (existsSync(path)) {
        gf.registerFromPath(path);
        loaded++;
      }
    } catch {}
  }

  return loaded;
}

// ── 字体自动下载（兜底）─────────────────────────────────────────────────────────

const FONT_URLS = [
  "https://registry.npmmirror.com/-/binary/fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff2",
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@latest/files/noto-sans-sc-latin-400-normal.woff2",
];

async function downloadAndCacheFont(
  cacheDir: string,
  gf: any,
  logger?: { info: (s: string) => void; warn: (s: string) => void },
): Promise<void> {
  const fontPath = join(cacheDir, "NotoSansSC.woff2");
  if (existsSync(fontPath)) {
    try {
      const buf = require("fs").readFileSync(fontPath);
      gf.register(buf, "Noto Sans SC");
      return;
    } catch {}
  }

  for (const url of FONT_URLS) {
    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        const lib = require("https");
        const req = lib.get(url, { timeout: 30_000 }, (res: any) => {
          if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      });

      mkdirSync(cacheDir, { recursive: true });
      require("fs").writeFileSync(fontPath, buf);
      gf.register(buf, "Noto Sans SC");
      logger?.info(`[字体] 下载成功 (${(buf.length / 1024).toFixed(0)}KB)`);
      return;
    } catch (err: any) {
      logger?.warn(`[字体] 下载失败: ${err.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Renderer
// ═══════════════════════════════════════════════════════════════════════════════

export interface RenderOptions {
  showCandidates: boolean;
  watermark?: string;
  largeFontSize?: number;
  /** 指定渲染字体（默认微软雅黑）。仅用于字体模板生成时切换字体。 */
  fontFamily?: string;
}

export class SudokuRenderer {
  private static fontsInitialized = false;
  private tmpDir: string;

  constructor(private ctx: Context) {
    // Font init (once)
    if (!SudokuRenderer.fontsInitialized) {
      SudokuRenderer.fontsInitialized = true;
      const logger = ctx.logger("clear-sudoku");
      const extraDirs = ctx.baseDir
        ? [join(ctx.baseDir, "fonts"), join(ctx.baseDir, "data", "fonts")]
        : [];

      const loaded = loadCJKFonts(extraDirs, NativeCanvas);

      const gf: any = NativeCanvas?.GlobalFonts ?? null;
      if (gf) {
        const cacheDir = ctx.baseDir
          ? join(ctx.baseDir, "data", "clear-sudoku", "fonts")
          : join(require("os").tmpdir(), "clear-sudoku-fonts");

        if (loaded === 0) {
          logger.warn("[字体] 未找到系统 CJK 字体，尝试自动下载…");
          downloadAndCacheFont(cacheDir, gf, logger).catch(() => {});
        }
      }
    }

    // Temp dir
    this.tmpDir = ctx.baseDir
      ? join(ctx.baseDir, "tmp", "clear-sudoku-images")
      : join(require("os").tmpdir(), "clear-sudoku-images");
    try { mkdirSync(this.tmpDir, { recursive: true }); } catch {}
  }

  private createCanvasCtx(w: number, h: number): { canvas: any; ctx2d: any } {
    let canvas: any;

    // 延迟再试一次 discovery（可能在 init 之后才安装的 canvas 模块）
    if (!NativeCanvas) {
      try { NativeCanvas = require("@napi-rs/canvas"); } catch {}
      if (!NativeCanvas) {
        try { NativeCanvas = require("@ahdg/canvas"); } catch {}
      }
      if (!NativeCanvas) {
        try { NativeCanvas = require("canvas"); } catch {}
      }
    }

    if (NativeCanvas) {
      canvas = typeof NativeCanvas.createCanvas === "function"
        ? NativeCanvas.createCanvas(w, h)
        : new NativeCanvas(w, h);
    }

    if (!canvas) throw new Error("Canvas 模块不可用，请确保已安装 koishi-plugin-skia-canvas");
    const ctx2d = canvas.getContext("2d");
    return { canvas, ctx2d };
  }

  private async canvasToBuffer(canvas: any): Promise<Buffer> {
    let buffer: Buffer;
    if (typeof canvas.toBuffer === "function") {
      buffer = canvas.toBuffer("image/png");
    } else if (typeof canvas.encode === "function") {
      buffer = await canvas.encode("png");
    } else if (typeof canvas.png === "function") {
      buffer = await canvas.png();
    } else if (typeof canvas.toDataURL === "function") {
      const dataUrl = canvas.toDataURL("image/png");
      buffer = Buffer.from(dataUrl.split(",")[1], "base64");
    } else {
      throw new Error("Canvas 不支持转换为 Buffer");
    }
    if (!buffer || buffer.length === 0) throw new Error("Canvas 渲染返回空 Buffer");
    return buffer;
  }

  async saveTmpImage(buf: Buffer): Promise<string> {
    const fsp = require("fs").promises;
    const fileName = `clearsudoku_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
    const filePath = join(this.tmpDir, fileName);
    await fsp.writeFile(filePath, buf);
    // Background cleanup
    fsp.readdir(this.tmpDir).then(async (files: string[]) => {
      const now = Date.now();
      for (const file of files) {
        if (!file.endsWith(".png")) continue;
        const fp = join(this.tmpDir, file);
        try { const stat = await fsp.stat(fp); if (now - stat.mtimeMs > 600_000) await fsp.unlink(fp); } catch {}
      }
    }).catch(() => {});
    return filePath;
  }

  // ── 主渲染函数 ─────────────────────────────────────────────────────────────

  async render(board: BoardState, options: RenderOptions = { showCandidates: true }): Promise<Buffer> {
    const cellSize = 100;
    const gridSize = cellSize * 9;
    const padding = 24;
    const size = gridSize + padding * 2;

    const { canvas, ctx2d } = this.createCanvasCtx(size, size);

    // White background
    ctx2d.fillStyle = "#ffffff";
    ctx2d.fillRect(0, 0, size, size);

    ctx2d.save();
    ctx2d.translate(padding, padding);

    // ── Step 1: cell grid lines (2px) ──
    ctx2d.strokeStyle = "#000000";
    ctx2d.lineWidth = 2;
    for (let i = 0; i <= 9; i++) {
      const pos = i * cellSize;
      ctx2d.beginPath();
      ctx2d.moveTo(pos, 0);
      ctx2d.lineTo(pos, gridSize);
      ctx2d.stroke();
      ctx2d.beginPath();
      ctx2d.moveTo(0, pos);
      ctx2d.lineTo(gridSize, pos);
      ctx2d.stroke();
    }

    // ── Step 2: box borders (5px) ──
    ctx2d.lineWidth = 5;
    for (let i = 0; i <= 9; i += 3) {
      const pos = i * cellSize;
      ctx2d.beginPath();
      ctx2d.moveTo(pos, 0);
      ctx2d.lineTo(pos, gridSize);
      ctx2d.stroke();
      ctx2d.beginPath();
      ctx2d.moveTo(0, pos);
      ctx2d.lineTo(gridSize, pos);
      ctx2d.stroke();
    }

    // ── Step 3: outer border (8px) ──
    ctx2d.lineWidth = 8;
    ctx2d.strokeRect(0, 0, gridSize, gridSize);

    // ── Step 4: render numbers ──
    const largeSize = options.largeFontSize || 77;
    const fontStack = options.fontFamily || CJK_FONT_STACK;
    const largeFont = `${largeSize}px ${fontStack}`;
    const smallFont = `25px ${fontStack}`;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cx = c * cellSize + cellSize / 2;
        const cy = r * cellSize + cellSize / 2;

        const givVal = board.givens[r][c];
        const dedVal = board.deduced[r][c];

        if (givVal > 0) {
          ctx2d.font = largeFont;
          ctx2d.fillStyle = "#000000";
          ctx2d.textAlign = "center";
          ctx2d.textBaseline = "middle";
          ctx2d.fillText(givVal.toString(), cx, cy);
        } else if (dedVal > 0) {
          ctx2d.font = largeFont;
          ctx2d.fillStyle = "#1111FF";
          ctx2d.textAlign = "center";
          ctx2d.textBaseline = "middle";
          ctx2d.fillText(dedVal.toString(), cx, cy);
        } else if (options.showCandidates && board.candidates[r][c].size > 0) {
          // Candidates (black, small, 3x3 sub-grid)
          ctx2d.font = smallFont;
          ctx2d.fillStyle = "#000000";
          ctx2d.textAlign = "center";
          ctx2d.textBaseline = "middle";
          const cands = board.candidates[r][c];
          const subCellW = cellSize / 3;
          const subCellH = cellSize / 3;
          for (let v = 1; v <= 9; v++) {
            if (!cands.has(v)) continue;
            const subR = Math.floor((v - 1) / 3);
            const subC = (v - 1) % 3;
            const sx = c * cellSize + subC * subCellW + subCellW / 2;
            const sy = r * cellSize + subR * subCellH + subCellH / 2;
            ctx2d.fillText(v.toString(), sx, sy);
          }
        }
      }
    }

    // ── Step 5: watermark (red, bottom-left, below border) ──
    if (options.watermark) {
      const wmFont = `16px ${CJK_FONT_STACK}`;
      ctx2d.font = wmFont;
      ctx2d.fillStyle = "#FF0000";
      ctx2d.textAlign = "left";
      ctx2d.textBaseline = "top";
      ctx2d.fillText(options.watermark, 4, gridSize + 6);
    }

    ctx2d.restore();
    return await this.canvasToBuffer(canvas);
  }

  /**
   * 渲染OCR识别验证图（无任何修改，纯展示OCR结果）
   */
  async renderVerification(board: BoardState): Promise<Buffer> {
    return this.render(board, { showCandidates: true, watermark: board.watermark });
  }

  /**
   * 渲染清数结果图
   */
  async renderResult(board: BoardState): Promise<Buffer> {
    return this.render(board, { showCandidates: true, watermark: board.watermark });
  }
}
