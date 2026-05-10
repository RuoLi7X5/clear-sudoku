/**
 * 模拟 QQ 真实场景的指令解析测试
 */
import { parseCommand } from "../lib/parser";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 模拟 middleware 处理
function simulateMiddleware(content: string, commandName: string): string {
  // Normalize fullwidth
  content = content.replace(/[！﹗︕]/g, "!");

  // Strip leading prefixes
  if (content.includes("!")) {
    content = content
      .replace(/^(?:<quote\b[^>]*\/>\s*)+/i, "")
      .replace(/^(?:<at\b[^>]*\/>\s*)+/i, "")
      .replace(/^(?:\[CQ:(?:reply|at),[^\]]+\]\s*)+/i, "")
      .replace(/^(?:@[^!\s]+\s*)+(?=!)/, "");
  }

  // Normalize "! 清数" → "!清数"
  if (content.includes("!")) {
    for (const name of [commandName, "双图", "单图", "清数帮助"]) {
      const pattern = new RegExp(`!\\s*(${escapeRegExp(name)})(?=\\s|$)`, "g");
      content = content.replace(pattern, `!$1`);
    }
  }

  return content;
}

// 模拟 Koishi 命令框架提取 text 参数
function extractCommandText(content: string, trigger: string): string | null {
  if (!content.startsWith(trigger)) return null;
  return content.slice(trigger.length).trim();
}

const testCases = [
  // [原始内容, 描述]
  ["!清数 A58 8题", "直接发送"],
  ["!清数 A58 #8", "井号格式"],
  ["!清数 A58,B44 8题", "多操作+题号"],
  ["! 清数 A58 8题", "空格分隔"],
  ["！清数 A58 8题", "全角感叹号"],
  ["[CQ:reply,id=-12345]!清数 A58 8题", "CQ引用+指令"],
  ["[CQ:reply,id=-12345][CQ:at,qq=123]!清数 A58 8题", "CQ引用+at+指令"],
  ["[CQ:reply,id=-12345]! 清数 A58 8题", "CQ引用+空格指令"],
  ["!清数 A58 第8题", "第X题格式"],
];

console.log("=== QQ 真实场景解析测试 ===\n");
let allPassed = true;

for (const [raw, desc] of testCases) {
  const normalized = simulateMiddleware(raw, "清数");
  const text = extractCommandText(normalized, "!清数");

  if (!text) {
    console.log(`[FAIL] ${desc}: 无法提取命令文本 (normalized="${normalized}")`);
    allPassed = false;
    continue;
  }

  const result = parseCommand(text);
  if ("error" in result) {
    console.log(`[FAIL] ${desc}: "${raw}" → text="${text}" → ${result.error}`);
    allPassed = false;
    continue;
  }

  const status = result.questionNumber ? `OK qn=${result.questionNumber}` : "OK (无题号)";
  console.log(`[${status}] ${desc}: "${raw}" → text="${text}"`);
}

console.log(`\n${allPassed ? "全部通过!" : "存在失败"}`);
