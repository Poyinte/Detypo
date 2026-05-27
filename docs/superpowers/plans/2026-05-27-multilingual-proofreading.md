# Multilingual Proofreading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add English proofreading support with auto language detection, user-customizable rule files, and a sidebar UI language toggle — without overhauling the existing architecture.

**Architecture:** A new `LanguageProfile` dataclass bundles per-language config (rules file, system prompt, categories, colors). Profiles are built at startup by scanning `rules/proofreading-rules-*.md` matched against `rules/languages.json`. Language detection uses char-set stats on upload. UI language is a separate dimension stored in localStorage. Frontend i18n is a simple hook-based dictionary.

**Tech Stack:** Python (FastAPI, PyMuPDF), TypeScript (React 19, Vite, shadcn/ui)

---

### Task 1: Rename rules file and create languages.json

**Files:**
- Rename: `rules/proofreading-rules.md` → `rules/proofreading-rules-zh.md`
- Create: `rules/languages.json`

- [ ] **Step 1: Rename the existing rules file**

Run: `git mv rules/proofreading-rules.md rules/proofreading-rules-zh.md`

- [ ] **Step 2: Create `rules/languages.json`**

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

- [ ] **Step 3: Commit**

```bash
git add rules/proofreading-rules-zh.md rules/languages.json
git commit -m "refactor: rename rules file with lang suffix, add languages.json config"
```

---

### Task 2: Create `core/language_profile.py`

**Files:**
- Create: `core/language_profile.py`

- [ ] **Step 1: Create the file with LanguageProfile dataclass, system prompts, loader, detector, and hex-to-rgb helper**

```python
"""Language profile — bundles rules, system prompt, categories, and colors per language."""
import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class LanguageProfile:
    code: str                # "zh", "en"
    name: str                # "中文", "English"
    rules_content: str       # loaded rules file content
    categories: dict[str, str]  # {category_name: hex_color}
    system_prompt: str       # fully built system prompt


# Per-language system prompt templates.
# {rules} and {categories} are injected at profile build time.

_SYSTEM_PROMPTS: dict[str, str] = {
    "zh": (
        "你是一名专业的图书校对员。请严格按照以下校对规则对用户提供的文本进行校对。\n\n"
        "{rules}\n\n"
        "重要提示：\n"
        "1. 文本中的 [#NNNN] 是文本块位置标识符，不是正文内容，不要校对这些 ID。\n"
        "2. category 必须是以下值之一：{categories}\n"
        "3. 只返回确实有错误的条目。原文正确则不要编造条目。\n"
        "4. original 和 correction 必须不同，correction 必须是正确的修改建议。\n"
        "5. 每个 original 控制在 50 字以内，精确指向错误位置，不要整段返回。\n\n"
        "你必须严格输出如下 JSON 格式，不要包含任何其他内容：\n"
        '{{"errors": [{{"error_id": "#0001", "original": "错字", "correction": "正字", "category": "用字错误", "reason": "原因"}}]}}\n'
        '如果没有发现任何错误，请输出：{{"errors": []}}'
    ),
    "en": (
        "You are a professional book copyeditor. Proofread the following text strictly according to the rules below.\n\n"
        "{rules}\n\n"
        "Important:\n"
        "1. Text marked with [#NNNN] are positional identifiers, not body text — do NOT proofread these IDs.\n"
        "2. category must be one of: {categories}\n"
        "3. Only return entries that contain actual errors. Do NOT fabricate entries for correct text.\n"
        "4. original and correction must differ; correction must be an accurate suggestion.\n"
        "5. Keep each original under 50 words, pinpointing the exact error location.\n\n"
        "You must output strictly the following JSON format with no other content:\n"
        '{{"errors": [{{"error_id": "#0001", "original": "misspelled", "correction": "correct", "category": "Spelling", "reason": "explanation"}}]}}\n'
        'If no errors are found, output: {{"errors": []}}'
    ),
}

# English false-positive filter keywords
_FALSE_REASONS_EN = [
    "no error", "correct usage", "acceptable", "correct as is", "no change needed",
]

# Chinese false-positive filter keywords (extracted from existing llm_client.py)
_FALSE_REASONS_ZH = ["无错误", "使用正确", "无误", "正确用法", "或使用正确", "没有错误"]

FALSE_REASONS: dict[str, list[str]] = {
    "zh": _FALSE_REASONS_ZH,
    "en": _FALSE_REASONS_EN,
}


def hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Convert '#D44545' to (0.831, 0.271, 0.271) for PyMuPDF."""
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _build_system_prompt(lang_code: str, rules_content: str, categories: dict[str, str]) -> str:
    template = _SYSTEM_PROMPTS.get(lang_code, _SYSTEM_PROMPTS["en"])
    cat_list = "、".join(categories.keys()) if lang_code == "zh" else ", ".join(categories.keys())
    return template.format(rules=rules_content, categories=cat_list)


def load_profiles(rules_dir: str, languages_json_path: str) -> dict[str, LanguageProfile]:
    """Scan rules/ for proofreading-rules-*.md, match against languages.json, build profiles."""
    import json
    rules_path = Path(rules_dir)
    with open(languages_json_path, "r", encoding="utf-8") as f:
        lang_configs: dict = json.load(f)

    profiles: dict[str, LanguageProfile] = {}
    for code, cfg in lang_configs.items():
        rules_file = rules_path / f"proofreading-rules-{code}.md"
        if not rules_file.exists():
            continue
        rules_content = rules_file.read_text(encoding="utf-8")
        system_prompt = _build_system_prompt(cfg.get("prompt_lang", code), rules_content, cfg["categories"])
        profiles[code] = LanguageProfile(
            code=code,
            name=cfg["name"],
            rules_content=rules_content,
            categories=cfg["categories"],
            system_prompt=system_prompt,
        )
    return profiles


def detect_language(texts: list[str]) -> str:
    """Detect language from extracted page texts using character-set statistics.
    Returns 'zh' if CJK ratio > 50%, otherwise 'en'."""
    sample = "".join(texts)[:5000]
    if not sample.strip():
        return "zh"  # default fallback

    cjk = 0
    latin = 0
    for ch in sample:
        cp = ord(ch)
        if (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or
            0xF900 <= cp <= 0xFAFF or 0x3000 <= cp <= 0x303F):
            cjk += 1
        elif ch.isascii() and ch.isalpha():
            latin += 1

    total = cjk + latin
    if total == 0:
        return "zh"
    return "zh" if cjk / total > 0.5 else "en"
```

