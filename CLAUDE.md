# CLAUDE.md — 得误 Detypo

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Detypo is a bilingual (ZH/EN) PDF proofreading tool. Users upload a PDF, the backend extracts text via PyMuPDF, auto-detects the language, sends it to the DeepSeek API for proofreading with the appropriate rule set, then overlays color-coded highlight annotations on the original PDF. The frontend shows results in a table/card view with checkboxes to include/exclude findings before exporting the annotated PDF. English rules are based on The Chicago Manual of Style (18th ed.).

## Quick start

```bash
# Windows
detypo.bat              # Production mode (build + serve, port auto-detected)
detypo.bat dev          # Dev mode (hot-reload, port auto-detected)
detypo.bat stop         # Stop background services

# macOS / Linux
./detypo                # Production mode
./detypo dev            # Dev mode
./detypo stop           # Stop background services

# Docker
docker run -p 8520:8520 poyinte/detypo
```

## Repo structure

```
├── server.py              # FastAPI backend (SSE streaming, upload, export, key persist)
├── core/                  # pdf_engine.py, text_annotator.py, llm_client.py, proofreader.py, language_profile.py
├── utils/                 # config.py, token_counter.py
├── rules/                 # proofreading-rules-zh.md, proofreading-rules-en.md, languages.json
├── tokenizer/             # DeepSeek V3 tokenizer files
├── frontend/              # React 19 + Vite + shadcn/ui
│   ├── src/App.tsx        # Main component (monolithic, useState-driven)
│   ├── src/components/    # App components + ui/ (shadcn)
│   └── public/            # favicon, logo, icons
├── docs/                  # icons/, docker-hub.md, superpowers/specs/
├── .github/workflows/     # Docker build CI (tag-triggered)
├── .claude/skills/        # add-language skill
├── detypo                 # Bash launcher
├── detypo.bat             # Windows launcher
├── Dockerfile             # Multi-stage (node build + python serve)
└── README.md
```

## Key commands (development)

```bash
# Backend
pip install -r requirements.txt
python server.py                          # Port auto-detected; pass --port N to force
python server.py --port 8520              # Force specific port

# Frontend (from frontend/)
npm install
npm run dev                               # Vite dev server, proxies /api via .detypo-port
npm run build                             # TypeScript check + Vite production build → dist/
npm run lint                              # ESLint

# Tests / verification
python -c "from server import app, LANGUAGE_PROFILES; print(list(LANGUAGE_PROFILES.keys()))"
cd frontend && npx tsc --noEmit           # TypeScript type-check
```

## Architecture

### Port handling

- Default port `8520`. Launcher finds an available port (OS-assigned) and passes `--port N` to server.
- Server writes `.detypo-port` for launcher cleanup and frontend proxy discovery.
- Launcher reuses last port (from `.detypo-port`) if still available — keeps `localStorage` origin stable.
- `.detypo-port` and `.detypo-key` are gitignored.
- `vite.config.ts` reads `.detypo-port` for dev proxy target; relative API URLs in production.

### Proofreading pipeline

Pages → batch → extract text → inject `[#NNNN]` span IDs → Annotation format: `{text}[{#NNNN}]` (ID at end, text flows naturally) → within a batch, pages concatenated directly (no `[PAGEN]` markers, no `\n` separator) → send to DeepSeek LLM → resolve IDs → add colored annotations → incremental save.

**Phase 1**: Extract all page text, build batches.
**Phase 1.5**: Extract cross-batch context — last/first N sentences from adjacent batches' plain text (stripped of IDs) → passed as prefix/suffix context with "for reference only, do NOT proofread" headers.
**Phase 2**: 2-batch warmup (sequential) for KV cache, then parallel LLM calls. Each batch gets bidirectional context.

### Span ID system

- `[#0001]` through `[#9999]` — assigned by `text_annotator.py`.
- IDs placed **after** text: `{seg_text}[{sid}]` — the LLM reads naturally without tags interrupting flow.
- ID → bbox mapping stored in `_id_map` for coordinate lookup.
- `_split_span` uses PyMuPDF `span['chars']` (character-level bboxes) for accurate positioning; falls back to proportional estimation when chars unavailable.
- `_merge_punctuation` merges punctuation-only segments into the preceding segment.

### Cross-batch context

Configured per-language in `languages.json`:

```json
{
  "sentence_separators": "。！？",
  "context_sentences": 1,
  "context_prefix_prompt": "上文参考，请勿校对上文内容，仅用于理解语境：",
  "context_suffix_prompt": "下文参考，请勿校对下文内容，仅用于理解语境：",
  "proofread_instruction": "请校对以下文本："
}
```

All prompt text is driven from the profile dataclass — `llm_client.py` has zero language branching.

### Token estimation

- `server.py` upload handler tokenizes the fixed overhead template with the real tokenizer (Rust, microseconds).
- Boundary sentences (first/last N) per page are tokenized and returned as `boundary_tokens`.
- Frontend `estimateTokens` uses real counts for sys/batch overhead and computes context text tokens from actual batch boundary pages.
- Fallback estimates only used when overhead data is unavailable.

### API key persistence

- Key saved to `.detypo-key` (server-side file) on successful validation.
- `GET /api/settings/key` returns saved key; frontend falls back to this when `localStorage` is empty (e.g., after port change).
- `POST /api/settings/key` validates and saves.

### SSE streaming

Events: `extracting`, `llm_waiting`, `batch_done`, `page_done`, `complete`, `proofread_error`, `stopped`.

Cache tokens: `usage.prompt_cache_hit_tokens` and `usage.prompt_cache_miss_tokens` (DeepSeek v4). Also checks `prompt_tokens_details.cached_tokens` (OpenAI-compat). Cache hit per batch is the system prompt (~5K tokens) — value is constant across batches, which is expected.

### Frontend

- Single component `App.tsx` with `useState`. shadcn/ui, dark mode via CSS variables + `oklch()`.
- API URLs are relative (`''`) — works same-origin in prod, Vite proxy in dev.
- `PdfUploadWizard` component handles file upload, page range selection, token/cost preview, language selection.
- Currency: CNY only (DeepSeek billing currency). English UI also shows `¥`.
- i18n via `i18n.ts` with `useI18n()` hook.

## Language configuration (languages.json)

Adding a new language requires only editing `rules/languages.json` and providing a `proofreading-rules-{code}.md` file. No Python code changes needed.

All configurable fields per language:

| Field | Description |
| :--- | :--- |
| `name` | Display name |
| `prompt_lang` | Prompt language code |
| `sentence_separators` | Sentence boundary characters |
| `context_sentences` | Sentences for cross-batch context |
| `context_prefix_prompt` | Prefix context header |
| `context_suffix_prompt` | Suffix context header |
| `proofread_instruction` | Main proofreading instruction |
| `categories` | Error types → hex color |
| `system_prompt` | Template with `{rules}` and `{categories}` |
| `false_reasons` | False-positive filter keywords |

## Git

- **Commit attribution**: `Poyinte <poyinte@gmail.com>` — do NOT add `Co-Authored-By:` trailers.
- `.detypo-port` and `.detypo-key` are gitignored (runtime artifacts).

## Deployment

- **GitHub**: `github.com/Poyinte/Detypo`
- **Docker Hub**: `poyinte/detypo`
- **CI**: GitHub Actions builds Docker image on version tags (`v*`)
- **License**: GNU AGPL v3.0 (required by PyMuPDF)

## shadcn/ui

Components in `frontend/src/components/ui/`. Add via `npx shadcn@latest add <component>` from `frontend/`.
