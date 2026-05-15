"""PDF 处理引擎 — PyMuPDF 封装 (Web 后端版)"""
import fitz


class PdfEngine:
    def __init__(self, path: str = None):
        self._doc = None
        self._path = None
        if path:
            self.load(path)

    def load(self, path: str):
        self._path = path
        self._doc = fitz.open(path)

    @property
    def page_count(self) -> int:
        return len(self._doc) if self._doc else 0

    @property
    def path(self) -> str:
        return self._path

    def render_page(self, page_num: int, scale: float = 1.5) -> bytes:
        """Render a page as PNG bytes for web delivery."""
        page = self._doc[page_num]
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes("png")

    def get_page_text_dict(self, page_num: int) -> dict:
        page = self._doc[page_num]
        return page.get_text("dict")

    def get_page_plain_text(self, page_num: int) -> str:
        page = self._doc[page_num]
        return page.get_text("text")

    def add_highlight(self, page_num: int, bbox: tuple, color_rgb: tuple,
                      note: str = None, search_text: str = None, title: str = "校对"):
        """Add flat-rectangle highlight(s) with optional popup note.

        Uses page.search_for() to find exact text quads, then creates
        Square annotations (flat rectangles, not rounded Highlight type).
        Fallback: single rect from approximate bbox."""
        page = self._doc[page_num]
        rects = []
        if search_text:
            try:
                x0, y0, x1, y1 = bbox
                margin = 10
                clip = fitz.Rect(x0 - margin, y0 - margin, x1 + margin, y1 + margin)
                hits = page.search_for(search_text, clip=clip, quads=True)
                if hits:
                    # Convert each quad to its bounding rect for flat rectangles
                    rects = [q.rect for q in hits]
            except Exception:
                pass
        if not rects:
            rects = [fitz.Rect(bbox)]

        for rect in rects:
            annot = page.add_rect_annot(rect)
            annot.set_colors(fill=color_rgb, stroke=color_rgb)
            annot.set_opacity(0.35)
            annot.set_border(width=0)
            if note:
                annot.set_info(info={"content": note, "title": title})
            annot.update()

    def save(self, output_path: str = None):
        save_path = output_path or self._path
        if save_path == self._path:
            self._doc.saveIncr()
        else:
            self._doc.save(save_path)

    def save_as(self, output_path: str):
        self._doc.save(output_path)

    def close(self):
        if self._doc:
            self._doc.close()
            self._doc = None

    def __del__(self):
        self.close()
