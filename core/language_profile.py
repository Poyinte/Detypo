"""Language profile — bundles rules, system prompt, categories, and colors per language.

All language-specific settings (name, categories, colors, system prompt template,
false-positive filter keywords) are configured in rules/languages.json.
Adding a new language requires only editing that JSON file and providing a
proofreading-rules-{code}.md file — no Python code changes needed.
"""
from dataclasses import dataclass
from pathlib import Path


@dataclass
class LanguageProfile:
    code: str                # "zh", "en"
    name: str                # "中文", "English"
    rules_content: str       # loaded rules file content
    categories: dict[str, str]  # {category_name: hex_color}
    system_prompt: str       # fully built system prompt
    false_reasons: list[str] # keywords for false-positive filtering
    sentence_separators: str = "。！？"  # sentence boundary punctuation
    context_sentences: int = 2            # sentences to include as context
    context_prefix_prompt: str = ""       # header before prefix context
    context_suffix_prompt: str = ""       # header before suffix context
    proofread_instruction: str = ""       # main proofreading instruction


# ── Fallback defaults (used when languages.json omits a field) ──

_FALLBACK_PROMPT = (
    "You are a professional book copyeditor. Proofread the following text strictly according to the rules below.\n\n"
    "{rules}\n\n"
    "Important:\n"
    "1. Text marked with [#NNNN] are positional identifiers, not body text — do NOT proofread these IDs.\n"
    "2. category must be one of: {categories}\n"
    "3. Only return entries that contain actual errors. Do NOT fabricate entries for correct text.\n"
    "4. original and correction must differ; correction must be an accurate suggestion.\n"
    "5. Keep each original under 50 words, pinpointing the exact error location.\n"
    "6. Each [#NNNN] identifier may appear in at most one error entry. If the same segment has multiple error types, mark only the most significant one.\n\n"
    "You must output strictly the following JSON format with no other content:\n"
    '{"errors": [{"error_id": "#0001", "original": "misspelled", "correction": "correct", "category": "Spelling", "reason": "explanation"}]}\n'
    'If no errors are found, output: {"errors": []}'
)

_FALLBACK_FALSE_REASONS: list[str] = ["no error", "correct usage", "acceptable"]


def hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Convert '#D44545' to (0.831, 0.271, 0.271) for PyMuPDF."""
    h = hex_color.lstrip("#").strip()
    if len(h) != 6:
        raise ValueError(f"Invalid hex color: {hex_color!r}")
    return tuple(int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4))


def _build_system_prompt(cfg: dict, rules_content: str, categories: dict[str, str]) -> str:
    template = cfg.get("system_prompt") or _FALLBACK_PROMPT
    cat_list = "、".join(categories.keys()) if cfg.get("prompt_lang") == "zh" else ", ".join(categories.keys())
    return template.replace("{rules}", rules_content).replace("{categories}", cat_list)


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
        if not cfg.get("categories"):
            import logging
            logging.warning(f"Language '{code}' has no categories — skipping")
            continue
        rules_content = rules_file.read_text(encoding="utf-8")
        system_prompt = _build_system_prompt(cfg, rules_content, cfg["categories"])
        profiles[code] = LanguageProfile(
            code=code,
            name=cfg["name"],
            rules_content=rules_content,
            categories=cfg["categories"],
            system_prompt=system_prompt,
            false_reasons=cfg.get("false_reasons", _FALLBACK_FALSE_REASONS),
            sentence_separators=cfg.get("sentence_separators", "。！？"),
            context_sentences=cfg.get("context_sentences", 2),
            context_prefix_prompt=cfg.get("context_prefix_prompt", ""),
            context_suffix_prompt=cfg.get("context_suffix_prompt", ""),
            proofread_instruction=cfg.get("proofread_instruction", ""),
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
