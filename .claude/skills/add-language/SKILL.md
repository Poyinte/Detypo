---
name: add-language
description: Use when the user wants to add a new proofreading language to Detypo — they provide a rules source (PDF, URL, or ask AI to summarize) and a language code. Generates rules file, updates languages.json, and restarts the server.
---

# Add Language to Detypo

Add a new proofreading language by creating the rules file and registering it in
`rules/languages.json`. The system auto-discovers languages on restart — no
Python code changes needed.

## Required Information

Before starting, collect from the user:

1. **Language code** — short ISO code (e.g. `fr`, `ja`, `de`)
2. **Language name** — display name in the language itself (e.g. `Français`, `日本語`)
3. **Rules source** — one of:
   - Path to a PDF / text file containing style guide content
   - URL to a style guide
   - Topic / description for AI to generate rules from its own knowledge

## Process

### Step 1: Generate the rules file

The rules file must be named `proofreading-rules-{code}.md` in the `rules/`
directory. Structure it like the existing files:

- Section headers at `##` level with numbering
- Subsection headers at `###` level
- Concise, checkable rules with `≠` notation for wrong usage
- A "Proofreading Principles" section at the end

**From a file source (PDF):** Use PyMuPDF (`fitz`) to extract text. If the file
is large (50MB+), search for chapter headings first, then extract relevant
sections. Distill extracted text into concise rules following the Chinese rules
format at `rules/proofreading-rules-zh.md`.

**From AI knowledge:** For well-known style guides (e.g. French — *Le Bon
Usage*, German — *Duden*), generate rules directly with appropriate categories
for that language's most common error types.

**Categories:** Determine 3–6 error categories for the language. Each gets a
distinct hex color from this palette: `#D44545` (red), `#D4A86E` (amber),
`#6E9ED4` (blue), `#45D46E` (green), `#A86ED4` (purple), `#D46E9E` (pink).

### Step 2: Register in languages.json

Read `rules/languages.json`, add a new entry:

```json
"CODE": {
  "name": "Display Name",
  "prompt_lang": "xx",
  "sentence_separators": ".!?",
  "context_sentences": 2,
  "context_prefix_prompt": "Context from preceding text…",
  "context_suffix_prompt": "Context from following text…",
  "proofread_instruction": "Please proofread the following text:",
  "categories": {
    "Category1": "#D44545",
    "Category2": "#6E9ED4"
  },
  "system_prompt": "You are a professional copyeditor...\n\n{rules}\n\n...\ncategory must be one of: {categories}...",
  "false_reasons": ["correct", "no error"]
}
```

### Required fields

| Field | Description |
| :--- | :--- |
| `name` | Display name in the language itself |
| `categories` | Error types → hex color (3–6 entries) |
| `system_prompt` | Prompt template with `{rules}` and `{categories}` placeholders |

### Context / prompt fields (all required for full functionality)

| Field | Description | Example |
| :--- | :--- | :--- |
| `prompt_lang` | Language of the prompt text (for display) | `"ja"` |
| `sentence_separators` | Characters that end a sentence | `"。！？"` |
| `context_sentences` | Sentences to pass as cross-batch context (usually 2) | `2` |
| `context_prefix_prompt` | Header text above prefix context | "上文参考…" |
| `context_suffix_prompt` | Header text above suffix context | "下文参考…" |
| `proofread_instruction` | Instruction before the annotated text | "请校对以下文本：" |

These fields enable cross-batch context passing (reduces false positives at
page boundaries) and keep `llm_client.py` language-agnostic — all prompt
text is driven from the JSON config.

Write all prompt fields in the language's native language.

### System prompt requirements

The `system_prompt` MUST:
1. Tell the model it is a professional proofreader
2. Instruct it to follow the rules below (`{rules}`)
3. List allowed categories (`{categories}`)
4. Remind it that `[#NNNN]` are positional identifiers — do NOT proofread the
   IDs themselves, and do NOT report missing spaces between markers and
   adjacent words (the markers are formatting artifacts)
5. Require strict JSON output format: `{"errors": [...]}`
6. State that each `[#NNNN]` appears at most once

If `system_prompt` is omitted, the English fallback is used. If
`false_reasons` is omitted, `["no error", "correct usage", "acceptable"]`
is used.

### Step 3: Verify

Run the verification command to confirm the language loads:

```bash
cd d:/Claude/projects/detypo && python -c "from server import app, LANGUAGE_PROFILES; print(list(LANGUAGE_PROFILES.keys()))"
```

The new language code should appear in the output.

### Step 4: Tell the user

Report what was created and remind the user to **restart the dev server**
(`detypo.bat stop && detypo.bat dev`) for the change to take effect.

## Commit Message

```
feat: add {language name} ({code}) proofreading rules
```