- [ ] **Step 2: Commit**

```bash
git add core/language_profile.py
git commit -m "feat: add LanguageProfile with system prompt templates, profile loader, and language detection"
```

---

### Task 3: Create English placeholder rules

**Files:**
- Create: `rules/proofreading-rules-en.md`

- [ ] **Step 1: Create `rules/proofreading-rules-en.md`**

```markdown
# Proofreading Rules (English)

> This file is a placeholder rule set. Replace with Chicago Manual of Style-based rules.

## 1. Spelling & Homophones

### 1.1 Common Confusables (20 pairs)
- their / there / they're — "they're going" ≠ "their going"
- your / you're — "you're welcome" ≠ "your welcome"
- its / it's — "it's ready" ≠ "its ready" (possessive)
- to / too / two — "too many" ≠ "to many"
- affect / effect — "affect" (verb) vs "effect" (noun, unless "effect change")
- principal / principle — "the principal reason" ≠ "the principle reason"
- stationary / stationery — "stationary object" ≠ "stationery (paper goods)"
- compliment / complement — "compliment (praise)" ≠ "complement (goes well with)"
- discrete / discreet — "discrete units" ≠ "discreet (tactful)"
- ensure / insure — "ensure (make certain)" vs "insure (financial)"
- precede / proceed — "precede (come before)" ≠ "proceed (go forward)"
- advise / advice — "advise (verb)" ≠ "advice (noun)"
- loose / lose — "loose clothing" ≠ "lose a game"
- than / then — "better than" ≠ "and then"
- who's / whose — "who's coming" ≠ "whose book"
- lie / lay — "lie down" vs "lay something down"
- farther / further — "farther (physical distance)" vs "further (figurative)"
- fewer / less — "fewer items (countable)" ≠ "less water (uncountable)"
- i.e. / e.g. — "i.e." (that is) ≠ "e.g." (for example)
- between / among — "between two items" vs "among many items"

### 1.2 UK/US Spelling Consistency
- Prefer consistent regional spelling within a document.
- Common US/UK differences: color/colour, center/centre, realize/realise, defense/defence, traveler/traveller, catalog/catalogue.

## 2. Grammar

### 2.1 Subject-Verb Agreement
- Singular subjects take singular verbs. "The list of items is long" ≠ "The list of items are long"
- Compound subjects joined by "and" take plural verbs. "Tom and Jerry are here."

### 2.2 Pronoun Agreement
- Pronouns must agree in number with their antecedents. "Each student must bring their book" → "Each student must bring his or her book" (or recast: "All students must bring their books")

### 2.3 Dangling / Misplaced Modifiers
- "Walking down the street, the trees were beautiful." → "Walking down the street, I saw beautiful trees."
- "I only ate pizza." → "I ate only pizza." (limiting modifier placement)

### 2.4 Parallel Structure
- "She likes swimming, hiking, and to bike." → "She likes swimming, hiking, and biking."
- Correlative pairs must match: "neither X nor Y", "either X or Y", "not only X but also Y"

## 3. Punctuation

### 3.1 Commas
- Serial/Oxford comma: "a, b, and c" (recommended for clarity).
- Restrictive vs non-restrictive: "The car that is red" (restrictive, no commas) ≠ "The car, which is red," (non-restrictive, commas required).
- After introductory clauses: "After the meeting, we left."

### 3.2 Apostrophes
- Possessive: "the dog's bone", "the dogs' bones"
- Plurals do NOT use apostrophes: "the 1990s" ≠ "the 1990's"

### 3.3 Dashes
- Em dash (—) for interruption or emphasis: "He arrived—late as usual—and sat down."
- En dash (–) for ranges: "pages 10–20", "January–March"
- Hyphen (-) for compound modifiers: "well-known author", "state-of-the-art technology"

### 3.4 Quotation Marks
- Periods and commas inside quotes: He said, "Wait."
- Semicolons and colons outside quotes: She called it "the best"; he disagreed.
- Single quotes for nested quotations: "She said 'hello' to me."

## 4. Style

### 4.1 Wordiness
- Avoid redundant expressions: "advance planning" → "planning", "basic fundamentals" → "fundamentals"
- "In order to" → "To", "due to the fact that" → "because"
- "At this point in time" → "now"

### 4.2 Active vs Passive Voice
- Prefer active voice: "The committee decided" over "It was decided by the committee"

### 4.3 Contractions
- Avoid contractions in formal writing: "do not" over "don't", "cannot" over "can't"

### 4.4 Numbers
- Spell out numbers below 10 (or 100, depending on style guide). "three" not "3" in running text.
- Avoid starting sentences with numerals.

## 5. Typography

### 5.1 Spacing
- Single space between sentences (not double).
- No space before punctuation marks (period, comma, semicolon, colon).

### 5.2 Special Characters
- Use proper typographic characters: em dash (—), en dash (–), ellipsis (…), not double hyphens (--) or three dots (...)

---

## Proofreading Principles

1. Only mark actual errors. Do not over-correct.
2. Consider context before flagging — some constructions are correct in context.
3. `[#NNNN]` is a positional identifier — do NOT modify or proofread it.
4. Each error_id must correspond to an actual `[#NNNN]` marker in the text.
5. Annotation scope must be limited to the erroneous word/phrase only.
6. Only return entries with actual errors. Do NOT return confirmations of correct text.
7. Line breaks in the text represent PDF structural separations, not sentence boundaries. Do not flag punctuation errors due to line breaks.
```

- [ ] **Step 2: Commit**

```bash
git add rules/proofreading-rules-en.md
git commit -m "feat: add English placeholder proofreading rules"
```

---

### Task 4: Update `utils/config.py`

**Files:**
- Modify: `utils/config.py`

- [ ] **Step 1: Replace RULES_FILE with RULES_DIR, add language profile loading**

Replace the `RULES_FILE` line:

```python
# Proofreading rules
RULES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "rules"
)
LANGUAGES_JSON = os.path.join(RULES_DIR, "languages.json")
```

Remove the old `RULES_FILE = ...` line entirely.

- [ ] **Step 2: Remove CATEGORY_COLORS and CATEGORY_HEX (now in languages.json)**

Delete the `CATEGORY_COLORS` and `CATEGORY_HEX` dicts from config.py. The backend will derive colors from `LanguageProfile.categories` at runtime via `hex_to_rgb()`.

- [ ] **Step 3: Commit**

```bash
git add utils/config.py
git commit -m "refactor: replace RULES_FILE with RULES_DIR, remove hardcoded category colors"
```

---

### Task 5: Update `core/llm_client.py`

**Files:**
- Modify: `core/llm_client.py`

- [ ] **Step 1: Change `proofread()` to accept `LanguageProfile`**

Change the method signature and system prompt construction. The import block already exists; add `from core.language_profile import LanguageProfile, FALSE_REASONS`.

Replace the entire `proofread` method:

```python
    def proofread(self, annotated_text: str, profile: LanguageProfile) -> tuple[list[dict], dict]:
        self._ensure_key()
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": profile.system_prompt},
                {"role": "user", "content": f"请校对以下文本：\n\n{annotated_text}" if profile.code == "zh" else f"Please proofread the following text:\n\n{annotated_text}"},
            ],
            "response_format": {"type": "json_object"},
        }
        import time as _time
        last_exc = None
        for attempt in range(3):
            try:
                resp = requests.post(
                    f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=REQUEST_TIMEOUT,
                )
                if resp.status_code == 429:
                    wait = 2 ** attempt
                    _time.sleep(wait)
                    continue
                break
            except requests.Timeout:
                raise LlmError(
                    f"DeepSeek API 请求超时（{REQUEST_TIMEOUT}秒）。请尝试校对更短的文本段。"
                )
            except requests.ConnectionError:
                raise LlmError(
                    "无法连接 DeepSeek API。请检查网络连接和 API Key。",
                    "地址: " + DEEPSEEK_BASE_URL,
                )
        else:
            raise LlmError(f"DeepSeek API 并发限制（HTTP 429），已重试 3 次均失败。请稍后重试。")

        if not resp.ok:
            try:
                err_data = resp.json()
                err_msg = err_data.get("error", {}).get("message", resp.text)
            except Exception:
                err_msg = resp.text or f"HTTP {resp.status_code}"
            raise LlmError(f"DeepSeek API 错误: {err_msg}")

        data = resp.json()
        usage = data.get("usage", {})
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

        try:
            errors = json.loads(content).get("errors", [])
            return self._filter_false_positives(errors, profile.code), usage
        except json.JSONDecodeError:
            text = content.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            try:
                errors = json.loads(text.strip()).get("errors", [])
                return self._filter_false_positives(errors, profile.code), usage
            except json.JSONDecodeError:
                return [], usage
