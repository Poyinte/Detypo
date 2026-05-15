"""校对编排器 — 串联 文本提取→ID注入→LLM校对→坐标反查→高亮标注 全流程"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from core.pdf_engine import PdfEngine
from core.text_annotator import TextAnnotator
from core.llm_client import LlmClient
from utils.config import CATEGORY_COLORS, get_batch_size


class Proofreader:
    def __init__(self, pdf_engine: PdfEngine, annotator: TextAnnotator,
                 llm_client: LlmClient, rules_content: str):
        self._engine = pdf_engine
        self._annotator = annotator
        self._llm = llm_client
        self._rules = rules_content
        self._stop_flag = False
        self._errors: list[dict] = []

    def run(self, start_page: int = 1, end_page: int = None):
        """Generator that yields SSE events: {event, data} dicts.
        Uses parallel LLM calls for speed — all batches dispatched concurrently."""
        total_pages = self._engine.page_count
        if end_page is None:
            end_page = total_pages
        start_page = max(1, min(start_page, total_pages))
        end_page = max(1, min(end_page, total_pages))
        page_count = end_page - start_page + 1
        batch_size = get_batch_size(page_count)
        self._errors = []
        self._stop_flag = False
        self._annotator.clear()

        # ── Phase 1: Extract all text upfront ──
        yield {
            "event": "extracting",
            "data": {"pages": page_count},
        }
        batches: list[tuple[str, range, list[int]]] = []  # (annotated_text, page_range, page_numbers)
        i = start_page - 1
        while i < end_page:
            if self._stop_flag:
                yield {"event": "stopped", "data": {"message": "校对已停止"}}
                return
            batch_end = min(i + batch_size, end_page)
            batch_range = range(i, batch_end)
            page_nums = list(range(i + 1, batch_end + 1))
            annotated_text, _ = self._annotator.annotate_pages(batch_range)
            if annotated_text.strip():
                batches.append((annotated_text, batch_range, page_nums))
            i = batch_end

        if not batches:
            yield {"event": "complete", "data": {"total_errors": 0, "errors": []}}
            return

        # ── Phase 2: Parallel LLM calls ──
        def process_batch(annotated_text: str, batch_range: range, page_nums: list[int]):
            llm_errors, usage = self._llm.proofread(annotated_text, self._rules)
            cache_hit = usage.get("prompt_cache_hit_tokens") or usage.get("prompt_tokens_details", {}).get("cached_tokens") or 0
            cache_miss = usage.get("prompt_cache_miss_tokens") or 0
            total = usage.get("total_tokens", 0)
            return {
                "llm_errors": llm_errors,
                "usage": usage,
                "tokens": total,
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "cache_hit": cache_hit,
                "cache_miss": cache_miss,
                "page_nums": page_nums,
                "batch_range": batch_range,
            }

        total_batches = len(batches)
        max_workers = min(len(batches), 4)

        yield {
            "event": "llm_waiting",
            "data": {"pages": f"{start_page}-{end_page}", "batches": total_batches},
        }

        results: list[dict] = []

        if total_batches <= 2 or max_workers <= 1:
            # Too few batches to benefit from caching + parallelism: run sequentially
            for idx, (text, br, pn) in enumerate(batches):
                if self._stop_flag:
                    yield {"event": "stopped", "data": {"message": "校对已停止"}}
                    return
                result = process_batch(text, br, pn)
                results.append(result)
                yield {
                    "event": "batch_done",
                    "data": {
                        "pages": pn,
                        "errors": [],
                        "current": idx + 1,
                        "total": total_batches,
                        "model": self._llm.model,
                        "tokens": result["tokens"],
                        "prompt_tokens": result["prompt_tokens"],
                        "completion_tokens": result["completion_tokens"],
                        "cache_hit": result["cache_hit"],
                        "cache_miss": result["cache_miss"],
                    },
                }
        else:
            # DeepSeek KV cache requires 2 requests to detect+persist common prefix.
            # First 2 batches run sequentially to warm the cache, rest run in parallel.
            warm = min(2, total_batches - 1)
            for i in range(warm):
                if self._stop_flag:
                    yield {"event": "stopped", "data": {"message": "校对已停止"}}
                    return
                text, br, pn = batches[i]
                result = process_batch(text, br, pn)
                results.append(result)
                # Yield real-time progress for warmup batches too
                yield {
                    "event": "batch_done",
                    "data": {
                        "pages": pn,
                        "errors": [],
                        "current": i + 1,
                        "total": total_batches,
                        "model": self._llm.model,
                        "tokens": result["tokens"],
                        "prompt_tokens": result["prompt_tokens"],
                        "completion_tokens": result["completion_tokens"],
                        "cache_hit": result["cache_hit"],
                        "cache_miss": result["cache_miss"],
                    },
                }

            if self._stop_flag:
                yield {"event": "stopped", "data": {"message": "校对已停止"}}
                return

            remaining = batches[warm:]
            if remaining:
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    futures = {
                        executor.submit(process_batch, text, br, pn): idx
                        for idx, (text, br, pn) in enumerate(remaining)
                    }
                    for future in as_completed(futures):
                        if self._stop_flag:
                            executor.shutdown(wait=False, cancel_futures=True)
                            yield {"event": "stopped", "data": {"message": "校对已停止"}}
                            return
                        result = future.result()
                        results.append(result)
                        # Yield real-time progress as each parallel batch completes
                        idx = len(results)
                        yield {
                            "event": "batch_done",
                            "data": {
                                "pages": result["page_nums"],
                                "errors": [],
                                "current": idx,
                                "total": total_batches,
                                "model": self._llm.model,
                                "tokens": result["tokens"],
                                "prompt_tokens": result["prompt_tokens"],
                                "completion_tokens": result["completion_tokens"],
                                "cache_hit": result["cache_hit"],
                                "cache_miss": result["cache_miss"],
                            },
                        }

        # Phase 2b: Process results sequentially (PDF mutations are not thread-safe)
        completed = 0
        for result in results:
            if self._stop_flag:
                yield {"event": "stopped", "data": {"message": "校对已停止"}}
                return

            completed += 1
            llm_errors = result["llm_errors"]
            page_nums = result["page_nums"]

            resolved = []
            for err in llm_errors:
                err_id = err.get("error_id", "").strip()
                info = self._annotator.lookup(err_id)
                if info is None:
                    continue
                category = err.get("category", "用字错误")
                color = CATEGORY_COLORS.get(category, CATEGORY_COLORS["用字错误"])
                bbox = info["bbox"]
                reason = err.get("reason", "")
                correction_text = f"{err.get('original', '')} → {err.get('correction', '')}\n——————\n{reason}"
                original_text = err.get("original", "")
                self._engine.add_highlight(
                    info["page"], bbox, color,
                    note=correction_text,
                    search_text=original_text,
                    title=category,
                )
                resolved.append({
                    "error_id": err_id,
                    "original": err.get("original", ""),
                    "correction": err.get("correction", ""),
                    "category": category,
                    "reason": err.get("reason", ""),
                    "page": info["page"] + 1,
                    "bbox": list(bbox),
                })

            self._errors.extend(resolved)
            self._engine.save()

            yield {
                "event": "page_done",
                "data": {
                    "pages": page_nums,
                    "errors": resolved,
                    "current": completed,
                    "total": total_batches,
                    "model": self._llm.model,
                    "tokens": result["tokens"],
                    "prompt_tokens": result["prompt_tokens"],
                    "completion_tokens": result["completion_tokens"],
                    "cache_hit": result["cache_hit"],
                    "cache_miss": result["cache_miss"],
                },
            }

        yield {
            "event": "complete",
            "data": {"total_errors": len(self._errors), "errors": self._errors},
        }

    def stop(self):
        self._stop_flag = True

    @property
    def errors(self) -> list[dict]:
        return self._errors
