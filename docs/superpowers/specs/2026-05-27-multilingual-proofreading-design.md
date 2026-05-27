# Multilingual Proofreading — Design Spec

## Overview

Add English proofreading support to Detypo alongside existing Chinese. The system auto-detects the PDF language and selects the appropriate rule set. A new UI language toggle allows independent switching of the interface language. The architecture is extensible: users can add new languages by dropping in rule files and editing a JSON config, without touching Python code.

## Dual-Language Model

Two independent dimensions — they do not interact:

| Dimension | Purpose | Source | Storage |
|---|---|---|---|
| **Proofreading language** | Which rule set + LLM prompt to use | Auto-detect from PDF text (char-set stats), manual override in UI | Session-level (per upload) |
| **UI language** | What language the interface displays | User preference, sidebar toggle | `localStorage` (persistent) |

All four combinations work: EN UI + ZH proofreading, ZH UI + EN proofreading, etc.

## File Changes

| Action | File | Purpose |
|---|---|---|
| **New** | `rules/languages.json` | Language metadata, categories, colors — user-editable |
| **New** | `rules/proofreading-rules-en.md` | English placeholder rules (replaced later with Chicago-based rules) |
| **New** | `core/language_profile.py` | `LanguageProfile` dataclass + scanning/loading logic |
| **New** | `frontend/src/i18n.ts` | Translation dictionary + `useI18n()` hook |
| **Rename** | `rules/proofreading-rules.md` → `rules/proofreading-rules-zh.md` | Conform to naming convention |
| **Modify** | `utils/config.py` | `RULES_FILE` → `RULES_DIR`, load profiles at startup |
| **Modify** | `server.py` | Language detection on upload, pass profile to proofreader, expose language list + detection result via API |
| **Modify** | `core/llm_client.py` | Accept `LanguageProfile` instead of raw `rules_content`; build system prompt from profile |
| **Modify** | `core/proofreader.py` | Pass `LanguageProfile` through to LLM client |
| **Modify** | `frontend/src/App.tsx` | UI language state, proofreading language state, category color from API |
| **Modify** | `frontend/src/components/app-sidebar.tsx` | Language toggle button above API settings |

## `rules/languages.json` Schema

```json
{
  "zh": {
    "name": "中文",
    "prompt_lang": "zh",
    "categories": {
      "用字错误": "#D44545",
      "用词不当": "#D4A86E",
      "语法错误": "#6E9ED4",
      "标点符号": "#45D46E",
      "数字用法": "#A86ED4",
      "政治敏感": "#D46E9E"
    }
  },
  "en": {
    "name": "English",
    "prompt_lang": "en",
    "categories": {
      "Spelling": "#D44545",
      "Grammar": "#6E9ED4",
      "Punctuation": "#45D46E",
      "Style": "#D4A86E",
      "Typography": "#A86ED4"
    }
  }
}
```

Users add a language by: (1) creating `proofreading-rules-{code}.md`, (2) adding an entry to `languages.json`, (3) restarting the server.

## Language Detection

- **When**: `/api/upload` — reuses already-extracted `page_texts` from token counting
- **Method**: Sample first 5000 characters, count CJK (U+4E00–U+9FFF, U+3400–U+4DBF, U+F900–U+FAFF) vs Latin (A-Z, a-z) characters
- **Threshold**: CJK ratio > 50% → `zh`, otherwise → `en`
- **Performance**: O(n) char walk on ≤5000 chars, no measurable latency, no external dependencies
- **Result**: Stored in session dict as `detected_lang`, returned in upload response; frontend can override via proofread request param

## LanguageProfile (`core/language_profile.py`)

```python
@dataclass
class LanguageProfile:
    code: str              # "zh", "en"
    name: str              # "中文", "English"
    rules_content: str     # loaded rules file content
    categories: dict       # {category_name: hex_color}
    system_prompt: str     # fully built system prompt
```

### System prompt templates (inlined in the module)

- **Chinese**: existing prompt extracted from `llm_client.py`, with category list injected from profile
- **English**: new English-language prompt with the same structure, category list injected from profile

### Loading

`load_profiles(rules_dir: str) -> dict[str, LanguageProfile]` — scans `rules/proofreading-rules-*.md`, matches against `languages.json`, builds and returns all profiles keyed by language code.

## API Changes

### `POST /api/upload` response

Add `detected_lang: "zh" | "en"` field. Add `languages: {...}` field with available language codes and names for the frontend dropdown.

### `GET /api/proofread/{file_id}`

Add optional query param `lang` for manual override. If omitted, uses session's `detected_lang`.

### `GET /api/languages`

New endpoint returning `languages.json` content (categories + colors per language) so the frontend can map category names to colors without hardcoding.

## Frontend i18n (`frontend/src/i18n.ts`)

- `translations` object: `{ zh: { key: "值" }, en: { key: "Value" } }`
- `useI18n()` hook: returns `{ t, uiLang, setUiLang }`
- Reads initial value from `localStorage("ui_lang")`, falls back to `navigator.language`
- `setUiLang` writes to localStorage and triggers re-render
- Initial scope: all visible UI strings in App.tsx, app-sidebar.tsx, and related components

## Frontend Language Flow

1. Upload PDF → response includes `detected_lang`
2. App stores `proofLang` state (initially `detected_lang`)
3. User can switch proofreading language via dropdown (near the "start proofread" area)
4. User switches UI language via sidebar button (above API settings)
5. Proofread request sends `?lang={proofLang}`
6. Results render with category colors from the API-returned language profile

## What This Does NOT Do

- UI strings in the settings dialog, error messages from the backend, and server logs remain Chinese-only for now (can be added later)
- English rules file starts as a placeholder — user will replace with Chicago Manual-based rules
- Category names for English are provisional (`Spelling`, `Grammar`, `Punctuation`, `Style`, `Typography`) and will be adjusted based on Chicago extraction
