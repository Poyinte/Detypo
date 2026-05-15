"""从《图书编辑校对实用手册》提取校对规则，输出精炼的 LLM system prompt。"""
import fitz
import os
import re

HANDBOOK_PATH = "D:/Project/ProofreadingHandbook_unlocked.pdf"
OUTPUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), ".claude", "skills", "proofreading", "references", "proofreading-rules.md"
)

CHAPTERS = {
    "一、文字规范": (15, 27),
    "二、词语规范": (28, 54),
    "三、语法规范": (55, 65),
    "四、标点符号规范": (66, 103),
    "五、数字用法规范": (104, 113),
    "六、禁用词与敏感内容": (215, 242),
}

GARBAGE_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f​-‏ - ﻿]")

FIXES = [
    (re.compile(r"(?<=[。，、；：？！”’】】]) (?=[A-Z])"), "\n"),
    (re.compile(r"([一-鿿㐀-䶿]) +([一-鿿㐀-䶿])"), r"\1\2"),
    (re.compile(r"  +"), " "),
    (re.compile(r"([一-鿿㐀-䶿])\n([一-鿿])"), r"\1\2"),
    (re.compile(r"\n\d{1,3}\n"), "\n"),
]


def clean_text(raw: str) -> str:
    text = raw
    text = GARBAGE_RE.sub("", text)
    for pattern, replacement in FIXES:
        text = pattern.sub(replacement, text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def is_cjk(ch: str) -> bool:
    cp = ord(ch)
    return (
        (0x4E00 <= cp <= 0x9FFF)
        or (0x3400 <= cp <= 0x4DBF)
        or (0xF900 <= cp <= 0xFAFF)
        or (0x2F800 <= cp <= 0x2FA1F)
        or (0x3000 <= cp <= 0x303F)
        or (0xFF00 <= cp <= 0xFFEF)
    )


def merge_cjk_paragraphs(text: str) -> str:
    lines = text.split("\n")
    merged = []
    buffer = ""
    for line in lines:
        if not line.strip():
            if buffer:
                merged.append(buffer)
                buffer = ""
            merged.append("")
            continue
        if not buffer:
            buffer = line
        else:
            prev_end = buffer[-1] if buffer else ""
            curr_start = line[0] if line else ""
            if is_cjk(prev_end) and is_cjk(curr_start):
                buffer += line
            else:
                merged.append(buffer)
                buffer = line
    if buffer:
        merged.append(buffer)
    return "\n".join(merged)


def extract_region_pages(doc, start_page: int, end_page: int) -> str:
    pages_text = []
    for i in range(start_page, end_page + 1):
        page = doc.load_page(i - 1)
        raw = page.get_text("text")
        cleaned = clean_text(raw)
        if cleaned:
            pages_text.append(cleaned)
    return "\n".join(pages_text)


def condense_rules(raw_text: str) -> str:
    """Condense verbose handbook text into compact rule lists.
    Extracts patterns like 'X→Y', 'X（误Y）', numbered rules, etc.
    """
    lines = raw_text.split("\n")
    rules = []
    for line in lines:
        line = line.strip()
        if not line or len(line) < 2:
            continue
        # Remove page numbers and headers
        if re.match(r"^第[一二三四五六七八九十\d]+[章节]", line):
            continue
        if re.match(r"^\d{1,3}$", line):
            continue
        # Keep lines that look like rules: contain examples, corrections, patterns
        if any(kw in line for kw in [
            "应为", "不得", "禁止", "必须", "不能", "注意", "例",
            "→", "（", "）", "、", "正确", "错误", "误用", "混淆",
        ]):
            rules.append(line)
        elif len(line) > 10:  # Substantive content
            rules.append(line)
    return "\n".join(rules)


def main():
    print(f"[规则提取器] 打开 PDF: {HANDBOOK_PATH}")
    doc = fitz.open(HANDBOOK_PATH)
    total_pages = doc.page_count
    print(f"[规则提取器] 总页数: {total_pages}")

    sections = {}
    for chapter_name, (start, end) in CHAPTERS.items():
        print(f"[规则提取器] 提取章节: {chapter_name} (第{start}-{end}页) ...")
        raw_text = extract_region_pages(doc, start, end)
        merged_text = merge_cjk_paragraphs(raw_text)
        condensed = condense_rules(merged_text)
        sections[chapter_name] = condensed
        print(f"  提取字符数: {len(condensed)}")

    doc.close()

    # Build compact markdown output
    output = []
    output.append("# 图书校对规则")
    output.append("")
    output.append("你是专业图书校对员。逐句检查文本中的错误，以 JSON 格式返回。")
    output.append("")
    output.append("## 输出格式")
    output.append("```json")
    output.append('{"errors": [{"error_id": "#0001","original": "错误原文","correction": "正确写法","category": "错别字|标点错误|用语不规范|禁用词","reason": "修改依据"}]}')
    output.append("```")
    output.append("无错误返回 `{\"errors\": []}`。`[#NNNN]` 是位置标记，不校对。")
    output.append("")

    for chapter_name in CHAPTERS.keys():
        text = sections.get(chapter_name, "")
        output.append(f"## {chapter_name}")
        output.append("")
        output.append(text if text else "（该章节文本提取为空）")
        output.append("")

    output.append("## 校对原则")
    output.append("1. 只修改明确错误，不过度纠正")
    output.append("2. 形近字需结合上下文判断")
    output.append("3. `[#NNNN]` 是位置标识符，不修改")
    output.append("4. 每个 error_id 必须对应原文中实际存在的 `[#NNNN]` 标记")

    content = "\n".join(output)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"\n[规则提取器] 完成！输出: {OUTPUT_PATH}")
    print(f"[规则提取器] 字符数: {len(content)}, 行数: {content.count(chr(10)) + 1}")


if __name__ == "__main__":
    main()
