<div align="left">

  [![AGPL v3][license-shield]][license-url]

</div>
<br>
<div align="center">
<p>
<img src="./frontend/public/logo.svg" height="120" align="center" style="background:#fff;border-radius:12px;padding:8px">
</p>

中文 PDF 校对工具 — 调用 DeepSeek API 自动校对错别字、标点、用语与禁用词
<br>
<sub>Made with <code>FastAPI + React + shadcn/ui</code></sub>

[![Docker Pulls](https://img.shields.io/docker/pulls/poyinte/detypo?style=flat-square&logo=docker&label=Docker%20Pulls&color=0db7ed)](https://hub.docker.com/r/poyinte/detypo) [![GitHub Stars](https://img.shields.io/github/stars/Poyinte/Detypo?style=flat-square&logo=github)](https://github.com/Poyinte/Detypo/stargazers) [![Issues](https://img.shields.io/github/issues/Poyinte/Detypo?style=flat-square&logo=github)](https://github.com/Poyinte/Detypo/issues)
</div>
<br><br>
<div align="right">
<sub>* 校对结果可能存在错漏。重要文件请进行人工复核。</sub><br>
<sub>** API Key 存储在浏览器本地，不会上传至任何服务器。</sub>
</div>

---

# <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/zap.svg" height="28" align="absmiddle"> 功能特性

- **上传 PDF** — 支持拖拽或点击选择，支持选择校对页码范围
- **校对类型** — 用字错误、用词不当、语法错误、标点符号、数字用法、政治敏感
- **结果浏览** — 列表 / 卡片双视图，按类别筛选，逐页浏览
- **导出 PDF** — 排除不需要的修改项后，导出带有色块标注的校对稿
- **暗色模式** — 支持浅色 / 深色 / 跟随系统
- **Token 估算** — 开始校对前预估用量和费用
- **进度跟踪** — SSE 实时推送校对进度，假进度条平滑过渡

---

# <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/rocket.svg" height="28" align="absmiddle"> 快速开始

## Docker（推荐）

```bash
docker run -p 3000:3000 poyinte/detypo
```

带 API Key：
```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

然后访问 http://localhost:3000。API Key 也可以在界面中输入。

## Windows

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo

# 双击 detypo.bat（生产模式，构建前端后统一服务）
# 或在 CMD 中：
detypo.bat              # 生产模式（默认）
detypo.bat dev          # 开发模式（热重载）
detypo.bat stop         # 停止后台服务
```

>[!NOTE]
> 需要 Python 3.10+ 和 Node.js 18+。首次运行会自动安装依赖。

## macOS / Linux

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # 生产模式（默认）
./detypo dev            # 开发模式（热重载）
./detypo stop           # 停止后台服务
```

>[!NOTE]
> 需要 Python 3.10+ 和 Node.js 18+。首次运行会自动安装依赖。

## 手动启动

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python server.py
# 访问 http://127.0.0.1:3000
```

API Key 可通过 `.env` 文件配置，或在界面「API 设置」中输入。

## 启动模式

<div align="center">

| 模式 |命令|说　　　明|
| :----------: | ---------- | -----------|
|`生　产`| `detypo.bat` | 构建前端，单端口 :3000 服务 |
|`开　发`| `detypo.bat dev` | 前后端热重载，浏览器访问 :4000 |
|`停　止`| `detypo.bat stop` | 停止后台开发服务 |

</div>

---

# <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/layers.svg" height="28" align="absmiddle"> 技术栈

<div align="center">

| 层 |技　　　　　术|
| :----------: | -----------|
|`后　端`| Python, FastAPI, PyMuPDF, SSE streaming |
|`人　工　智　能`| DeepSeek API (deepseek-v4-flash) |
|`前　端`| React 19, TypeScript, Vite |
|`用 户 界 面`| shadcn/ui, Tailwind CSS 4, Radix UI |
|`部　　　署`| Docker, GitHub Actions → Docker Hub |

</div>

---

# <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/shield-check.svg" height="28" align="absmiddle"> 许可证与法律声明

## 许可证

本项目采用 **GNU AGPL v3.0** 许可证（受 PyMuPDF 依赖约束）。

>[!WARNING]
> AGPL v3 要求通过网络使用软件时必须公开全部源代码。如需闭源商用，请购买 [Artifex](https://artifex.com/) 的 PyMuPDF 商业许可证。

>[!NOTE]
> 曾考虑使用 CC BY-NC-SA 4.0，但该许可证包含"非商业使用"限制，与 PyMuPDF 的 AGPL v3 不兼容。一个项目不能同时使用互不兼容的许可证。

其他依赖均采用宽松许可证（MIT、BSD）。

## 校对规则来源

校对规则库（`rules/proofreading-rules.md`）通过 AI 从《图书编辑校对实用手册》（ProofreadingHandbook）中提取整理。

>[!IMPORTANT]
> **法律风险提示**：形近字组、同音词组等具体词条属于汉语语言文字事实，不受著作权法保护。但原书的编排结构、分类体系和例句选择可能受版权保护。AI 提取的规则库若系统性再现了原书的创作性内容，可能构成衍生作品。本项目仅用于学术研究和个人使用，使用者应自行评估在所属法域内的合规性。

[license-shield]: https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square
[license-url]: https://www.gnu.org/licenses/agpl-3.0.html
