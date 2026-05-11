/**
 * 水印批量测试 — 覆盖大小写字母+数字+连字符的各种组合
 */
import { mkdirSync } from "fs";
import { join } from "path";
import { BoardState } from "../src/board";
import { SudokuRenderer } from "../src/renderer";
import { recognizeBoard } from "../src/ocr";

const JIANKU_DIR = join(__dirname, "..", "..", "..", "images", "jianku", "wm-batch");

// 测试用例：覆盖各种组合
const TEST_WMS = [
  // 纯数字
  "1", "42", "789", "2024", "999",
  // 纯小写
  "a", "ab", "xyz", "test", "hello",
  // 纯大写
  "A", "AB", "XYZ", "OK", "HELLO",
  // 数字+连字符
  "1-2", "42-88", "2024-05", "9-9-9",
  // 小写+连字符
  "a-b", "dd-65", "abc-def", "x-9",
  // 大写+连字符
  "A-B", "AB-12", "HI-88", "OK-99",
  // 混合大小写
  "Aa", "aB", "AbC", "Test", "Hi", "OKay",
  // 混合大小写+连字符
  "Aa-1", "Bb-2", "Cc-33", "Dd-44",
  "A1-b2", "C3-d4", "E5-F6", "G7-h8",
  "A1b-2C", "X1-b2", "U1-v2",
  // 更复杂
  "AaBb-12", "Test-42", "OK-200",
  "ID-88", "VIP-99", "Max-10",
  // 边界
  "Zz-99", "WW-88", "MM-200", "DD-77",
  "Ii-11", "Ll-22", "Oo-00",
  // 中文场景常用
  "421", "82-4", "dd-65", "A1", "B2",
];

async function main() {
  mkdirSync(JIANKU_DIR, { recursive: true });

  const mockCtx: any = {
    logger: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
    baseDir: join(__dirname, ".."),
  };
  const renderer = new SudokuRenderer(mockCtx);

  const g = Array.from({ length: 9 }, () => Array(9).fill(0));
  g[0][0] = 5; g[0][1] = 3; g[0][4] = 7;
  const d = Array.from({ length: 9 }, () => Array(9).fill(0));
  const c = BoardState.computeStandardCandidates(g, d);

  console.log(`=== 测试 ${TEST_WMS.length} 种水印 ===\n`);

  let pass = 0, fail = 0;
  const failures: string[] = [];

  for (const wm of TEST_WMS) {
    const b = new BoardState(g, d, c.map(r => r.map(c => new Set(c))));
    b.watermark = wm;
    const buf = await renderer.renderResult(b);
    const ocr = await recognizeBoard(buf, null);
    const ok = ocr.watermark === wm;

    if (ok) pass++;
    else { fail++; failures.push(`${wm} → ${ocr.watermark || "(none)"}`); }

    const icon = ok ? "✓" : "✗";
    console.log(`  ${icon} ${wm.padEnd(12)} ${ocr.watermark !== wm ? "→ " + (ocr.watermark || "(none)") : ""}`);
  }

  console.log(`\n=== ${pass}/${TEST_WMS.length} pass (${(pass / TEST_WMS.length * 100).toFixed(0)}%) ===`);
  if (failures.length > 0) {
    console.log(`\n失败 (${fail}):`);
    for (const f of failures) console.log(`  ${f}`);
  }

  // Summary by category
  const cats: Record<string, { pass: number; total: number }> = {
    "纯数字": { pass: 0, total: 0 },
    "纯小写": { pass: 0, total: 0 },
    "纯大写": { pass: 0, total: 0 },
    "数字+连字符": { pass: 0, total: 0 },
    "小写+连字符": { pass: 0, total: 0 },
    "大写+连字符": { pass: 0, total: 0 },
    "混合大小写": { pass: 0, total: 0 },
    "混大小写+连字符": { pass: 0, total: 0 },
  };

  // Re-run to categorize
  for (const wm of TEST_WMS) {
    const b = new BoardState(g, d, c.map(r => r.map(c => new Set(c))));
    b.watermark = wm;
    const buf = await renderer.renderResult(b);
    const ocr = await recognizeBoard(buf, null);
    const ok = ocr.watermark === wm;

    let cat = "混大小写+连字符";
    const hasUpper = /[A-Z]/.test(wm), hasLower = /[a-z]/.test(wm);
    const hasDigit = /[0-9]/.test(wm), hasDash = /-/.test(wm);

    if (!hasUpper && !hasLower && hasDigit && !hasDash) cat = "纯数字";
    else if (!hasUpper && hasLower && !hasDigit && !hasDash) cat = "纯小写";
    else if (hasUpper && !hasLower && !hasDigit && !hasDash) cat = "纯大写";
    else if (!hasUpper && !hasLower && hasDigit && hasDash) cat = "数字+连字符";
    else if (!hasUpper && hasLower && hasDigit && hasDash) cat = "小写+连字符";
    else if (hasUpper && !hasLower && hasDigit && hasDash) cat = "大写+连字符";
    else if (hasUpper && hasLower && !hasDash) cat = "混合大小写";

    cats[cat].total++;
    if (ok) cats[cat].pass++;
  }

  console.log("\n分类统计:");
  for (const [cat, stats] of Object.entries(cats)) {
    if (stats.total > 0) {
      const pct = (stats.pass / stats.total * 100).toFixed(0);
      console.log(`  ${cat.padEnd(16)} ${stats.pass}/${stats.total} (${pct}%)`);
    }
  }
}

main();
