# CLAUDE.md — 得误 Detypo

## Overview

Detypo is a Chinese-language PDF proofreading tool. Users upload a PDF, the backend extracts text via PyMuPDF, sends it to the DeepSeek API for proofreading (错别字, 标点, 用语规范, 禁用词), then overlays color-coded highlight annotations on the original PDF. The frontend shows results in a table/card view with checkboxes to include/exclude findings before exporting the annotated PDF.

## Quick start

```bash
# Windows
detypo.bat              # Production mode (build + serve at :3000)
detypo.bat dev          # Dev mode (hot-reload at :4000)
detypo.bat stop         # Stop background services

# macOS / Linux
./detypo                # Production mode
./detypo dev            # Dev mode
./detypo stop           # Stop background services

# Docker
docker run -p 3000:3000 poyinte/detypo
```

## Repo structure

```
├── server.py              # FastAPI backend (SSE streaming, upload, export)
├── core/                  # pdf_engine.py, text_annotator.py, llm_client.py, proofreader.py
├── utils/                 # config.py, rule_extractor.py, token_counter.py
├── rules/                 # proofreading-rules.md
├── tokenizer/             # DeepSeek V3 tokenizer files
├── frontend/              # React 19 + Vite + shadcn/ui
│   ├── src/App.tsx        # Main component (monolithic, useState-driven)
│   ├── src/components/    # App components + ui/ (shadcn)
│   └── public/            # favicon, logo, icons
├── docs/                  # icons/ (lucide SVGs), docker-hub.md
├── .github/workflows/     # Docker build CI (tag-triggered)
├── detypo                 # Bash launcher
├── detypo.bat             # Windows launcher
├── Dockerfile             # Multi-stage (node build + python serve)
└── README.md
```

## Key commands (development)

```bash
# Backend
pip install -r requirements.txt
python server.py                          # Starts at 127.0.0.1:3000

# Frontend (from frontend/)
npm install
npm run dev                               # Vite dev server at :4000, proxies /api → :3000
npm run build                             # TypeScript check + Vite production build → dist/
npm run lint                              # ESLint
```

## Architecture

**Proofreading pipeline**: Pages → batch → extract text → inject `[#NNNN]` span IDs → send to DeepSeek LLM → resolve IDs → add colored annotations → incremental save.

**CJK text splitting**: Split into ~6-char micro-segments with proportionally-split bounding boxes. Punctuation merged into preceding segment.

**SSE streaming**: Events: `extracting`, `llm_waiting`, `batch_done`, `page_done`, `complete`, `proofread_error`, `stopped`.

**Frontend** (`App.tsx`): Single component with `useState`. shadcn/ui components. Dark mode via CSS variables + `oklch()`.

**API key**: Stored in `localStorage`, sent as `?token=` query param. First-visit dialog if no key detected.

## Deployment

- **GitHub**: `github.com/Poyinte/Detypo`
- **Docker Hub**: `poyinte/detypo`
- **CI**: GitHub Actions builds Docker image on version tags (`v*`)
- **License**: GNU AGPL v3.0 (required by PyMuPDF)

## shadcn/ui

Components in `frontend/src/components/ui/`. Add via `npx shadcn@latest add <component>` from `frontend/`.
