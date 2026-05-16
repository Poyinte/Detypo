# 得误 Detypo

中文 PDF 校对工具 — 调用 DeepSeek API 自动校对错别字、标点、用语与禁用词

[![AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue?style=flat-square)](https://www.gnu.org/licenses/agpl-3.0.html)
![Python](https://img.shields.io/badge/-Python_3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
[![GitHub](https://img.shields.io/badge/-GitHub-181717?style=flat-square&logo=github)](https://github.com/Poyinte/Detypo)

## Quick Start

```bash
docker run -p 3000:3000 poyinte/detypo
```

Then open http://localhost:3000.

## With API Key

```bash
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

The API key can also be entered in the app settings after launch.

## Features

- Upload PDF via drag & drop, select page range
- AI proofreading: typos, grammar, punctuation, sensitive terms
- Table / card dual view, filter by category
- Export annotated PDF with color-coded highlights
- Dark mode (light / dark / system)
- Token & cost estimation before proofreading

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEEPSEEK_API_KEY` | DeepSeek API key | *(none)* |
| `HOST` | Server bind address | `0.0.0.0` |
| `PORT` | Server port | `3000` |

## Tech Stack

Python, FastAPI, PyMuPDF, React 19, shadcn/ui, Tailwind CSS 4

## License

GNU AGPL v3.0 — [GitHub repo](https://github.com/Poyinte/Detypo)
