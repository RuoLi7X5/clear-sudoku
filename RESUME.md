# Resume Prompt

继续开发 `external/clear-sudoku` 插件（v0.7.0）。

## 背景

为QQ群数独玩家开发的候选数清除插件。用户引用盘面图片 + `!清数 A59,B44 8题` 指令，插件 OCR 识别 → 清候选数 → 直观技巧连锁 → 渲染发回（带红色题号水印）。

## 当前状态

v1.1.0 — 核心功能完整。三模板体系(手写+数字+水印)，闭环100%，水印自动继承。

### OCR 管线（模板匹配，无tesseract依赖）
1. 网格检测 ✓（外框峰值+等分法，渲染图自动精确对齐）
2. 大数识别 ✓（双模板体系：手写模板 + 数字模板，NCC归一化互相关）
3. 候选数检测 ✓（hasInk 3×3子格扫描，墨迹阈值1%）
4. 数独校验 ✓（迭代确认+冲突排除）
5. Canvas 渲染 ✓（924×924，2x分辨率，系统字体）

### 关键指标
- 一次识别（用户照片）：大数检出 26-50/题，0-1冲突
- 二次识别（渲染图闭环）：**100%精度（385/385零误读）**
- 题号水印：OCR自动检测+继承，5/5全部正确

### 数字模板系统
- 18样本/数字，双Latin-square板，覆盖黑/蓝色字体渲染差异
- 自动生成脚本：`npx ts-node scripts/generate-digital-templates.ts`
- 模板文件：`templates/digital_1~9.json`

## 测试命令

```bash
# 编译
cd external/clear-sudoku && npx tsc

# 生成数字模板（渲染参数变更后需重跑）
npx ts-node scripts/generate-digital-templates.ts

# 批量测试（20图：一次渲染 + 二次识别渲染）
npx ts-node scripts/batch-render-test.ts   # → testoutput/
npx ts-node scripts/reocr-test.ts          # → testoutput2/

# 闭环诊断（对比答案验证精度）
npx ts-node scripts/diagnose-reocr.ts

# 题号水印测试
npx ts-node scripts/test-watermark.ts

# 数字模板自匹配验证
npx ts-node scripts/verify-templates.ts
```

## 待解决问题

1. **候选数噪声**：空格偶有假阳性，可通过与渲染图交叉比对降低
2. **题号多位数**：当前水印OCR仅支持1位数字，2位需扩展提取+分隔逻辑
3. **两次清数间字体一致性**：数字模板基于当前系统字体渲染生成，换环境需重新生成

## 关键文件

- `src/template-match.ts` — NCC模板匹配，双模板加载+竞争逻辑
- `src/ocr.ts` — OCR管线，含网格对齐(detectGridLines→snapToExactGrid)、题号检测
- `src/renderer.ts` — Canvas渲染，含红色题号水印
- `src/parser.ts` — 指令解析，含题号提取（`X题`/`#X`格式）
- `src/board.ts` — BoardState + OCRResult，含questionNumber字段
- `scripts/generate-digital-templates.ts` — 数字模板生成（Latin-square双板）
- `PROGRESS.md` — 完整开发进度
- `images/answer-key.md` — 前20题答案
