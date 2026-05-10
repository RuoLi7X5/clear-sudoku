/**
 * image.ts - 从QQ引用消息中提取图片
 *
 * 适配自 image-saver 插件的 extractImageFromQuote / downloadImage 逻辑。
 * 支持 http/https、file://、data URI、本地路径等多种图片来源。
 */

import { h } from "koishi";

// ── 工具：图片URL提取 ──────────────────────────────────────────────────────────

function extractFirstImageUrl(elements: h[]): string | null {
  const nodes = [
    ...h.select(elements, "img"),
    ...h.select(elements, "image"),
  ];
  for (const node of nodes) {
    const attrs: any = (node as any)?.attrs ?? {};
    const candidates = [attrs.src, attrs.url, attrs.file];
    for (const value of candidates) {
      if (typeof value === "string" && value) return value;
    }
  }
  return null;
}

// ── 工具：图片下载 ──────────────────────────────────────────────────────────────

function detectExt(buf: Buffer, contentType: string): string {
  if (buf.length >= 4) {
    if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "gif";
    if (
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf.length >= 12 && buf.slice(8, 12).toString("ascii") === "WEBP"
    ) return "webp";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return "png";
}

async function downloadImage(url: string, depth = 0): Promise<Buffer> {
  if (depth > 3) throw new Error("重定向次数过多");

  // data: URI
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("无效的 data URI");
    return Buffer.from(match[2], "base64");
  }

  // file:// URL
  if (url.startsWith("file://")) {
    const { fileURLToPath } = require("url") as typeof import("url");
    const fsp = require("fs").promises as typeof import("fs").promises;
    return fsp.readFile(fileURLToPath(url));
  }

  // 本地绝对路径
  if ((url.startsWith("/") && !url.includes("?")) || /^[a-zA-Z]:[\\/]/.test(url)) {
    const fsp = require("fs").promises as typeof import("fs").promises;
    return fsp.readFile(url);
  }

  // http / https
  return new Promise((resolve, reject) => {
    const lib: typeof import("https") = url.startsWith("https")
      ? require("https")
      : require("http");

    const req = lib.get(
      url,
      {
        timeout: 30_000,
        headers: { "User-Agent": "Mozilla/5.0 Koishi-clear-sudoku/1.0" },
      } as any,
      (res: any) => {
        const { statusCode, headers } = res;

        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          downloadImage(headers.location as string, depth + 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("图片下载超时"));
    });
  });
}

// ── 引用消息中的图片提取 ──────────────────────────────────────────────────────

function isLikelyAvatarLike(value: string): boolean {
  const text = value.toLowerCase();
  return (
    text.includes("qlogo.cn") ||
    text.includes("/avatar") ||
    text.includes("portrait") ||
    text.includes("/head/") ||
    text.includes("/headimg")
  );
}

function extractImageSourceFromElements(elements: any[]): string | null {
  for (const el of elements) {
    const element = el as Record<string, any>;
    const segmentType = (element?.type ?? "").toString().toLowerCase();
    if (segmentType === "image" || segmentType === "img") {
      const data = element?.data ?? {};
      const candidates = [data.url, data.file, data.path, data.src];
      for (const value of candidates) {
        if (typeof value === "string" && value && !isLikelyAvatarLike(value)) {
          return value;
        }
      }
    }
  }
  return null;
}

function extractStrictMessageImage(elements: any[]): string | null {
  const nodes = [
    ...h.select(elements as h[], "img"),
    ...h.select(elements as h[], "image"),
  ];
  for (const node of nodes) {
    const attrs: any = (node as any)?.attrs ?? {};
    const candidates = [attrs.src, attrs.url, attrs.file];
    for (const value of candidates) {
      if (typeof value !== "string" || !value) continue;
      if (isLikelyAvatarLike(value)) continue;
      return value;
    }
  }
  return null;
}

