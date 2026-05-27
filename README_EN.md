<a href="https://www.gnu.org/licenses/agpl-3.0.html"><img src="https://www.gnu.org/graphics/agplv3-155x51.png" alt="AGPL v3" align="left"></a>
<div align="right"><a href="README.md">中文</a> | <b>English</b></div>
<br clear="all">
<br>
<div align="center">
<p>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./frontend/public/logo-dark.svg">
  <img src="./frontend/public/logo.svg" height="120" align="center">
</picture>
</p>

Bilingual (ZH/EN) PDF proofreading tool — uses AI to spot common mistakes<br>
<sub>Powered by <a href="https://platform.deepseek.com/"><img src="https://img.shields.io/badge/-DeepSeek_V4-4D6BFE?style=flat-square&logo=deepseek&logoColor=white" height="18" align="center"></a></sub>

![Python](https://img.shields.io/badge/-Python_3.10+-3776AB?style=flat-square&logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js_18+-339933?style=flat-square&logo=node.js&logoColor=white)
</div>
<br><br>
<div align="right">
<sub>* Proofreading results may contain errors; please manually review before final use.</sub>
</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/zap-dark.svg"><img src="./docs/icons/zap.svg" height="28" align="absmiddle"></picture> Features

- **Fast Proofreading** — Uses `deepseek-v4-flash` for quick and accurate error detection
- **Review and Filter** — Browse findings after proofreading, accept or reject individual items
- **Traceable Annotations** — Exported PDFs include detailed, locatable annotations for easy verification
- **Bilingual Support** — Auto-detects document language and switches to the corresponding rule set
- **Extensible** — Add new languages on your own

Chinese proofreading detects the following error types:

<div align="center">

| Category | Examples |
| :--- | :--- |
| Character Errors | Visually similar / homophone / near-homophone misuse, nonstandard glyphs (traditional characters, variant forms, old字形) |
| Word Choice | Variant-form / near-synonym misuse, idiom errors, invented words / dialect / loanwords, nonstandard abbreviations |
| Grammar | Wrong part of speech, missing sentence components, improper collocation, mixed constructions, ambiguity, illogical quantity expressions |
| Punctuation | Misuse of commas, enumeration commas, semicolons, quotation marks, book-title marks, ellipses, em/en dashes, hyphens, colons, question marks, exclamation marks, etc. |
| Numerals | Nonstandard use of Arabic vs. Chinese numerals, approximate numbers, measurement units |
| Political Sensitivity | Politically sensitive expressions, violations of applicable laws and regulations |

<sub>See [`proofreading-rules-zh.md`](rules/proofreading-rules-zh.md)</sub>

</div>

English proofreading detects the following error types:

<div align="center">

| Category | Examples |
| :--- | :--- |
| Spelling | Commonly Confused Words |
| Grammar | Subject-Verb Agreement, Pronoun Agreement, Verb Tense & Mood, Modifiers, Parallel Structure, Prepositions, Conjunctions & Syntax |
| Punctuation | Commas, Semicolons, Colons, Dashes (Em dash, En dash, Hyphen), Quotation Marks, Apostrophes, Parentheses and Brackets, Ellipses & Other Punctuation |
| Numbers | Numerals vs. Words, Dates and Times, Ranges and Inclusive Numbers, Fractions and Decimals, Money and Currency & Additional Number Conventions |

<sub>See [`proofreading-rules-en.md`](rules/proofreading-rules-en.md)</sub>

</div>

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/rocket-dark.svg"><img src="./docs/icons/rocket.svg" height="28" align="absmiddle"></picture> Quick Start

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **[DeepSeek API Key](https://platform.deepseek.com/api_keys)**

## Docker

```bash
docker run -p 8000:8000 poyinte/detypo
```

With API Key *(can also be set inside the app later)*:

```bash
docker run -p 8000:8000 -e DEEPSEEK_API_KEY=sk-xxx poyinte/detypo
```

Then open `http://localhost:8000`.

## Windows

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo

# Double-click detypo.bat (production mode — builds frontend, serves on :8000)
# Or from the command line:
detypo.bat              # Production mode (default), serves on :8000
detypo.bat dev          # Development mode (hot-reload), browser at :5173
detypo.bat stop         # Stop background services
```

## macOS / Linux

```bash
git clone git@github.com:Poyinte/Detypo.git
cd Detypo
chmod +x detypo

./detypo                # Production mode (default)
./detypo dev            # Development mode (hot-reload)
./detypo stop           # Stop background services
```

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/layers-dark.svg"><img src="./docs/icons/layers.svg" height="28" align="absmiddle"></picture> Usage Guide

1. **Set API Key** — On first launch, a dialog prompts you to enter your `DeepSeek API Key`. You can update it later in the sidebar under <kbd>API Settings</kbd>.
2. **Choose Interface Language** — Switch the UI language from the sidebar via <kbd>Interface Language</kbd>.
3. **Upload a PDF** — Drag and drop a PDF onto the `dashed area` or click <kbd>Select PDF File</kbd>.
4. **Select Proofreading Language** — The system auto-detects the document language. You can override it manually in the `wizard`.
5. **Set Page Range** — Choose which pages to proofread. The `wizard` shows page previews and estimated token usage.
6. **Start Proofreading** — Click <kbd>Start Proofreading</kbd> and wait for it to finish.
7. **Browse Results** — Review findings in <kbd>List</kbd> or <kbd>Card</kbd> view. Filter by error category.
8. **Triage Findings** — In <kbd>List</kbd> view, click items to select, then <kbd>right-click</kbd> to `reject` / `restore` (hold <kbd>left-click</kbd> and drag for `batch selection`). In <kbd>Card</kbd> view, click a `card` to `reject` / `restore`.
9. **Export PDF** — Click <kbd>Export PDF</kbd> to download an annotated proofread copy.

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/languages-dark.svg"><img src="./docs/icons/languages.svg" height="28" align="absmiddle"></picture> Adding a New Language

## One-Click via CLI

Use the `/add-language` command to automatically generate a rules file and register it in [`rules/languages.json`](rules/languages.json).

## Manual Setup

1. Create `proofreading-rules-{code}.md` in the [`rules/`](rules/) directory with the proofreading rules for that language.
2. Add a corresponding entry in [`rules/languages.json`](rules/languages.json):

```jsonc
"ja": {
  "name": "日本語",                    // Display name
  "categories": {                     // Error categories : hex color
    "表記": "#D44545",                
    "文法": "#6E9ED4",                
    "数字": "#D4A86E"                 
  },
  "system_prompt": "…{rules}…{categories}…",  // Prompt template; {rules} and {categories} are replaced at runtime (required)
  "false_reasons": ["誤りなし", "正しい"]       // False-positive filter keywords (optional)
}
```

3. Restart the server to pick up the changes.

> [!NOTE]
> Language auto-detection currently only distinguishes between `CJK (Chinese/Japanese/Korean unified ideographs)` and `Latin` scripts. If a new language shares a writing system with an existing one, it is recommended to manually select the proofreading language in the wizard.

---

# <picture><source media="(prefers-color-scheme: dark)" srcset="./docs/icons/shield-check-dark.svg"><img src="./docs/icons/shield-check.svg" height="28" align="absmiddle"></picture> Rules & License

## Proofreading Rules

**Chinese rules** [`proofreading-rules-zh.md`](rules/proofreading-rules-zh.md) were extracted by AI from [*图书编辑校对实用手册* <sub>(5th Edition)</sub>](http://bbtpress.com/bookview/1818.html) (Practical Handbook for Book Editing and Proofreading).

**English rules** [`proofreading-rules-en.md`](rules/proofreading-rules-en.md) were extracted by AI from [*The Chicago Manual of Style* <sub>(18th Edition)</sub>](https://www.chicagomanualofstyle.org/).

> [!IMPORTANT]
> This project is intended for academic research and personal use only. Users are responsible for assessing compliance with applicable regulations.

## Tech Stack

<div align="center">

| Layer | Technology |
| :--- | :--- |
| Backend | Python, FastAPI, PyMuPDF, SSE streaming |
| AI | DeepSeek API (deepseek-v4-flash) |
| Frontend | React 19, TypeScript, Vite |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI |

</div>

## License

This project is licensed under the **[GNU AGPL v3.0](https://www.gnu.org/licenses/agpl-3.0.html)**.
