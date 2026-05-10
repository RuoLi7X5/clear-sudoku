# Skill: 训练新字体模板

为 clear-sudoku 插件训练适配新字体的数字识别模板（仅大数字：已知数 + 出数）。

## 前提

- 有一组该字体的数独图片（建议 20-40 张）
- 有对应的答案文件（81 字符/题，按行从左到右）
- 答案文件是**完整解**（不是初始盘面），模板只会从"图片中有大数字的格"提取样本

## 流程（7 步迭代）

### Step 1: 了解图片

```bash
cd external/clear-sudoku
# 查看图片尺寸、格式
node -e "const{PNG}=require('pngjs');const p=PNG.sync.read(require('fs').readFileSync('图片路径'));console.log(p.width+'x'+p.height)"
```

### Step 2: 初始模板提取

用 `scripts/xsudoku-build-final.js` 作为模板（替换其中的路径和答案）：

核心逻辑：
```
for 每张图片:
  检测网格线 (detectGridLines)
  for 每个非零答案格:
    提取 cell 像素 (10% inset, 灰度反转 255-gray)
    if maxVal >= 30: 收集为样本
for 每个数字 1-9:
  找到最常见的样本尺寸
  将所有样本归一化到该尺寸
  计算平均像素 → mean 模板
  保存为 templates/{prefix}_{digit}.json
```

### Step 3: 独立验证 + 阈值扫描

```bash
node scripts/xsudoku-verify-standalone.js
```

关键指标：
- **误报 (0→digit)**: 空格被识别为有数字，致命缺陷，必须为 0
- **漏识 (digit→0)**: 有数字未被识别，可能是该格没有大数字（候选格/空格）
- **错识 (digit→wrong)**: 数字识别错误

找到"误报=0 + 错识最少"的阈值。

### Step 4: 像素级诊断

如果某格持续错识：
```bash
node scripts/xsudoku-debug-deep.js
```

输出每个可疑格的 NCC 得分 vs 所有数字模板，以及像素级差异分析：
- 平均像素差 < 10/255 → 几乎完美匹配 → 答案文件可能有问题
- 平均像素差 > 30/255 → 模板不够好 → 需要更多样本
- 同时用**手写模板**跑一遍同样的题，如果手写模板在同一个格也错 → 是图片/答案问题，不是模板问题

### Step 5: 对比验证

用已有的手写模板 (big_*.json) 对同样的图片跑一遍：
```bash
# 修改测试脚本使用 big_ 前缀加载模板
```

如果两套模板在同一个格出错，说明是答案文件或图片的问题，不是模板的问题。

### Step 6: 集成到 template-match.ts

1. 在 `template-match.ts` 添加新模板数组（如 `xsudokuTemplates`）
2. 在 `loadTemplates()` 添加加载逻辑
3. 在 `matchBigDigit()` 添加匹配分支，使用 Step 3 确定的最优阈值
4. 编译：`npx tsc`

### Step 7: 验收

用完整 OCR 管线端到端测试，确认无误报、无漏识。

## 关键教训

1. **不要裁剪白边**：NCC 匹配需要一致的空间参考，97×97 留白模板比裁剪后的紧凑模板效果好得多
2. **每数字 1 个 mean 样本足矣**：标准化字体不需要多样本，平均模板比多样本更稳定
3. **不要盲目加"强化样本"**：如果某个格识别错误，先验证是不是答案文件的问题（用手写模板对照）
4. **阈值选择**：优先保证误报=0，宁可漏识（漏识可由约束网格兜底）
5. **答案文件陷阱**：答案可能是完整解而非初始盘面，空格不要用来评估模板

## 模板格式

```json
{
  "w": 97,
  "h": 97,
  "pixels": [[0,0,...], ...],
  "darkCount": 782,
  "samples": [{"pixels": [[0,0,...], ...], "darkCount": 782}]
}
```

- `w`, `h`: 模板尺寸（像素）
- `pixels`: 平均灰度像素（0=白, 255=黑，反相后的值）
- `darkCount`: 值 > 128 的像素数
- `samples`: 样本列表（至少 1 个，即 mean 模板本身）