function extractImageFromContentString(content?: string): string | null {
  if (!content) return null;
  try {
    const fromParsed = extractFirstImageUrl(h.parse(content));
    if (fromParsed) return fromParsed;
  } catch {}

  // onebot 格式：[CQ:image,file=...,url=...]
  const urlMatch = content.match(/\[CQ:image,[^\]]*url=([^,\]]+)[^\]]*\]/i);
  const fileMatch = content.match(/\[CQ:image,[^\]]*file=([^,\]]+)[^\]]*\]/i);
  const decodedFile = fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : null;
  if (decodedFile && (
    /^https?:\/\//i.test(decodedFile) ||
    /^file:\/\//i.test(decodedFile) ||
    /^[a-zA-Z]:[\\/]/.test(decodedFile) ||
    decodedFile.startsWith("/")
  )) {
    return decodedFile;
  }
  if (urlMatch?.[1]) return decodeURIComponent(urlMatch[1]);
  if (decodedFile) return decodedFile;
  return null;
}

function extractStrictQuotedImageFromMessageObject(message: any): string | null {
  if (!message || typeof message !== "object") return null;

  // Check raw content for CQ:image
  const rawCandidates = [
    message.raw_message, message.raw, message.content, message.text,
    typeof message.message === "string" ? message.message : undefined,
  ];
  for (const cand of rawCandidates) {
    const found = extractImageFromContentString(cand);
    if (found && !isLikelyAvatarLike(found)) return found;
  }

  // Check elements arrays
  for (const key of ["elements", "message"]) {
    if (Array.isArray(message[key])) {
      const fromElements = extractImageSourceFromElements(message[key]);
      if (fromElements) return fromElements;
      const fromStrict = extractStrictMessageImage(message[key]);
      if (fromStrict) return fromStrict;
    }
  }

  // Check parsed content
  if (typeof message.content === "string") {
    try {
      const parsed = h.parse(message.content);
      const found = extractStrictMessageImage(parsed);
      if (found) return found;
    } catch {}
  }

  return null;
}

/** 从 onebot 事件原始数据中提取 reply 消息 ID */
function extractReplyIdFromEvent(event: any): string | null {
  if (!event || typeof event !== "object") return null;

  // 直接字段
  const direct = event?.reply?.message_id ?? event?.reply?.id;
  if (direct) return String(direct);

  // onebot 消息段格式：[{ type: "reply", data: { id: "-xxx" } }, ...]
  const dataSources = [event?._data, event?.raw, event];
  for (const source of dataSources) {
    if (!source || typeof source !== "object") continue;
    // source.message 可能是消息段数组
    const segments = source.message ?? source.data?.message;
    if (Array.isArray(segments)) {
      for (const seg of segments) {
        if (seg?.type === "reply" && seg?.data?.id) {
          return String(seg.data.id);
        }
      }
    }
    // source.reply
    if (source.reply?.message_id || source.reply?.id) {
      return String(source.reply.message_id || source.reply.id);
    }
  }

  return null;
}

// ── 主入口 ──────────────────────────────────────────────────────────────────────

/**
 * 从引用消息中提取图片并下载为 Buffer。
 * 返回 null 表示未找到图片。
 */
