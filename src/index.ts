import { Context, Schema, h } from "koishi";
import { extractImageBufferFromQuote } from "./image";
import { recognizeBoard, preloadTemplates } from "./ocr";
import { parseCommand } from "./parser";
import { BoardState } from "./board";
import { applyIntuitiveChain } from "./solver-chain";
import { SudokuRenderer } from "./renderer";
import { Replies } from "./messages";

export const name = "clear-sudoku";

export interface Config {
  debugOutput: boolean;
  commandName: string;
}

export const Config: Schema<Config> = Schema.object({
  debugOutput: Schema.boolean()
    .default(true)
    .description("调试模式：输出识别验证图 + 清数结果图，关闭则仅输出结果图"),
  commandName: Schema.string()
    .default("清数")
    .description("触发指令名称（不含感叹号）"),
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBangTriggers(commandName: string): string[] {
  return [...new Set([
    `!${commandName}`,
    `！${commandName}`,
    `﹗${commandName}`,
    `︕${commandName}`,
  ])];
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger("clear-sudoku");

  const commandName = config.commandName || "清数";
  const triggers = buildBangTriggers(commandName);

  // Runtime mode: defaults from config, toggleable via !双图 / !单图
  let dualImageMode = config.debugOutput;

  // Renderer instance (font loading happens once)
  const renderer = new SudokuRenderer(ctx);

  // 后台预加载模板（不阻塞启动）
  preloadTemplates();
  logger.info("[清数] 数字模板预加载完成");

  // Middleware: normalize fullwidth exclamation marks and strip @ prefixes
  ctx.middleware(async (session, next) => {
    if (session.content) {
      // 在 strip 之前先提取 reply 消息 ID
      const replyMatch = session.content.match(/\[CQ:reply,[^\]]*id=(-?\d+)/i);
      const quoteMatch = session.content.match(/<quote\b[^>]*\bid="(-?\d+)"[^>]*\/?>/i);
      const contentReplyId = replyMatch?.[1] ?? quoteMatch?.[1];
      if (contentReplyId) {
        (session as any).__clearSudokuReplyId = contentReplyId;
      }

      // Normalize: ！(FF01)、﹗(FE57)、︕(FE15) → !
      session.content = session.content.replace(/[！﹗︕]/g, "!");
      // Strip leading <quote/>, <at/>, [CQ:reply], [CQ:at] from content
      if (session.content.includes("!")) {
        session.content = session.content
          .replace(/^(?:<quote\b[^>]*\/>\s*)+/i, "")
          .replace(/^(?:<at\b[^>]*\/>\s*)+/i, "")
          .replace(/^(?:\[CQ:(?:reply|at),[^\]]+\]\s*)+/i, "")
          .replace(/^(?:@[^!\s]+\s*)+(?=!)/, "");
      }
      // Normalize "! 清数" → "!清数" (also handle !双图 / !单图)
      if (session.content.includes("!")) {
        for (const name of [commandName, "双图", "单图", "清数帮助"]) {
          const pattern = new RegExp(`!\\s*(${escapeRegExp(name)})(?=\\s|$)`, "g");
          session.content = session.content.replace(pattern, `!$1`);
        }
      }
    }
    return next();
  }, true);

  // ── Helper: send image ─────────────────────────────────────────────────────
  async function sendImage(session: any, buf: Buffer): Promise<void> {
    // Try base64 first, fallback to file://
    try {
      await session.send(
        h.image(`data:image/png;base64,${buf.toString("base64")}`),
      );
    } catch {
      const filePath = await renderer.saveTmpImage(buf);
      await session.send(h.image(`file://${filePath}`));
    }
  }

  // ── 帮助指令 ──────────────────────────────────────────────────────────────
  ctx.command("!清数帮助", "查看清数指令的使用说明")
    .alias("！清数帮助", "﹗清数帮助", "︕清数帮助")
    .action(() => Replies.commandHelp());

  // ── 模式切换指令 ────────────────────────────────────────────────────────────
  ctx.command("!双图", "切换为双图模式：识别验证图 + 清数结果图")
    .alias("！双图", "﹗双图", "︕双图")
    .action(async ({ session }) => {
      if (!session?.guildId) return Replies.guildOnly();
      dualImageMode = true;
      return "小仙已切换到双图模式啦~ 接下来清数时会把识别结果和清数结果都发给你哦";
    });

  ctx.command("!单图", "切换为单图模式：只发清数结果图")
    .alias("！单图", "﹗单图", "︕单图")
    .action(async ({ session }) => {
      if (!session?.guildId) return Replies.guildOnly();
      dualImageMode = false;
      return "小仙已切换到单图模式~ 接下来清数时只发最终结果图";
    });

  // ── Main command ────────────────────────────────────────────────────────────
  const cmd = ctx
    .command(`${triggers[0]} <text:text>`, "清数：从引用图片识别数独盘面并清除候选数")
    .action(async ({ session }, text) => {
      if (!session) return Replies.genericError("获取不到会话信息");

      // Only in guild
      if (!session.guildId) return Replies.guildOnly();

      const userText = (text || "").trim();

      // Step 1: Parse command first (fast fail)
      logger.info(`[清数] 解析指令: "${userText}"`);
      const parseResult = parseCommand(userText);
      if ("error" in parseResult) {
        return Replies.commandHelp(parseResult.error);
      }
      if (parseResult.watermark) {
        logger.info(`[清数] 提取到水印: ${parseResult.watermark}`);
      }

      // Step 2: Extract image from quote
      let imageBuf: Buffer | null = null;
      try {
        logger.debug(`[清数] 开始提取引用图片, quoteId=${(session as any).__clearSudokuReplyId ?? session?.quote?.id ?? "none"}`);
        imageBuf = await extractImageBufferFromQuote(session);
      } catch (err: any) {
        logger.warn(`[清数] 图片提取异常: ${err.message}`);
        return Replies.ocrFailed(err.message);
      }

      if (!imageBuf) {
        logger.debug("[清数] 未提取到图片");
        return Replies.needImage();
      }
      logger.info(`[清数] 图片提取成功, 大小: ${(imageBuf.length / 1024).toFixed(1)}KB`);

      // Step 3: OCR recognize board (pngjs 解码 + 模板匹配，无需 canvas)
      let ocrResult;
      try {
        ocrResult = await recognizeBoard(imageBuf, logger);
      } catch (err: any) {
        logger.warn(`[清数] OCR 失败: ${err.message}`, err.stack);
        return;
      }

      // Check if board is empty
      const hasAnyValue = ocrResult.cells.some(row =>
        row.some(cell => cell.value > 0 || cell.candidates.length > 0),
      );
      if (!hasAnyValue) {
        return Replies.ocrEmpty();
      }

      // Step 4: Create BoardState from OCR, carry watermark
      const board = BoardState.fromOCR(ocrResult);
      // 用户指令中的水印优先；其次用 OCR 从渲染图中检测到的水印
      board.watermark = parseResult.watermark ?? ocrResult.watermark;

      // Step 5: If dual image mode, send verification image first
      if (dualImageMode) {
        try {
          const verifBuf = await renderer.renderVerification(board.clone());
          await sendImage(session, verifBuf);
        } catch (err: any) {
          logger.warn(`渲染验证图失败: ${err.message}`);
        }
      }

      // Step 6: Apply user clear instructions
      let totalDeleted = 0;
      const notFound: Array<{ row: number; col: number; cands: number[] }> = [];
      const alreadyResolvedCells: string[] = [];

      for (const op of parseResult.operations) {
        // Check if cell is already resolved
        if (board.isResolved(op.row, op.col)) {
          const rl = String.fromCharCode(65 + op.row);
          if (!alreadyResolvedCells.includes(`${rl}${op.col + 1}`)) {
            alreadyResolvedCells.push(`${rl}${op.col + 1}`);
          }
          continue;
        }

        // Check which candidates actually exist
        const existing: number[] = [];
        const missing: number[] = [];
        for (const cand of op.candidates) {
          if (board.candidates[op.row][op.col].has(cand)) {
            existing.push(cand);
          } else {
            missing.push(cand);
          }
        }

        // Apply clears for existing candidates
        if (existing.length > 0) {
          const deleted = board.applyClear(op.row, op.col, existing);
          totalDeleted += deleted;
        }

        if (missing.length > 0) {
          notFound.push({ row: op.row, col: op.col, cands: missing });
        }
      }

      // If nothing was deleted and nothing was already resolved
      if (totalDeleted === 0 && alreadyResolvedCells.length === 0) {
        return Replies.allCandidatesNotFound();
      }

      // Step 7: Apply L1-L3 intuitive chain
      const chainResult = applyIntuitiveChain(board);

      // Step 8: Render result and reply (仅发结果图，省略文字回复)
      logger.info(`[清数] 渲染结果图, watermark=${board.watermark ?? "无"}`);
      try {
        const resultBuf = await renderer.renderResult(board);
        await sendImage(session, resultBuf);
      } catch (err: any) {
        logger.error(`渲染结果图失败: ${err.message}`);
        return Replies.genericError(`渲染图片时出错了：${err.message}`);
      }
    });

  for (const alias of triggers.slice(1)) cmd.alias(alias);

  logger.info(`清数插件已加载，指令：${triggers[0]}`);
}
