<div align="left">

  [![AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0.html)

</div>
<br>
<div align="center">
<p>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./frontend/public/logo-dark.svg">
  <img src="./frontend/public/logo.svg" height="120" align="center">
</picture>
</p>

中文 PDF 校对工具 — 调用 DeepSeek API 自动校对错别字、标点、用语与禁用词
<br>
<sub>Made with <code>FastAPI + React + shadcn/ui</code></sub>

[![Docker Pulls](https://img.shields.io/docker/pulls/poyinte/detypo?style=flat-square&logo=docker&label=Docker%20Pulls&color=0db7ed)](https://hub.docker.com/r/poyinte/detypo) [![GitHub Stars](https://img.shields.io/github/stars/Poyinte/Detypo?style=flat-square&logo=github)](https://github.com/Poyinte/Detypo/stargazers) [![Issues](https://img.shields.io/github/issues/Poyinte/Detypo?style=flat-square&logo=github)](https://github.com/Poyinte/Detypo/issues)
</div>
<br><br>
<div align="right">
<sub>* 校对结果可能存在错漏，投入使用前请进行人工复核。</sub><br>
<sub>** API Key 存储在浏览器本地，不会上传至任何服务器。</sub>
</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/zap-dark.svg"><img src="./docs/icons/zap.svg" height="28" align="absmiddle"></picture> 为什么选择 Detypo

- **本地运行，数据安全** — 文件处理和 AI 调用均在本地完成（或你的 Docker 容器中），不上传至第三方
- **自带 API Key** — 使用你自己的 DeepSeek API Key，费用透明可控，无需订阅
- **Token 估算** — 开始校对前预估 token 用量和费用，避免意外开销
- **SSE 实时进度** — 校对过程通过 Server-Sent Events 流式推送，日志级粒度
- **双视图** — 列表视图适合批量审查，卡片视图适合逐条阅读
- **单文件部署** — Docker 一行命令即可启动，Windows 双击 bat 即用

Detypo 目前支持以下校对类型：

- 用字错误（形近字、同音字、异体字）
- 用词不当（近义词混淆、搭配不当）
- 语法错误（成分残缺、语序不当）
- 标点符号（中英文标点混用、缺失）
- 数字用法（阿拉伯数字与汉字混用）
- 政治敏感（禁用词、不当表述）

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/rocket-dark.svg"><img src="./docs/icons/rocket.svg" height="28" align="absmiddle"></picture> 快速开始

## 准备工作

- **Python 3.10+**（本地运行）或 **Docker**（推荐）
- **Node.js 18+**（仅本地开发模式需要）
- **DeepSeek API Key** — [在此获取](https://platform.deepseek.com/api_keys)

## Docker（推荐）

```bash
docker run -p 3000:3000 poyinte/detypo
```

带 API Key：

```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

然后访问 `http://localhost:3000`。API Key 也可在界面中输入。

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

> [!NOTE]
> 首次运行会自动安装 Python 和前端依赖。

## macOS / Linux

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # 生产模式（默认）
./detypo dev            # 开发模式（热重载）
./detypo stop           # 停止后台服务
```

> [!NOTE]
> 首次运行会自动安装 Python 和前端依赖。

## 手动安装

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python server.py
# 访问 http://127.0.0.1:3000
```

## 启动模式

<div align="center">

| 命令 | 模式 | 说明 |
| :--- | :--- | :--- |
| `detypo.bat` | 生产 | 构建前端，后端单端口 :3000 服务。Ctrl+C 停止 |
| `detypo.bat dev` | 开发 | 前后端分离，热重载，浏览器打开 :4000 |
| `detypo.bat stop` | — | 停止开发模式的后台服务 |

</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/layers-dark.svg"><img src="./docs/icons/layers.svg" height="28" align="absmiddle"></picture> 使用说明

## 界面使用流程

1. 启动后输入 DeepSeek API Key（首次使用时弹窗引导，也可在侧边栏「API 设置」中修改）
2. 上传 PDF — 拖拽到页面或点击按钮选择文件
3. 选择校对页码范围（可选），向导中会显示页面预览和预估用量
4. 点击「开始校对」，等待实时进度条完成
5. 在列表或卡片视图中浏览校对结果，按错误类别筛选
6. 勾选/取消不需要的修改项
7. 点击「导出 PDF」下载带有色块标注的校对稿

## 可选依赖

`requirements.txt` 中包含以下可选依赖，可根据需要安装：

- `tokenizers` — 离线 token 计数（上传 PDF 后自动计算每页 token 数）

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/shield-check-dark.svg"><img src="./docs/icons/shield-check.svg" height="28" align="absmiddle"></picture> 校对规则与许可证

## 校对规则

校对规则库（`rules/proofreading-rules.md`）通过 AI 从《图书编辑校对实用手册》中提取整理，涵盖形近字、同音字、近义词、标点、数字用法、政治敏感词等常见错误类型。

> [!IMPORTANT]
> 具体词条（如形近字辨析组）属于汉语语言文字事实，不受著作权法保护。但原书的编排结构和例句选择可能受版权保护。本项目仅用于学术研究和个人使用，使用者应自行评估合规性。

## 技术栈

<div align="center">

| 层 | 技术 |
| :--- | :--- |
| 后端 | Python, FastAPI, PyMuPDF, SSE streaming |
| AI | DeepSeek API (deepseek-v4-flash) |
| 前端 | React 19, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI |
| 部署 | Docker, GitHub Actions → Docker Hub |

</div>

## 许可证

本项目采用 **GNU AGPL v3.0** 许可证（受 PyMuPDF 依赖约束）。

> [!WARNING]
> AGPL v3 要求通过网络使用软件时必须公开全部源代码。如需闭源商用，请购买 [Artifex](https://artifex.com/) 的 PyMuPDF 商业许可证。

其他依赖均采用宽松许可证（MIT、BSD）。
