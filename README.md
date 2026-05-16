<div align="left">

  [![AGPL v3](https://www.gnu.org/graphics/agplv3-155x51.png)](https://www.gnu.org/licenses/agpl-3.0.html)

</div>
<br>
<div align="center">
<p>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./frontend/public/logo-dark.svg">
  <img src="./frontend/public/logo.svg" height="120" align="center">
</picture>
</p>

中文 PDF 校对工具 —— 调用 AI 自动识别常见错误<br>
<sub>Made with <code>DeepSeek-V4</code></sub>

[![AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0.html)
![Python](https://img.shields.io/badge/-Python_3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js_18+-339933?style=flat-square&logo=node.js&logoColor=white)
</div>
<br><br>
<div align="right">
<sub>* 校对结果可能存在错漏，投入使用前请进行人工复核。</sub>
</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/zap-dark.svg"><img src="./docs/icons/zap.svg" height="28" align="absmiddle"></picture> 基本功能

- **快速校对** — 调用 `deepseek-v4-flash` 进行校对，快速发现错误
- **错误整理** — 校对完成后，可对错误条目进行整理
- **便于核查** — 导出的 PDF 文件带有可定位的详细注释，便于核查

主要识别以下错误类型：

<div align="center">

| 类别 | 示例 |
| :--- | :--- |
| 用字错误 | 形近 / 同音 / 近音误用、使用字形不规范（繁体字 / 异体字 / 旧字形） |
| 用词不当 | 异形词 / 形近词误用、成语误用、生造词 / 方言词 / 外来词、缩略语等使用不规范 |
| 语法错误 | 词性误用、成分残缺、搭配不当、句式杂糅、歧义、数量表达混乱 |
| 标点符号 | 逗号 / 顿号 / 分号、引号、书名号、省略号 / 破折号 / 连接号、冒号 / 问号 / 叹号等误用 |
| 数字用法 | 阿拉伯数字与汉字数字使用、概数表达、计量单位等使用不规范 |
| 政治敏感 | 政治敏感表达、违反相关法律法规 |

<sub>详见 [`proofreading-rules.md`](rules/proofreading-rules.md)</sub>

</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/rocket-dark.svg"><img src="./docs/icons/rocket.svg" height="28" align="absmiddle"></picture> 快速开始

## 准备工作

- **Python 3.10+**
- **Node.js 18+**
- **[DeepSeek API Key](https://platform.deepseek.com/api_keys)**

## Docker

```bash
docker run -p 3000:3000 poyinte/detypo
```

带 API Key `也可在运行界面中设置`：

```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

然后访问 `http://localhost:3000`。

## Windows

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo

# 双击 detypo.bat（生产模式，构建前端后统一服务）
# 或在 CMD 中：
detypo.bat              # 生产模式（默认），服务在 :3000
detypo.bat dev          # 开发模式（热重载），浏览器打开 :4000
detypo.bat stop         # 停止后台服务
```

## macOS / Linux

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # 生产模式（默认）
./detypo dev            # 开发模式（热重载）
./detypo stop           # 停止后台服务
```

## 手动安装

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python server.py
# 访问 http://127.0.0.1:3000
```

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/layers-dark.svg"><img src="./docs/icons/layers.svg" height="28" align="absmiddle"></picture> 使用说明

1. **设置 API Key** — 启动后输入 `DeepSeek API Key`（首次使用时弹窗引导，之后可在侧边栏 <kbd>API 设置</kbd> 中修改）
2. **上传 PDF** — 拖入 PDF 文件到页面 `虚线框` 内或点击 <kbd>选择 PDF 文件</kbd>
3. **设置校对范围** — 选择校对页码范围，`向导` 中会显示页面预览和预估用量
4. **开始校对** — 点击 <kbd>开始校对</kbd>，等待校对完成
5. **浏览校对结果** — 在 <kbd>列表</kbd> 或 <kbd>卡片</kbd> 视图中浏览校对结果，可按错误类别进行筛选
6. **整理校对结果** — 点击条目以选中，<kbd>鼠标右键</kbd> 进行 `剔除` / `恢复` （按住 <kbd>鼠标左键</kbd> 拖动可 `批量选中`）
7. **导出 PDF** — 点击 <kbd>导出 PDF</kbd> 下载带有标注的校对稿

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/shield-check-dark.svg"><img src="./docs/icons/shield-check.svg" height="28" align="absmiddle"></picture> 校对规则与许可证

## 校对规则

校对规则库 [`proofreading-rules.md`](rules/proofreading-rules.md) 通过 AI 从 [《图书编辑校对实用手册》<sub>（第五版）</sub>](http://bbtpress.com/bookview/1818.html) 中提取整理。

> [!IMPORTANT]
> 本项目仅用于学术研究和个人使用，使用者应自行评估合规性。

## 技术栈

<div align="center">

| 层 | 技术 |
| :--- | :--- |
| 后端 | Python, FastAPI, PyMuPDF, SSE streaming |
| AI | DeepSeek API (deepseek-v4-flash) |
| 前端 | React 19, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI |

</div>

## 许可证

本项目采用 **GNU AGPL v3.0** 许可证。