```

- [ ] **Step 2: Update `_filter_false_positives` to accept lang_code**

```python
    @staticmethod
    def _filter_false_positives(errors: list[dict], lang_code: str = "zh") -> list[dict]:
        """Filter out LLM responses that are false positives:
        - original == correction (no actual change)
        - reason indicates no error
        - original is too long (likely a whole paragraph with no real error)
        - empty original or correction
        """
        false_reasons = FALSE_REASONS.get(lang_code, FALSE_REASONS["zh"])
        filtered = []
        for err in errors:
            original = err.get("original", "").strip()
            correction = err.get("correction", "").strip()
            reason = err.get("reason", "").strip()

            if not original or not correction:
                continue
            if original == correction:
                continue
            if any(kw in reason for kw in false_reasons):
                continue
            if len(original) > 200:
                continue
            filtered.append(err)
        return filtered
```

- [ ] **Step 3: Commit**

```bash
git add core/llm_client.py
git commit -m "refactor: accept LanguageProfile in llm_client.proofread(), per-language false-positive filter"
```

---

### Task 6: Update `core/proofreader.py`

**Files:**
- Modify: `core/proofreader.py`

- [ ] **Step 1: Change constructor to accept LanguageProfile**

Change the constructor signature and field:

```python
from core.language_profile import LanguageProfile

