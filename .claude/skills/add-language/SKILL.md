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
  "categories": {
    "Category1": "#D44545",
    "Category2": "#6E9ED4"
  },
  "system_prompt": "You are a professional copyeditor...\n\n{rules}\n\n...\ncategory must be one of: {categories}...",
  "false_reasons": ["correct", "no error"]
}
```

The `system_prompt` template supports two placeholders:
- `{rules}` — replaced with the rules file content at runtime
- `{categories}` — replaced with the comma-joined category names

If `system_prompt` is omitted, the English fallback is used. If
`false_reasons` is omitted, `["no error", "correct usage", "acceptable"]`
is used.

Write the system prompt in the language's native language if possible,
otherwise in English. The prompt MUST:
1. Tell the model it is a professional proofreader
2. Instruct it to follow the rules below (`{rules}`)
3. List allowed categories (`{categories}`)
4. Remind it not to modify `[#NNNN]` positional identifiers
5. Require strict JSON output format: `{"errors": [...]}`
6. State that each `[#NNNN]` appears at most once

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
