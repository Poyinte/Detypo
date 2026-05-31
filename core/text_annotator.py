"""文本 ID 注入器（方案 B）— 为 span 分配唯一 ID，维护 ID→坐标映射"""
import re

from core.pdf_engine import PdfEngine


class TextAnnotator:
    def __init__(self, pdf_engine: PdfEngine):
        self._engine = pdf_engine
        self._id_map: dict[str, dict] = {}
        self._counter = 0

    @staticmethod
    def _make_id(n: int) -> str:
        return f"#{n:04d}"

    @staticmethod
    def _split_span(text: str, bbox: tuple,
                    chars: list[dict] | None = None) -> list[tuple[str, tuple]]:
        """Split a span's text into micro-segments (~6 CJK chars each)
        and compute proportionally-split bboxes."""
        if not text.strip():
            return [(text, bbox)]

        char_bb: list[tuple[float, float, float, float]] | None = None
        if chars:
            char_bb = []
            for c in chars:
                cb = c["bbox"]
                char_bb.append((cb[0], cb[1], cb[2], cb[3]))

        x0, y0, x1, y1 = bbox
        total_w = x1 - x0

        # Split into CJK-aware chunks
        segments = []
        boundaries: list[tuple[int, int]] = []
        buf = ""
        cjk_count = 0
        buf_start = 0

        for i, ch in enumerate(text):
            if not buf:
                buf_start = i
            buf += ch
            if '一' <= ch <= '鿿' or '㐀' <= ch <= '䶿':
                cjk_count += 1
            if cjk_count >= 10 or ch in '，。、；：？！“”‘’…—）':
                if buf.strip():
                    segments.append(buf)
                    boundaries.append((buf_start, i))
                buf = ""
                cjk_count = 0

        if buf.strip():
            segments.append(buf)
            boundaries.append((buf_start, len(text) - 1))

        if len(segments) <= 1 or not char_bb:
            return [(text, bbox)]

        # Compute accurate segment bboxes from character bboxes
        result = []
        for seg, (start_i, end_i) in zip(segments, boundaries):
            if start_i < len(char_bb) and end_i < len(char_bb):
                cb0 = char_bb[start_i]
                cb1 = char_bb[end_i]
                seg_x0 = cb0[0]
                seg_y0 = cb0[1]
                seg_x1 = cb1[2]
                seg_y1 = max(cb0[3], cb1[3])
                result.append((seg, (seg_x0, seg_y0, seg_x1, seg_y1)))
            else:
                result.append((seg, bbox))

        return result

    # Characters that should attach to preceding text, not get their own ID
    _PUNCT_ONLY = re.compile('^[' + re.escape('，。、；：？！""''…—～」』）】〗·・…——') + ']+$')

    def _merge_punctuation(self, segments: list[tuple[str, tuple]]) -> list[tuple[str, tuple]]:
        """Merge punctuation-only segments into the preceding segment."""
        if len(segments) <= 1:
            return segments
        merged = []
        for i, (seg_text, seg_bbox) in enumerate(segments):
            if merged and self._PUNCT_ONLY.match(seg_text):
                # Merge into previous
                ptext, (px0, py0, px1, py1) = merged[-1]
                sx0, sy0, sx1, sy1 = seg_bbox
                merged[-1] = (ptext + seg_text,
                              (min(px0, sx0), min(py0, sy0),
                               max(px1, sx1), max(py1, sy1)))
            else:
                merged.append((seg_text, seg_bbox))
        return merged

    def annotate(self, page_num: int) -> tuple[str, dict]:
        text_dict = self._engine.get_page_text_dict(page_num)
        parts = []
        page_map = {}

        for bi, block in enumerate(text_dict.get("blocks", [])):
            if block.get("type") != 0:
                continue
            if bi > 0:
                parts.append("\n\n")
            lines = block.get("lines", [])
            for li, line in enumerate(lines):
                if li > 0:
                    parts.append("\n")
                # Collect all micro-spans in this line, then merge punctuation
                line_segments = []
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    bbox = tuple(span["bbox"])
                    chars = span.get("chars", None)
                    line_segments.extend(self._split_span(text, bbox, chars))

                for seg_text, seg_bbox in self._merge_punctuation(line_segments):
                    self._counter += 1
                    sid = self._make_id(self._counter)
                    page_map[sid] = {"page": page_num, "bbox": seg_bbox}
                    self._id_map[sid] = {"page": page_num, "bbox": seg_bbox}
                    parts.append(f"{seg_text}[{sid}]")

        return "".join(parts), page_map

    def annotate_pages(self, page_range: range) -> tuple[str, dict]:
        all_text = []
        all_map = {}
        for pn in page_range:
            text, pmap = self.annotate(pn)
            if text:
                all_text.append(text)
            all_map.update(pmap)
        return "".join(all_text), all_map

    def lookup(self, annot_id: str) -> dict | None:
        clean_id = annot_id.strip("[]").strip()
        if not clean_id.startswith("#"):
            clean_id = f"#{clean_id}"
        return self._id_map.get(clean_id)

    def clear(self):
        self._id_map.clear()
        self._counter = 0