class Proofreader:
    def __init__(self, pdf_engine: PdfEngine, annotator: TextAnnotator,
                 llm_client: LlmClient, profile: LanguageProfile):
        self._engine = pdf_engine
        self._annotator = annotator
        self._llm = llm_client
        self._profile = profile
        self._stop_flag = False
        self._errors: list[dict] = []
```

- [ ] **Step 2: Update the LLM call in `process_batch` inner function**

Change this line in the `process_batch` closure inside `run()`:

```python
llm_errors, usage = self._llm.proofread(annotated_text, self._profile)
```

- [ ] **Step 3: Replace CATEGORY_COLORS import with profile-based lookup**

Remove `from utils.config import CATEGORY_COLORS, get_batch_size`.
Add `from core.language_profile import hex_to_rgb`.

In the resolved-errors block, replace the color lookup:

```python
category = err.get("category", list(self._profile.categories.keys())[0])
hex_color = self._profile.categories.get(category, list(self._profile.categories.values())[0])
color = hex_to_rgb(hex_color)
```

- [ ] **Step 4: Commit**

```bash
git add core/proofreader.py
git commit -m "refactor: use LanguageProfile in Proofreader for rules, categories, and colors"
```

---

### Task 7: Update `server.py`

**Files:**
- Modify: `server.py`

- [ ] **Step 1: Update imports**

Replace:
```python
from utils.config import UPLOAD_DIR, RULES_FILE, CATEGORY_COLORS, CATEGORY_HEX, HOST, PORT, DEEPSEEK_BASE_URL, MODEL_NAME, DEEPSEEK_API_KEY
```

With:
```python
from utils.config import UPLOAD_DIR, RULES_DIR, LANGUAGES_JSON, HOST, PORT, DEEPSEEK_BASE_URL, MODEL_NAME, DEEPSEEK_API_KEY
```

Add:
```python
from core.language_profile import load_profiles, detect_language, hex_to_rgb
```

- [ ] **Step 2: Replace `_load_rules()` with profile loading**

Replace the existing `_load_rules` function:

```python
# Language profiles — loaded once at startup
LANGUAGE_PROFILES: dict = load_profiles(RULES_DIR, LANGUAGES_JSON)


def _load_rules() -> str:
    """Legacy helper — returns Chinese rules content. Kept for minimal compat."""
    return LANGUAGE_PROFILES["zh"].rules_content
```

- [ ] **Step 3: Add language detection to upload endpoint**

In `upload_pdf`, after extracting `page_texts`, add:

```python
    detected_lang = detect_language(page_texts)
```

And in the `sessions[file_id]` dict, add:
```python
        "detected_lang": detected_lang,
```

Add `"detected_lang": detected_lang` and `"languages": {code: p.name for code, p in LANGUAGE_PROFILES.items()}` to the return dict.

- [ ] **Step 4: Update `/api/proofread/{file_id}` to use profiles**

In the proofread endpoint, replace:
```python
    rules = _load_rules()
    proofreader = Proofreader(engine, annotator, llm, rules)
```

With:
```python
    # Determine proofreading language
    lang = request.query_params.get("lang") or session.get("detected_lang", "zh")
    if lang not in LANGUAGE_PROFILES:
        lang = "zh"
    profile = LANGUAGE_PROFILES[lang]
    proofreader = Proofreader(engine, annotator, llm, profile)