export async function extractImageBufferFromQuote(session: any): Promise<Buffer | null> {
  // 1. 直接从 session.quote 中提取图片
  const directQuoteImage = extractStrictQuotedImageFromMessageObject(session?.quote);
  if (directQuoteImage) {
    try {
      return await downloadImage(directQuoteImage);
    } catch {}
  }

  // 2. 获取 quote 消息 ID（多种来源）
  const quoteId =
    session?.__clearSudokuReplyId ??              // middleware 提取的 reply ID（优先级最高）
    session?.quote?.id ??
    session?.quote?.messageId ??
    session?.quote?.msgId ??
    extractReplyIdFromEvent(session?.event);       // 从事件原始数据提取
  const internal = session?.bot?.internal;
  const platformText = `${session?.platform ?? ""} ${session?.bot?.platform ?? ""}`.toLowerCase();
  const isOnebotLike = platformText.includes("onebot") || platformText.includes("llbot");

  if (quoteId && isOnebotLike && internal && typeof internal === "object") {
    // 尝试 get_msg（onebot 原始 API）
    const getMsgFn = internal.get_msg ?? internal.getMsg;
    if (typeof getMsgFn === "function") {
      try {
        const raw = await getMsgFn.call(internal, quoteId);
        // onebot get_msg 返回 { data: { message: [...] } } 或直接是消息数组
        const data = raw?.data ?? raw;
        let segments = data?.message ?? data?.messages ?? data;
        if (Array.isArray(segments)) {
          // onebot 消息段格式：[{ type: "image", data: { url: "...", file: "..." } }]
          for (const seg of segments) {
            if (seg?.type === "image" || seg?.type === "img") {
              const d = seg?.data ?? {};
              const imgUrl = d.url ?? d.file ?? d.path ?? d.src;
              if (imgUrl && !isLikelyAvatarLike(imgUrl)) {
                try { return await downloadImage(imgUrl); } catch {}
              }
            }
          }
        }
        // 也可能是字符串格式（CQ码）
        if (typeof segments === "string") {
          const imgUrl = extractImageFromContentString(segments);
          if (imgUrl) {
            try { return await downloadImage(imgUrl); } catch {}
          }
        }
      } catch {}
    }
  }

  // 4. Satori 路径：通过 getMessage API
  if (quoteId && session?.bot?.getMessage) {
    try {
      // 尝试带 channelId
      const quoted = await session.bot.getMessage(
        session.channelId,
        quoteId,
      );
      const fromQuoted = extractImageFromMessageResponse(quoted);
      if (fromQuoted) {
        try { return await downloadImage(fromQuoted); } catch {}
      }
    } catch {
      try {
        // 尝试不带 channelId（onebot 兼容）
        const quoted = await session.bot.getMessage(quoteId);
        const fromQuoted = extractImageFromMessageResponse(quoted);
        if (fromQuoted) {
          try { return await downloadImage(fromQuoted); } catch {}
        }
      } catch {}
    }
  }

  // 5. 遍历 session.event 查找图片
  const eventSources = [session?.event?._data, session?.event?.raw, session?.event];
  for (const source of eventSources) {
    if (!source || typeof source !== "object") continue;
    // onebot event format: source.message is an array of segments
    if (Array.isArray(source.message)) {
      const fromSegments = extractImageUrlFromOnebotSegments(source.message);
      if (fromSegments) {
        try { return await downloadImage(fromSegments); } catch {}
      }
    }
    const imgUrl = extractStrictQuotedImageFromMessageObject(source);
    if (imgUrl) {
      try { return await downloadImage(imgUrl); } catch {}
    }
  }

  return null;
}

/** 处理 getMessage 响应的多种格式 */
function extractImageFromMessageResponse(msg: any): string | null {
  if (!msg || typeof msg !== "object") return null;

  // Satori 格式：msg.elements
  if (Array.isArray(msg.elements)) {
    const fromElements = extractImageSourceFromElements(msg.elements);
    if (fromElements) return fromElements;
    const fromStrict = extractStrictMessageImage(msg.elements);
    if (fromStrict) return fromStrict;
  }

  // onebot 嵌套格式
  if (Array.isArray(msg.message)) {
    const fromSegments = extractImageUrlFromOnebotSegments(msg.message);
    if (fromSegments) return fromSegments;
  }

  // data.message
  if (Array.isArray(msg.data?.message)) {
    const fromSegments = extractImageUrlFromOnebotSegments(msg.data.message);
    if (fromSegments) return fromSegments;
  }

  // 字符串类字段
  const strCandidates = [msg.content, msg.text, msg.raw_message, msg.raw,
    msg.data?.content, msg.data?.raw_message, msg.data?.text];
  for (const cand of strCandidates) {
    const found = extractImageFromContentString(cand);
    if (found && !isLikelyAvatarLike(found)) return found;
  }

  return extractStrictQuotedImageFromMessageObject(msg);
}

/** 从 onebot 消息段数组中提取图片 URL */
function extractImageUrlFromOnebotSegments(segments: any[]): string | null {
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    if (seg.type === "image" || seg.type === "img") {
      const d = seg.data ?? {};
      const url = d.url ?? d.file ?? d.path ?? d.src;
      if (typeof url === "string" && url && !isLikelyAvatarLike(url)) return url;
    }
    // 嵌套 elements
    if (Array.isArray(seg.elements)) {
      const nested = extractImageUrlFromOnebotSegments(seg.elements);
      if (nested) return nested;
    }
  }
  return null;
}
