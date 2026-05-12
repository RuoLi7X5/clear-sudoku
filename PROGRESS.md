# clear-sudoku 开发进度

## 当前版本：v1.3.2

## 已完成

### 1. 插件基础架构
- package.json, tsconfig.json, koishi.yml 注册
- 指令系统：`!清数`、`!双图`、`!单图`、`!清数帮助`
- 引用消息图片提取（onebot/Satori 多适配器兼容）
- 小仙人设对话系统
- **v0.4.0**: 精简回复文案，移除识别失败/成功文案

### 2. OCR 识别管线（模板匹配，v0.3+）
- **图片解码**：pngjs（PNG）+ jpeg-js（JPEG），零原生依赖
- **网格检测**：外框峰值定位 + 等分法，渲染图自动对齐到精确格线
- **大数识别**：NCC 归一化互相关模板匹配，手写体模板(big_*.json) + 数字模板(digital_*.json)双体系
- **候选数检测**：子区域 hasInk（3x3 网格布局，墨迹阈值1%）
- **颜色分类**：isBlue(r,g,b) 判蓝/黑 → deduced/given
- **数独规则校验**：迭代确认（高置信度优先）+ 同行/列/宫冲突排除
- **渲染图识别**：自动检测948×948渲染图，格线精确对齐，数字模板优先匹配

### 3. 数字模板系统（v0.6.0）
- **手写模板**：`templates/big_1~9.json`、`small_1~9.json`，从用户照片提取
- **数字模板**：`templates/digital_1~9.json`，从系统字体渲染输出自动生成
  - 18样本/数字，双Latin-square板覆盖所有行列位置
  - 5行黑色(givens) + 4行蓝色(deduced)混采
- **匹配策略**：数字模板微偏差+0.03，统一竞争制
- **生成脚本**：`scripts/generate-digital-templates.ts`
- **闭环精度**：385/385 零误读（100%）

### 4. Canvas 渲染（v0.4.0 2x分辨率）
- cellSize 50→100，总图 474→924px
- 三级线粗：外框8px > 宫线5px > 格线2px
- 已知数黑色52px、出数蓝色(#1111FF) 52px、候选数黑色22px
- CJK字体自动发现 + 下载兜底（Noto Sans SC）
- **v0.7.0**: 题号红色水印（16px, 左下角）

### 5. 题号水印闭环（v0.7.0）
- **指令格式**：`!清数 A59 8题` / `!清数 A59 #8`
- **渲染**：左下角红色"第X题"水印
- **OCR检测**：底部固定区域提取，模板匹配识别编号
- **自动继承**：二次清数时OCR自动检测编号，渲染时继承，无需用户重复输入

### 6. 直观技巧求解
- L1-L3 直观链（solver-chain.ts）

## 当前精度

| 指标 | 数值 |
|------|------|
| 一次识别（用户照片） | 大数检出 26-50/题，0-1冲突 |
| 二次识别（渲染图回环） | **100%（385/385, 0误读）** |
| 题号水印检测 | 5/5 全部正确（conf 0.77-0.86） |
| 候选数检测 | 有噪声（假阳性偏多，位置约束已缓解） |

## 待解决

1. **候选数噪声**：部分空格误检候选数，可通过渲染图对比进一步降低
2. **题号多位数**：当前水印检测仅支持1位数字，2位数字需扩展
3. **Canvas 依赖**：需 koishi-plugin-skia-canvas 或 @napi-rs/canvas

## 文件结构

```
external/clear-sudoku/
├── package.json (v1.3.2)
├── tsconfig.json
├── templates/ (46 files, ~41MB)
│   ├── big_1~9.json          (手写大数模板, 150-200样本/数字)
│   ├── small_1~9.json        (手写候选数模板)
│   ├── digital_1~9.json      (系统字体模板, 179-200样本/数字)
│   ├── xsudoku_1~9.json      (Xsudoku模板, 1 mean样本/数字)
│   └── wm_0~9.json           (水印数字模板)
├── scripts/
│   ├── batch-render-test.ts   (批量OCR+渲染测试, 20图)
│   ├── reocr-test.ts          (二次识别渲染测试)
│   ├── generate-digital-templates.ts (数字模板生成)
│   ├── verify-templates.ts    (模板自匹配验证)
│   ├── diagnose-reocr.ts      (闭环诊断, 对比答案)
│   ├── test-watermark.ts      (题号水印闭环测试)
│   ├── calibrate-ink.js       (墨迹阈值校准)
│   ├── augment-all-templates.js (三阶段样本扩充)
│   └── batch-render-435.js     (批量435题识别渲染)
└── src/
    ├── index.ts               (插件入口)
    ├── board.ts               (BoardState + OCRResult)
    ├── ocr.ts                 (OCR管线, 含网格对齐+题号检测)
    ├── parser.ts              (指令解析, 含题号提取)
    ├── template-match.ts      (NCC模板匹配, 双模板体系)
    ├── image.ts               (图片提取)
    ├── renderer.ts            (Canvas渲染, 含水印)
    ├── solver-chain.ts        (L1-L3求解)
    └── messages.ts            (小仙人设)
```

## 答案库

`images/answer-key.md` — 前20题答案（81字符盘面），可用于识别精度验证。

## 版本历史

| 版本 | 主要改动 |
|------|---------|
| v0.3.0 | 模板匹配替换tesseract |
| v0.4.0 | 精简回复、2x分辨率、帮助指令 |
| v0.5.0 | 数字模板初版（手写体渲染） |
| v0.6.0 | 双板Latin-square数字模板、闭环100% |
| v0.7.0 | 题号水印闭环、自动检测继承 |
| v0.7.1 | 修复 Koishi `<text>` → `<text:text>` 导致题号被截断 |
| v1.0.0 | 正式发布：双模板校准(128+225)、求解器冲突保护、模板场景分离 |
| v1.0.1 | 水印格式改为 #xxx（数字+连字符），淘汰 X题 格式 |
| v1.3.2 | 模板瘦身(294MB→41MB)：移除68字体族、三阶段样本扩充(150-200/数字)、修复xsudoku均值合并 |
| v1.3.1 | 二阶大数验证(24×36→48×72)、big_3/big_5样本裁剪、H9 x/435修复 |
| v1.3.0 | 候选数像素聚类检测(hasBlackPixel)、68字体两遍法选择、手写优先、Claiming求解 |
| v1.2.0 | 27系统字体模板、自动发现加载、渲染77px |
| v1.1.0 | 水印闭环：16px红字模板(wm_*.json)、滑动窗口检测、幽灵过滤 |