```

- [ ] **Step 5: Add `/api/languages` endpoint**

```python
@app.get("/api/languages")
async def get_languages():
    return {
        code: {
            "name": p.name,
            "categories": p.categories,
        }
        for code, p in LANGUAGE_PROFILES.items()
    }
```

- [ ] **Step 6: Update export endpoint to use profile colors**

In `export_pdf`, replace the `CATEGORY_COLORS` lookup with profile-based hex-to-RGB:

```python
    # Load profile for the session to get category colors
    lang = session.get("detected_lang", "zh")
    profile = LANGUAGE_PROFILES.get(lang, LANGUAGE_PROFILES["zh"])
    ...
    for err in errors:
        if err.get("error_id") in exclude_set:
            continue
        category = err.get("category", list(profile.categories.keys())[0])
        hex_color = profile.categories.get(category, list(profile.categories.values())[0])
        color = hex_to_rgb(hex_color)
        ...
```

- [ ] **Step 7: Commit**

```bash
git add server.py
git commit -m "feat: add language detection on upload, profile-based proofreading, /api/languages endpoint"
```

---

### Task 8: Create `frontend/src/i18n.ts`

**Files:**
- Create: `frontend/src/i18n.ts`

- [ ] **Step 1: Create the i18n module**

```typescript
import { useState, useCallback, useMemo } from 'react'

export type UILang = 'zh' | 'en'

// Translation dictionary
const translations: Record<UILang, Record<string, string>> = {
  zh: {
    // Sidebar
    'nav.upload': '上传 PDF',
    'nav.export': '导出 PDF',
    'nav.docs': '使用文档',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API 设置',
    'nav.api_title': 'API 设置',
    'nav.validate_pass': '验证通过',
    'nav.validate_fail': 'API Key 无效',
    'nav.validate_btn': '验证并保存',
    'nav.validating': '验证中...',

    // Language toggle
    'lang.ui_label': '界面语言',

    // Header
    'header.list': '列表',
    'header.card': '卡片',

    // Proofreading language
    'proof.lang_label': '校对语种',
    'proof.lang_auto': '自动检测',

    // Pagination
    'pagination.prev': '上一页',
    'pagination.next': '下一页',
    'pagination.first': '已是第一页',
    'pagination.last': '已是最后一页',
    'pagination.page': 'PDF 第 {n} 页',
    'pagination.no_errors': '暂无问题页面',

    // PDF upload wizard
    'wizard.drop_title': '拖拽 PDF 文件到此处',
    'wizard.drop_hint': '或点击选择文件',
    'wizard.select_file': '选择文件',
    'wizard.reupload_title': '确认重新上传',
    'wizard.reupload_desc': '当前校对结果将丢失，确定要上传新文件吗？',
    'wizard.reupload_confirm': '确定',
    'wizard.reupload_cancel': '取消',
    'wizard.info_pages': '页数',
    'wizard.info_filename': '文件名',
    'wizard.info_fileid': '文件 ID',
    'wizard.info_tokens': '预估 Token',
    'wizard.range_label': '校对范围',
    'wizard.range_all': '全部',
    'wizard.range_custom': '自定义',
    'wizard.start_btn': '开始校对',
    'wizard.cost_est': '预估费用',
    'wizard.cost_free': '免费额度内',
    'wizard.cost_unknown': '费用计算中...',

    // Data table
    'table.original': '原文',
    'table.correction': '建议修改',
    'table.category': '类别',
    'table.reason': '原因',
    'table.page': '页码',
    'table.columns': '列显示',
    'table.category_filter': '类别筛选',
    'table.rows_per_page': '每页行数',
    'table.reset': '重置',
    'table.no_results': '暂无结果',
    'table.showing': '显示',
    'table.of': '共',
    'table.selected': '已选',

    // Progress
    'progress.extracting': '正在提取文本...',
    'progress.proofreading': '正在校对...',
    'progress.complete': '校对完成',
    'progress.error': '校对出错',
    'progress.stopped': '校对已停止',
    'progress.cost': '费用',
  },
  en: {
    // Sidebar
    'nav.upload': 'Upload PDF',
    'nav.export': 'Export PDF',
    'nav.docs': 'Documentation',
    'nav.github': 'GitHub',
    'nav.api_settings': 'API Settings',
    'nav.api_title': 'API Settings',
    'nav.validate_pass': 'Verified',
    'nav.validate_fail': 'Invalid API Key',
    'nav.validate_btn': 'Validate & Save',
    'nav.validating': 'Verifying...',

    // Language toggle
    'lang.ui_label': 'UI Language',

    // Header
    'header.list': 'List',
    'header.card': 'Cards',

    // Proofreading language
    'proof.lang_label': 'Proofreading Language',
    'proof.lang_auto': 'Auto Detect',

    // Pagination
    'pagination.prev': 'Previous',
    'pagination.next': 'Next',
    'pagination.first': 'Already on first page',
    'pagination.last': 'Already on last page',
    'pagination.page': 'PDF Page {n}',
    'pagination.no_errors': 'No issues found',

    // PDF upload wizard
    'wizard.drop_title': 'Drop PDF file here',
    'wizard.drop_hint': 'or click to select file',
    'wizard.select_file': 'Select File',
    'wizard.reupload_title': 'Confirm Re-upload',
    'wizard.reupload_desc': 'Current proofreading results will be lost. Are you sure you want to upload a new file?',
    'wizard.reupload_confirm': 'Confirm',
    'wizard.reupload_cancel': 'Cancel',
    'wizard.info_pages': 'Pages',
    'wizard.info_filename': 'Filename',
    'wizard.info_fileid': 'File ID',
    'wizard.info_tokens': 'Estimated Tokens',
    'wizard.range_label': 'Page Range',
    'wizard.range_all': 'All',
    'wizard.range_custom': 'Custom',
    'wizard.start_btn': 'Start Proofreading',
    'wizard.cost_est': 'Est. Cost',
    'wizard.cost_free': 'Within free tier',
    'wizard.cost_unknown': 'Calculating...',

    // Data table
    'table.original': 'Original',
    'table.correction': 'Correction',
    'table.category': 'Category',
    'table.reason': 'Reason',
    'table.page': 'Page',
    'table.columns': 'Columns',
    'table.category_filter': 'Category Filter',
    'table.rows_per_page': 'Rows per page',
    'table.reset': 'Reset',
    'table.no_results': 'No results',
    'table.showing': 'Showing',
    'table.of': 'of',
    'table.selected': 'Selected',

    // Progress
    'progress.extracting': 'Extracting text...',
    'progress.proofreading': 'Proofreading...',
    'progress.complete': 'Proofreading complete',
    'progress.error': 'Proofreading error',
    'progress.stopped': 'Proofreading stopped',
    'progress.cost': 'Cost',
  },
}

