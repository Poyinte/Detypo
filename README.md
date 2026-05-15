# 得误 Detypo — PDF 校对助手

中文 PDF 校对工具。上传 PDF 后自动提取文本，调用 DeepSeek API 进行校对（错别字、标点、用语规范、禁用词），结果以高亮标注形式覆盖到原始 PDF 上。

## 功能

- **上传 PDF** — 支持拖拽或点击选择，支持选择校对页码范围
- **校对类型** — 用字错误、用词不当、语法错误、标点符号、数字用法、政治敏感
- **结果浏览** — 列表 / 卡片双视图，按类别筛选，逐页浏览
- **导出 PDF** — 排除不需要的修改项后，导出带有色块标注的校对稿
- **暗色模式** — 支持浅色 / 深色 / 跟随系统
- **Token 估算** — 开始校对前预估用量和费用

## 依赖

- **Python 3.10+** — 后端服务
- **Node.js 18+** — 前端构建
- **DeepSeek API Key** — [获取地址](https://platform.deepseek.com/api_keys)

## 快速开始

### Docker（推荐）

```bash
docker run -p 3000:3000 poyinte/detypo
```

带 API Key：
```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

然后访问 http://localhost:3000。API Key 也可以在界面中输入。

### Windows 本地运行

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo

# 双击 detypo.bat（生产模式，构建前端后统一服务）
# 或在 CMD 中：
detypo.bat              # 生产模式（默认）
detypo.bat dev          # 开发模式（热重载）
detypo.bat stop         # 停止后台服务
```

### macOS / Linux 本地运行

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # 生产模式（默认）
./detypo dev            # 开发模式（热重载）
./detypo stop           # 停止后台服务
```

首次运行会自动安装依赖，服务就绪后自动打开浏览器。

### 手动启动

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python server.py
# 访问 http://127.0.0.1:3000
```

API Key 可通过 `.env` 文件配置，或在界面「API 设置」中输入（保存在浏览器本地存储）。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Python, FastAPI, PyMuPDF, SSE streaming |
| 前端 | React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS 4 |
| AI | DeepSeek API (deepseek-v4-flash) |

## 许可证

本项目采用 AGPL v3 许可证（受 PyMuPDF 依赖约束）。参见 [LICENSE](https://www.gnu.org/licenses/agpl-3.0.html)。

第三方依赖的许可证：
- PyMuPDF — AGPL v3 / Artifex Commercial
- FastAPI, React, Vite, shadcn/ui — MIT
