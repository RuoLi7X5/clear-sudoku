# koishi-plugin-clear-sudoku

数独候选数清除插件 — 引用盘面图片，发送清数指令，AI 自动识别、清除候选数、推理出数并渲染发回。

## 功能

- **OCR 识别**：模板匹配识别手写/打印数独盘面，支持大数(given/deduced)和候选数(小字)
- **候选数清除**：按指令清除指定格子的候选数，支持多种格式
- **直观技巧推理**：L1-L3 级技巧链（唯一数、区块、数对等），清数后自动出数
- **题号水印**：左下角红色题号标记，二次清数自动识别继承
- **双模板体系**：手写模板匹配用户照片，数字模板匹配自渲染图，闭环 100% 精度

## 安装

```bash
# 在 Koishi 插件目录中
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

### 基本清数

引用一张数独盘面图片，发送：

```
!清数 A59,B44
```

解析后的指令会清除 A5 格的候选数 9，以及 B4 格的候选数 4。

### 指令格式

| 格式 | 含义 |
|------|------|
| `A59` | A5 格清除候选数 9 |
| `A5(9)` | 同上（显式括号） |
| `A5(59)` | A5 格清除候选数 5 和 9 |
| `AB59` | A5、B5 同时清除候选数 9 |
| `ABC57(9)` | A5,A7,B5,B7,C5,C7 清除候选数 9 |
| `A59,B44` | 多条操作，逗号分隔 |

### 水印

在指令末尾用 `#` 添加水印标签，渲染图左下角显示红色文字：

```
!清数 A59 #421     → 水印 421
!清数 A59 #82-4    → 水印 82-4
```

仅数字和连字符 `-` 有效。二次清数时 OCR 自动检测并继承水印。

### 其他指令

| 指令 | 功能 |
|------|------|
| `!双图` / `!单图` | 切换识别验证图显示 |
| `!清数帮助` | 查看完整使用说明 |

## 配置

```yaml
# koishi.yml
plugins:
  clear-sudoku:
    debugOutput: true    # 双图模式（识别验证图+清数结果图），默认 true
    commandName: 清数     # 自定义触发指令名，默认 "清数"
```

## 架构

```
src/
├── index.ts            # 插件入口、命令注册、中间件
├── board.ts            # BoardState 盘面状态、OCRResult 结构
├── ocr.ts              # OCR 识别管线（网格检测+模板匹配+数独校验）
├── template-match.ts   # NCC 归一化互相关模板匹配（三模板体系 + 水印）
├── parser.ts           # 清数指令解析（含水印 #xxx 提取）
├── renderer.ts         # Canvas 渲染（924×924，系统字体，水印）
├── image.ts            # QQ 引用消息图片提取（多适配器兼容）
├── solver-chain.ts     # L1-L3 直观技巧推理链
└── messages.ts         # 用户回复文案
```

### 模板体系

```
用户照片 → 手写模板 (templates/big_*.json 128样本, small_*.json)
自渲染图 → 数字模板 (templates/digital_*.json 225样本)
水印检测 → 水印模板 (templates/wm_*.json, 16px红字)
```

手写模板通过 `scripts/calibrate-templates.ts` 用已知答案自动校准。
数字模板通过 `scripts/calibrate-digital.ts` 从渲染输出中自动生成。
水印模板通过 `scripts/generate-watermark-templates.ts` 生成。

## 测试

```bash
cd external/clear-sudoku

# 编译
npx tsc

# 批量测试（20 图：一次识别渲染 + 二次识别渲染）
npx ts-node scripts/batch-render-test.ts   # → testoutput/
npx ts-node scripts/reocr-test.ts          # → testoutput2/

# 闭环诊断（对比答案，验证精度）
npx ts-node scripts/diagnose-reocr.ts

# 重新生成数字模板（渲染参数变更后需要）
npx ts-node scripts/generate-digital-templates.ts

# 题号水印闭环测试
npx ts-node scripts/test-watermark.ts
```

## 精度

| 指标 | 数值 |
|------|------|
| 一次识别（用户照片） | 大数检出 26-50/题，0-1 冲突 |
| 二次识别（渲染图闭环） | **100%（385/385 零误读）** |
| 题号水印检测 | conf 0.77-0.86，全部正确 |

## 版本历史

| 版本 | 改动 |
|------|------|
| v0.3.0 | 模板匹配替换 tesseract，精简回复 |
| v0.4.0 | 2x 渲染分辨率（924×924），帮助指令 |
| v0.6.0 | 双模板体系，闭环 100% 保真 |
| v0.7.0 | 题号水印闭环（指令解析→渲染→OCR识别→继承） |
| v0.7.1 | 修复 Koishi 命令参数类型导致的题号截断 |
| v1.0.0 | 正式版发布：双模板校准(128+225样本)、求解器冲突保护、模板场景分离 |
| v1.0.1 | 水印格式改为 #xxx（数字+连字符），淘汰 X题 格式 |
| v1.1.0 | 水印闭环完善：16px红字水印模板、滑动窗口多字符检测、幽灵过滤、复杂指令#xx-x支持 |

## License

MIT
