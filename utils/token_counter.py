"""离线 token 计数器 — 使用 DeepSeek V3 tokenizer"""
from pathlib import Path
import math

_tokenizer = None


def _get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        from tokenizers import Tokenizer
        tokenizer_dir = Path(__file__).parent.parent / "tokenizer"
        _tokenizer = Tokenizer.from_file(str(tokenizer_dir / "tokenizer.json"))
    return _tokenizer


def count_tokens(text: str) -> int:
    """返回文本的 token 数量"""
    if not text:
        return 0
    tok = _get_tokenizer()
    return len(tok.encode(text).ids)


def tokens_per_page(page_texts: list[str]) -> list[int]:
    """返回每页的 token 数量列表"""
    return [count_tokens(t) for t in page_texts]