// Load persisted UI language
function loadUILang(): UILang {
  try {
    const stored = localStorage.getItem('ui_lang')
    if (stored === 'zh' || stored === 'en') return stored
  } catch {}
  // Fall back to browser language
  if (typeof navigator !== 'undefined' && navigator.language?.startsWith('zh')) return 'zh'
  return 'en'
}

let _globalLang: UILang = loadUILang()
let _listeners: Array<() => void> = []

export function getUILang(): UILang {
  return _globalLang
}

export function setUILang(lang: UILang) {
  _globalLang = lang
  try { localStorage.setItem('ui_lang', lang) } catch {}
  _listeners.forEach(fn => fn())
}

export function subscribeUILang(fn: () => void) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(f => f !== fn) }
}

export function useI18n() {
  const [lang, setLang] = useState<UILang>(_globalLang)

  const subscribeFn = useCallback(() => setLang(_globalLang), [])

  // Listen for external changes (e.g. sidebar toggle)
  useEffect(() => {
    return subscribeUILang(subscribeFn)
  }, [subscribeFn])

  const t = useCallback((key: string, vars?: Record<string, string | number>): string => {
    let value = translations[lang]?.[key] ?? translations['zh']?.[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v))
      }
    }
    return value
  }, [lang])

  const setUILangFn = useCallback((newLang: UILang) => {
    setLang(newLang)
    setUILang(newLang)
  }, [])

  return { t, uiLang: lang, setUiLang: setUILangFn }
}
```

Note: add `import { useEffect } from 'react'` at the top (the existing import is only `useState, useCallback, useMemo` — the hook actually uses `useEffect` too).

Updated imports:
```typescript
import { useState, useCallback, useMemo, useEffect } from 'react'
```

Wait — `useMemo` isn't used. Let me fix that:

```typescript
import { useState, useCallback, useEffect } from 'react'
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/i18n.ts
git commit -m "feat: add i18n module with zh/en translations and useI18n hook"
```

---

### Task 9: Update `frontend/src/components/app-sidebar.tsx`

**Files:**
- Modify: `frontend/src/components/app-sidebar.tsx`

- [ ] **Step 1: Add UI language toggle button above API settings**

Add import:
```typescript
import { useI18n } from '@/i18n'
import { LanguagesIcon } from 'lucide-react'
```

Add the language toggle button in the SidebarFooter, before the API settings popover. Replace the entire `<SidebarFooter>` block:

```tsx
      <SidebarFooter>
        <SidebarMenu>
          {/* Language toggle */}
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton tooltip={t('lang.ui_label')}>
                  <LanguagesIcon />
                  <span>{t('lang.ui_label')}</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent className="w-48" side="top" align="start" sideOffset={12}>
                <div className="flex flex-col gap-1">
                  {([
                    { code: 'zh' as const, label: '中文' },
                    { code: 'en' as const, label: 'English' },
                  ]).map(({ code, label }) => (
                    <Button
                      key={code}
                      variant={uiLang === code ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setUiLang(code)}
                      className="justify-start"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          {/* API settings */}
          <SidebarMenuItem>
            ...existing API settings popover, but replace hardcoded Chinese text with t() calls...
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
```

And add the hook call at the top of the component function:

```typescript
  const { t, uiLang, setUiLang } = useI18n()
```

- [ ] **Step 2: Internationalize sidebar text**

Replace:
- `tooltip="API 设置"` → `tooltip={t('nav.api_settings')}`
- `<span>API 设置</span>` → `<span>{t('nav.api_settings')}</span>`
- `<PopoverTitle>API 设置</PopoverTitle>` → `<PopoverTitle>{t('nav.api_title')}</PopoverTitle>`
- `placeholder="sk-"` → stays unchanged (API key format is universal)
- Button text conditions:
  - `'验证通过'` → `t('nav.validate_pass')`
  - `'API Key 无效'` → `t('nav.validate_fail')`
  - `'验证并保存'` → `t('nav.validate_btn')`
  - `'验证中...'` → `t('nav.validating')`

Also add the i18n hook entries for navMain and navDocs titles:

Replace:
```typescript
  const navMain = [
    {
      title: "上传 PDF",
```
with:
```typescript
  const navMain = [
    {
      title: t('nav.upload'),
```

And `"导出 PDF"` → `t('nav.export')`. For `navDocs`, replace `"使用文档"` → `t('nav.docs')`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/app-sidebar.tsx
git commit -m "feat: add UI language toggle button to sidebar, i18n sidebar text"
```

---

### Task 10: Update `frontend/src/App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add i18n and proofreading language state**

Add imports at top:
```typescript
import { useI18n } from '@/i18n'
```

Remove the hardcoded import from data-table (CATEGORIES won't be used directly). Replace:
```typescript
import { DataTable, CATEGORIES } from '@/components/data-table'
```
with:
```typescript
import { DataTable } from '@/components/data-table'
```

Add new state variables after the existing state declarations:

```typescript
  // UI language
  const { t, uiLang } = useI18n()

  // Proofreading language
  const [proofLang, setProofLang] = useState<string>('auto')
  const [detectedLang, setDetectedLang] = useState<string>('zh')
  const [availableLangs, setAvailableLangs] = useState<Record<string, string>>({})

  // Language-specific categories and colors (from API)
  const [langCategories, setLangCategories] = useState<Record<string, string>>({})
  const [langCatBadge, setLangCatBadge] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Compute badge colors from API-returned hex**

Add a helper and compute badge styles:

```typescript
  const CAT_BADGE_COMPUTED = useMemo(() => {
    const catToHex = langCategories
    // Generate Tailwind-style badge classes from hex colors
    // Map each hex to its light/dark badge variant
    const badgeMap: Record<string, string> = {}
    for (const [cat, hex] of Object.entries(catToHex)) {
      // Use inline style approach — simpler and works with any hex
      badgeMap[cat] = hex
    }
    return badgeMap
  }, [langCategories])
```

Actually, since categories are dynamic and we can't have Tailwind classes for every possible color, the right approach is inline styles. Let me revise:

Add:
```typescript
  // Compute badge inline styles from category hex colors
  const categoryStyles = useMemo(() => {
    const map: Record<string, { backgroundColor: string; color: string }> = {}
    for (const [cat, hex] of Object.entries(langCategories)) {
      // Light mode: tinted bg, dark text
      map[cat] = {
        backgroundColor: `${hex}1a`, // hex + 10% opacity
        color: hex,
      }
    }
    return map
  }, [langCategories])
```

- [ ] **Step 3: Update upload handler to capture language info**

In the `upload` function, after `const d = await r.json()`, add:

```typescript
      if (d.detected_lang) setDetectedLang(d.detected_lang)
      if (d.languages) setAvailableLangs(d.languages)
```

And fetch categories for the detected language:

```typescript
      fetch(`${API}/api/languages`)
        .then(r => r.json())
        .then(langData => {
          const lang = proofLang === 'auto' ? (d.detected_lang || 'zh') : proofLang
          if (langData[lang]) {
            setLangCategories(langData[lang].categories)
          }
        }).catch(() => {})
```

- [ ] **Step 4: Update proofread start to pass lang param**

In `startProofread`, add `lang` query param:

```typescript
      url.searchParams.set('lang', proofLang === 'auto' ? detectedLang : proofLang)
```

- [ ] **Step 5: Internationalize UI strings in JSX**

Replace hardcoded Chinese text throughout the return JSX:

- `'列表'` → `t('header.list')` (in TabsTrigger)
- `'卡片'` → `t('header.card')`
- `text="上一页"` → `text={t('pagination.prev')}`
- `text="下一页"` → `text={t('pagination.next')}`
- `'已是第一页'` → `t('pagination.first')`
- `'已是最后一页'` → `t('pagination.last')`
- `\`PDF 第 ${currentPage} 页\`` → `` t('pagination.page', { n: currentPage }) ``
- `'暂无问题页面'` → `t('pagination.no_errors')`
- `'网络错误，请重试'` → (in validateKey) keep as-is for now (error strings are lower priority)

- [ ] **Step 6: Pass language props to DataTable**

In the DataTable JSX, add new props:

```tsx
                <DataTable
                  data={errors}
                  excludedIds={excludedIds}
                  onToggleExclude={toggleExclude}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                  categoryFilters={categoryFilters}
                  onCategoryFiltersChange={setCategoryFilters}
                  animKey={animKey}
                  loading={showElapsed && errors.length === 0}
                  categories={Object.keys(langCategories)}
                  categoryColors={langCategories}
                  t={t}
                />
```

- [ ] **Step 7: Remove the old CAT_BADGE and CATEGORIES-based code**

Delete the local `CAT_BADGE` constant (lines 59-66 from the original). Remove `CATEGORIES` from the import. The `categoryFilters` initialization should use categories from API instead of the hardcoded `CATEGORIES`. Change:

```typescript
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set(CATEGORIES))
```

To:
```typescript
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set())
```

And update `categoryFilters` when `langCategories` loads:

```typescript
  useEffect(() => {
    const cats = Object.keys(langCategories)
    if (cats.length > 0) {
      setCategoryFilters(new Set(cats))
    }
  }, [langCategories])
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add proofLang state, load categories from API, i18n header/pagination text"
```

---

### Task 11: Update `frontend/src/components/data-table.tsx`

**Files:**
- Modify: `frontend/src/components/data-table.tsx`

- [ ] **Step 1: Remove hardcoded categories, accept from props**

Remove:
```typescript
export const CATEGORIES = ['用字错误', '用词不当', '语法错误', '标点符号', '数字用法', '政治敏感'] as const
```

Remove the hardcoded `CAT_BADGE` record.

Update the `DataTable` props type to accept dynamic categories:

```typescript
export function DataTable({
  data,
  excludedIds,
  onToggleExclude,
  columnVisibility,
  onColumnVisibilityChange,
  categoryFilters,
  onCategoryFiltersChange,
  animKey,
  loading,
  categories,
  categoryColors,
  t,
}: {
  data: z.infer<typeof schema>[]
  excludedIds: Set<string>
  onToggleExclude: (id: string) => void
  columnVisibility: VisibilityState
  onColumnVisibilityChange: (v: VisibilityState) => void
  categoryFilters: Set<string>
  onCategoryFiltersChange: (f: Set<string>) => void
  animKey?: number
  loading?: boolean
  categories: string[]
  categoryColors: Record<string, string>
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
```

- [ ] **Step 2: Replace hardcoded CATEGORIES references with the prop**

Replace:
```typescript
  const [categoryVis, setCategoryVis] = React.useState<Set<string>>(new Set(CATEGORIES))
```
With:
```typescript
  const [categoryVis, setCategoryVis] = React.useState<Set<string>>(new Set(categories))
```

Replace all other `CATEGORIES` references (in the dropdown filter menu) with `categories`.

- [ ] **Step 3: Replace CAT_BADGE with dynamic inline styles**

In the category badge rendering (column cell), replace the Tailwind class lookup with inline style computation. Find the Badge rendering in the category column and use:

```tsx
style={{
  backgroundColor: `${categoryColors[value] || '#888'}1a`,
  color: categoryColors[value] || '#888',
}}
```

- [ ] **Step 4: Internationalize table UI strings**

Replace hardcoded Chinese in the data-table:
- Column headers: use `t('table.original')`, `t('table.correction')`, etc.
- Dropdown labels: `t('table.columns')`, `t('table.category_filter')`, `t('table.rows_per_page')`, `t('table.reset')`
- "暂无结果" → `t('table.no_results')`
- "显示" → `t('table.showing')`
- "共" → `t('table.of')`
- "已选" → `t('table.selected')`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/data-table.tsx
git commit -m "refactor: dynamic categories from props, i18n data-table text, remove hardcoded CATEGORIES"
```

---

### Task 12: Verify the build

**Files:**
- None

- [ ] **Step 1: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No type errors. If errors, fix and re-run.

- [ ] **Step 2: Run ESLint**

```bash
cd frontend && npm run lint
```

Expected: No lint errors. If warnings/errors, fix and re-run.

- [ ] **Step 3: Run Vite build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Start backend and verify no import errors**

```bash
python -c "from server import app; print('Backend imports OK')"
```

Expected: `Backend imports OK` with no tracebacks.

- [ ] **Step 5: Smoke test — upload a PDF and start proofreading**

Start the dev server (`detypo.bat dev`), upload a PDF, and verify:
- Language detection result is shown
- Proofreading works end-to-end
- UI language toggle switches sidebar and table text
- Category colors render correctly

---

### Task 13: Final commit and PR prep

**Files:**
- Update: `CLAUDE.md` (optional — add a note about the multilingual architecture)

- [ ] **Step 1: Verify git status is clean**

```bash
git status
```

Expected: Clean working tree.

- [ ] **Step 2: Run full verification**

```bash
cd frontend && npm run build && cd .. && python -c "from server import app; print('OK')"
```
