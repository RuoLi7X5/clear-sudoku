/**
 * messages.ts - 小仙人设回复文案
 *
 * 所有面向用户的回复以"小仙"第一人称。
 */

function cellName(row: number, col: number): string {
  const rowLetter = String.fromCharCode(65 + row);
  return `${rowLetter}${col + 1}`;
}

export const Replies = {
  /** 指令格式错误 */
  commandHelp: (hint?: string) => {
    const extra = hint ? `（${hint}）` : "";
    return `唔…小仙看不懂这个指令呢${extra}\n格式应该是 \`!清数 A59,B44\` 这样哦~\n\n` +
      `> 说明：\n` +
      `> - 行用字母A-I，列用数字1-9\n` +
      `> - \`A59\` = A5格清候选数9\n` +
      `> - \`A5(9)\` = A5格清候选数9\n` +
      `> - \`A5(59)\` = A5格清候选数5和9\n` +
      `> - \`AB59\` = A5、B5清候选数9\n` +
      `> - \`ABC57(9)\` = A5,A7,B5,B7,C5,C7清候选数9\n\n` +
      `> 水印（可选，末尾添加 # 符号）：\n` +
      `> - \`!清数 A59 #421\` → 左下角红色水印 421\n` +
      `> - \`!清数 A59 #82-4\` → 水印 82-4\n` +
      `> - 仅数字和连字符有效，二次清数自动识别继承`;
  },

  /** 没有引用图片 */
  needImage: () =>
    "小仙需要你**回复一张数独图片**才能开始清数哦~\n格式：引用图片 + 发送 `!清数 A59,B44`",

  /** OCR失败 */
  ocrFailed: (detail?: string) =>
    `啊哦…小仙没能认出数独盘面呢 (´;ω;` + "`)\n" +
    `图片可能不够清晰，或者格子线太淡了…要不要试试更清楚的图？` +
    (detail ? `\n（调试信息：${detail}）` : ""),

  /** 全空白盘面 */
  ocrEmpty: () =>
    "小仙认出了盘面但好像上面什么数字都没有呢…是不是发错图了？",

  /** 调试模式：仅识别盘面 */
  debugVerification: () =>
    "小仙认出了盘面，这是识别结果哦~ 看看对不对？\n" +
    "如果识别有误，可以调整图片后重试；确认无误的话，在**回复这条消息**时发送清数指令继续~\n" +
    "（可以回复多次，每次小仙都会基于识别结果重新计算哦）",

  /** 清数成功，有新的出数 */
  clearWithDeductions: (deductionCount: number, deductions: string[]) => {
    const list = deductions.slice(0, 5).join("、");
    const more = deductions.length > 5 ? `等${deductions.length}个` : "";
    return `小仙已经帮你清除了！还找到了 **${deductionCount}** 个新数字呢：${list}${more}\n看看结果吧~`;
  },

  /** 清数成功，无新出数 */
  clearNoDeductions: () =>
    "已经清除啦，不过没有新的推理结果哦，再试试别的清除？",

  /** 格已填 */
  alreadyResolved: (row: number, col: number) =>
    `${cellName(row, col)}已经填好啦，不用再清除啦~`,

  /** 候选数不存在 */
  candidateNotFound: (row: number, col: number, cands: number[]) =>
    `唔…${cellName(row, col)}格没有候选数${cands.join("、")}哦，小仙什么都没做~`,

  /** 部分候选数不存在（部分删了部分没删） */
  candidatePartial: (deleted: number, notFound: Array<{ row: number; col: number; cands: number[] }>) => {
    const parts = notFound.slice(0, 3).map(
      ({ row, col, cands }) => `${cellName(row, col)}的${cands.join("、")}`,
    );
    const more = notFound.length > 3 ? `等${notFound.length}组` : "";
    return `清除了 ${deleted} 个候选数~ 不过 ${parts.join("、")}${more}不存在，跳过啦`;
  },

  /** 全部候选数不存在 */
  allCandidatesNotFound: () =>
    "唔…你要清除的候选数都不存在呢，小仙什么都没做~",

  /** 群聊限制 */
  guildOnly: () => "这个指令只能在群聊中使用哦~",

  /** 通用错误 */
  genericError: (msg: string) => `哎呀…小仙出错了：${msg}`,
};
