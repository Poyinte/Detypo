"""Language profile — bundles rules, system prompt, categories, and colors per language."""
from dataclasses import dataclass
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
