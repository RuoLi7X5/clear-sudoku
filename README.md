# koishi-plugin-clear-sudoku

数独候选数清除插件 — 引用盘面图片，发送清数指令，AI 自动识别、清除候选数、推理出数并渲染发回。

## 功能

- **OCR 识别**：多字体模板匹配识别手写/打印数独盘面，支持大数(given/deduced)和候选数(小字)
- **候选数清除**：按指令清除指定格子的候选数，支持多种格式（含中英文括号）
- **直观技巧推理**：L1-L3 级技巧链（唯一数、区块、数对等），清数后自动出数
- **题号水印**：左下角红色题号标记，二次清数自动识别继承
- **多字体模板体系**：手写+数字+Xsudoku+27种系统字体，自动发现加载，100% 自识别精度
- **候选数双重检测**：墨迹检测 + 模板匹配兜底，并集合并约束网格
- **可配置渲染**：大数字字号 77px 微软雅黑，蓝黑双色

## 安装

```bash
cd external/clear-sudoku
npm install
npx tsc
```

### 依赖

- `koishi` ^4.18.7
- `canvas` 服务（`koishi-plugin-skia-canvas` 或 `@napi-rs/canvas`）
- `pngjs` ^7.0.0（PNG 解码）
- `jpeg-js` ^0.4.4（JPEG 解码）

## 使用方法

引用一张数独盘面图片，发送：

```
!清数 A59,B44
!清数 E5（23）     ← 兼容中文括号
```

| 格式 | 含义 |
|------|------|
| `A59` | A5 格清除候选数 9 |
| `A5(9)` / `A5（9）` | 同上（中英文括号通用） |
| `A5(59)` | A5 格清除候选数 5 和 9 |
| `AB59` | A5、B5 同时清除候选数 9 |
| `ABC57(9)` | A5,A7,B5,B7,C5,C7 清除候选数 9 |
| `A59,B44` | 多条操作，逗号分隔 |

水印：末尾 `#421` 或 `#82-4`，渲染图左下角红色显示。二次清数 OCR 自动继承。

| 指令 | 功能 |
|------|------|
| `!双图` / `!单图` | 切换识别验证图显示 |
| `!清数帮助` | 查看完整使用说明 |

## 配置

```yaml
plugins:
  clear-sudoku:
    debugOutput: true
    commandName: 清数
```

## 架构

```
src/
├── index.ts            # 插件入口、命令注册、中间件
├── board.ts            # BoardState 盘面状态
├── ocr.ts              # OCR 管线（网格检测+模板匹配+数独校验+候选双重检测）
├── template-match.ts   # NCC 模板匹配（多字体自动发现、场景分离）
├── parser.ts           # 清数指令解析（兼容中英文括号）
├── renderer.ts         # Canvas 渲染（77px 微软雅黑，蓝黑双色，水印）
├── image.ts            # QQ 引用消息图片提取
├── solver-chain.ts     # L1-L3 直观技巧推理链
└── messages.ts         # 用户回复文案
```

### 模板体系（32 套）

| 类别 | 前缀 | 用途 |
|------|------|------|
| 手写 | big, small | 用户拍照/截图 |
| 系统字体 | digital | 自渲染闭环 |
| Xsudoku | xsudoku | Xsudoku 专用字体 |
| 水印 | wm | 16px 红字题号 |
| 27 系统字体 | simhei, kaiti, simsun... | 自动发现加载 |

## 训练新字体模板

参见 `SKILL_TRAIN_FONT.md`。核心脚本：

```bash
# 单字体模板生成
npx ts-node scripts/gen-font-templates.ts <字体路径> <字体名> <模板前缀>

# 示例
npx ts-node scripts/gen-font-templates.ts C:/Windows/Fonts/simhei.ttf SimHei simhei
```

流程：答案渲染为字体A → OCR二次识别 → 提取样本 → 多样本模板 → 阈值扫描验证 100%

## 测试

```bash
cd external/clear-sudoku
npx tsc

# 批量测试
npx ts-node scripts/batch-render-test.ts
npx ts-node scripts/reocr-test.ts

# 渲染测试（指定字体）
npx ts-node scripts/render-xsudoku.ts

# 闭环诊断
npx ts-node scripts/diagnose-reocr.ts
```

## 精度

| 指标 | 数值 |
|------|------|
| 数字模板自识别 | 100% |
| Xsudoku 模板自识别 | 100% |
| 27 系统字体模板自识别 | 100% |
| 候选数双重检测 | 墨迹 + 模板匹配兜底 |
| 题号水印检测 | conf 0.77-0.86 |

## 版本历史

| 版本 | 改动 |
|------|------|
| v1.2.0 | 27 系统字体模板(simhei/kaiti/simsun...)、自动发现加载、候选数双重检测+并集兜底、渲染字号 77px 微软雅黑、兼容中文括号、字体训练 skill |
| v1.1.0 | 水印闭环完善：16px红字水印模板、滑动窗口多字符检测、幽灵过滤 |
| v1.0.1 | 水印格式改为 #xxx |
| v1.0.0 | 正式版：双模板校准(128+225样本)、求解器冲突保护 |

## License

MIT
