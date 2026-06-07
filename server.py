"""PDF 校对助手 — FastAPI 后端"""
import asyncio
import json
import logging
import os
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask

from core.pdf_engine import PdfEngine
from core.text_annotator import TextAnnotator
from core.llm_client import LlmClient
from core.proofreader import Proofreader
from utils.config import UPLOAD_DIR, RULES_DIR, LANGUAGES_JSON, HOST, PORT, DEEPSEEK_BASE_URL, MODEL_NAME, DEEPSEEK_API_KEY

from core.language_profile import load_profiles, detect_language, hex_to_rgb

import re
import requests
from pydantic import BaseModel, Field


class ApiKeyCheck(BaseModel):
    api_key: str


app = FastAPI(title="PDF 校对助手")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory session store
sessions: dict[str, dict] = {}

MAX_UPLOAD_BYTES = int(os.getenv("DETYPO_MAX_UPLOAD_MB", "100")) * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024


def _session_working_path(file_id: str) -> str:
    return os.path.join(UPLOAD_DIR, f"{file_id}.pdf")


def _remove_file(path: str | None):
    if not path:
        return
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as exc:
        logging.warning(f"Failed to remove file {path}: {exc}")


def _cleanup_working_pdf(session: dict):
    _remove_file(session.get("path"))
    session["path"] = None


def _cleanup_session_files(file_id: str, extra_paths: list[str] | None = None):
    session = sessions.pop(file_id, None)
    if session:
        _remove_file(session.get("path"))
        _remove_file(session.get("orig_path"))
    for path in extra_paths or []:
        _remove_file(path)


def _ensure_working_pdf(file_id: str, session: dict) -> str:
    orig_path = session.get("orig_path")
    if not orig_path or not os.path.exists(orig_path):
        raise HTTPException(500, "原始 PDF 文件丢失")

    file_path = session.get("path") or _session_working_path(file_id)
    if not os.path.exists(file_path):
        shutil.copy2(orig_path, file_path)
    session["path"] = file_path
    return file_path


def _readable_pdf_path(session: dict) -> str | None:
    for key in ("path", "orig_path"):
        path = session.get(key)
        if path and os.path.exists(path):
            return path
    return None


# Language profiles — loaded once at startup
LANGUAGE_PROFILES: dict = load_profiles(RULES_DIR, LANGUAGES_JSON)


def _load_rules() -> str:
    """Legacy helper — returns Chinese rules content. Kept for minimal compat."""
    return LANGUAGE_PROFILES["zh"].rules_content


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    file_id = uuid.uuid4().hex[:12]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    orig_path = os.path.join(UPLOAD_DIR, f"{file_id}_orig.pdf")

    size = 0
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413,
                        f"PDF is too large; maximum upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                    )
                f.write(chunk)
        if size == 0:
            raise HTTPException(400, "Uploaded PDF is empty")

        shutil.copy2(file_path, orig_path)
        engine = PdfEngine(file_path)
    except HTTPException:
        for path in (file_path, orig_path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        raise
    except Exception as exc:
        for path in (file_path, orig_path):
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError:
                pass
        raise HTTPException(400, f"Unable to read PDF: {exc}") from exc

    page_count = engine.page_count

    # Extract text from all pages, count tokens with offline tokenizer
    page_texts = []
    try:
        for p in range(page_count):
            page_texts.append(engine.get_page_plain_text(p))
    finally:
        engine.close()

    from utils.token_counter import tokens_per_page, count_tokens
    page_token_counts = tokens_per_page(page_texts)
    total_text_tokens = sum(page_token_counts)

    detected_lang = detect_language(page_texts)

    # Count fixed per-batch overhead with the real tokenizer
    profile = LANGUAGE_PROFILES.get(detected_lang, LANGUAGE_PROFILES.get("zh"))
    overhead_template = (
        profile.context_prefix_prompt + "\n"
        + "---\n"
        + profile.proofread_instruction + "\n\n"
        + "---\n"
        + profile.context_suffix_prompt + "\n"
    )
    sys_tokens = count_tokens(profile.system_prompt)
    batch_overhead_tokens = count_tokens(overhead_template)

    # Count boundary sentence tokens per page (head = first N, tail = last N)
    # Used by frontend to compute exact context text tokens for any page range
    sep = profile.sentence_separators
    ctx_n = profile.context_sentences
    boundary_tokens = []
    for text in page_texts:
        if not text.strip():
            boundary_tokens.append({"head": 0, "tail": 0})
            continue
        esc = re.escape(sep)
        parts = re.split(f'(?<=[{esc}])', text)
        sentences = [p.strip() for p in parts if p.strip()]
        head = "".join(sentences[:ctx_n]) if sentences else ""
        tail = "".join(sentences[-ctx_n:]) if sentences else ""
        boundary_tokens.append({
            "head": count_tokens(head),
            "tail": count_tokens(tail),
        })

    overhead = {
        "sys": sys_tokens,
        "per_page": 300,   # ID markers per page (estimate — span count varies)
        "per_batch": batch_overhead_tokens,
        "boundary_tokens": boundary_tokens,  # [{head, tail}] per page
    }

    sessions[file_id] = {
        "path": file_path,
        "orig_path": orig_path,
        "page_count": page_count,
        "status": "ready",
        "errors": [],
        "proofreader": None,
        "engine": None,
        "detected_lang": detected_lang,
    }
    return {
        "file_id": file_id,
        "page_count": page_count,
        "filename": file.filename,
        "page_token_counts": page_token_counts,
        "total_text_tokens": total_text_tokens,
        "detected_lang": detected_lang,
        "languages": {code: p.name for code, p in LANGUAGE_PROFILES.items()},
        "overhead": overhead,
    }


@app.get("/api/pdf/{file_id}/page/{page_num}")
async def get_page_image(file_id: str, page_num: int):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")

    pdf_path = _readable_pdf_path(session)
    if not pdf_path:
        raise HTTPException(404, "PDF 文件不存在")

    engine = PdfEngine(pdf_path)
    try:
        if page_num < 0 or page_num >= engine.page_count:
            raise HTTPException(404, "页码超出范围")

        png_bytes = engine.render_page(page_num, scale=1.5)
    finally:
        engine.close()
    return Response(content=png_bytes, media_type="image/png")


@app.get("/api/pdf/{file_id}")
async def get_pdf_file(file_id: str):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    file_path = _readable_pdf_path(session)
    if not file_path:
        raise HTTPException(404, "PDF 文件不存在")
    return FileResponse(
        file_path,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "max-age=3600",
        },
    )


@app.get("/api/proofread/{file_id}")
async def proofread_stream(
    file_id: str, request: Request,
    token: str = None,
    start_page: int = Query(default=None, ge=1),
    end_page: int = Query(default=None, ge=1),
):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    if session.get("status") in ("running", "stopping"):
        raise HTTPException(400, "校对正在进行中")

    # Support both header and query param
    api_key = _get_api_key_from_request(request)
    if (not api_key or not api_key.startswith("sk-")) and token and token.startswith("sk-"):
        api_key = token
    if not api_key or not api_key.startswith("sk-"):
        raise HTTPException(400, "请先在设置中配置有效的 DeepSeek API Key")

    total_pages = session["page_count"]
    requested_start = start_page or 1
    requested_end = end_page or total_pages
    if requested_start > requested_end:
        raise HTTPException(400, "Start page must be less than or equal to end page")
    if requested_end > total_pages:
        raise HTTPException(400, f"End page exceeds PDF page count ({total_pages})")

    # Determine proofreading language
    lang = request.query_params.get("lang") or session.get("detected_lang", "zh")
    if lang not in LANGUAGE_PROFILES:
        lang = "zh"

    file_path = _ensure_working_pdf(file_id, session)
    engine = PdfEngine(file_path)
    annotator = TextAnnotator(engine)
    llm = LlmClient(api_key=api_key)
    profile = LANGUAGE_PROFILES[lang]
    session["proof_lang"] = lang  # store for export
    proofreader = Proofreader(engine, annotator, llm, profile)

    session["status"] = "running"
    session["engine"] = engine
    session["proofreader"] = proofreader

    import threading

    loop = asyncio.get_running_loop()

    async def event_stream():
        q = asyncio.Queue()
        terminal_event = None

        def run_proofreader():
            thread_terminal = None
            try:
                for event in proofreader.run(
                    start_page=requested_start,
                    end_page=requested_end,
                ):
                    thread_terminal = event.get("event")
                    asyncio.run_coroutine_threadsafe(q.put(event), loop)
            except Exception as e:
                thread_terminal = "error"
                asyncio.run_coroutine_threadsafe(
                    q.put({"event": "error", "data": {"message": str(e)}}), loop)
            finally:
                try:
                    engine.save()
                except Exception as e:
                    logging.warning(f"Failed to save PDF for session {file_id}: {e}")
                finally:
                    engine.close()
                    _cleanup_working_pdf(session)
                session["errors"] = proofreader.errors
                if thread_terminal == "stopped":
                    session["status"] = "stopped"
                elif thread_terminal in ("complete", None):
                    session["status"] = "done"
                else:
                    session["status"] = "error"
                session["engine"] = None
                session["proofreader"] = None
                asyncio.run_coroutine_threadsafe(q.put(None), loop)

        thread = threading.Thread(target=run_proofreader, daemon=True)
        thread.start()

        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=20)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                if event is None:
                    break
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'], ensure_ascii=False)}\n\n"
                if event["event"] in ("complete", "proofread_error", "error", "stopped"):
                    terminal_event = event["event"]
                    break
        finally:
            if terminal_event is None and thread.is_alive():
                proofreader.stop()
                session["status"] = "stopping"
                thread.join(timeout=1)
            else:
                thread.join(timeout=5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/proofread/{file_id}/stop")
async def stop_proofread(file_id: str):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    proofreader = session.get("proofreader")
    if proofreader:
        proofreader.stop()
    session["status"] = "stopped"
    return {"status": "stopped"}


@app.post("/api/session/{file_id}/cleanup")
async def cleanup_session(file_id: str):
    session = sessions.get(file_id)
    if not session:
        return {"status": "missing"}
    if session.get("status") in ("running", "stopping"):
        raise HTTPException(400, "校对正在进行中")
    _cleanup_session_files(file_id)
    return {"status": "cleaned"}


class ExportRequest(BaseModel):
    exclude_ids: list[str] = Field(default_factory=list)


@app.post("/api/export/{file_id}")
async def export_pdf(file_id: str, body: ExportRequest):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")

    exclude_set = set(body.exclude_ids)
    errors = session.get("errors", [])

    orig_path = session.get("orig_path")
    if not orig_path or not os.path.exists(orig_path):
        raise HTTPException(500, "原始 PDF 文件丢失")

    output_path = os.path.join(UPLOAD_DIR, f"{file_id}_export.pdf")

    engine = PdfEngine(orig_path)
    try:
        lang = session.get("proof_lang", session.get("detected_lang", "zh"))
        profile = LANGUAGE_PROFILES.get(lang, LANGUAGE_PROFILES["zh"])
        default_cat = list(profile.categories.keys())[0]
        default_hex = list(profile.categories.values())[0]
        for err in errors:
            if err.get("error_id") in exclude_set:
                continue
            category = (err.get("category") or "").strip() or default_cat
            hex_color = profile.categories.get(category, default_hex)
            try:
                color = hex_to_rgb(hex_color)
                bbox_values = err.get("bbox", [0, 0, 0, 0])
                if len(bbox_values) != 4:
                    continue
                bbox = tuple(float(v) for v in bbox_values)
                page_idx = int(err.get("page", 1)) - 1
            except (TypeError, ValueError):
                continue
            if page_idx < 0 or page_idx >= engine.page_count:
                continue
            reason = err.get("reason", "")
            correction_text = f"{err.get('original', '')} → {err.get('correction', '')}\n——————\n{reason}"
            original_text = err.get("original", "")
            engine.add_highlight(
                page_idx, bbox, color,
                note=correction_text,
                search_text=original_text,
                title=category,
            )
        engine.save_as(output_path)
    finally:
        engine.close()

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"proofread_{file_id}.pdf",
        background=BackgroundTask(_cleanup_session_files, file_id, [output_path]),
    )


@app.get("/api/session/{file_id}")
async def get_session(file_id: str):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    return {
        "status": session["status"],
        "page_count": session["page_count"],
        "errors": session.get("errors", []),
    }


KEY_FILE = Path(__file__).parent / ".detypo-key"


def _read_saved_api_key() -> str:
    try:
        if KEY_FILE.exists():
            key = KEY_FILE.read_text(encoding="utf-8").strip()
            if key.startswith("sk-"):
                return key
    except Exception:
        pass
    return ""


@app.get("/api/settings/key")
async def get_api_key():
    """Return the saved API key (from server-side file), so it survives port changes."""
    return {"api_key": _read_saved_api_key()}


@app.post("/api/settings/key")
async def check_api_key(body: ApiKeyCheck):
    key = body.api_key.strip()
    if not key.startswith("sk-"):
        return {"valid": False, "message": "API Key 格式错误：应以 'sk-' 开头"}
    try:
        resp = requests.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={
                "model": MODEL_NAME,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            # Save valid key server-side so it survives port/restart changes
            try:
                KEY_FILE.write_text(key, encoding="utf-8")
            except Exception:
                pass
            return {"valid": True, "message": "API Key 验证成功"}
        else:
            try:
                err_msg = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                err_msg = resp.text or f"HTTP {resp.status_code}"
            return {"valid": False, "message": err_msg}
    except requests.Timeout:
        return {"valid": False, "message": "连接超时，请检查网络"}
    except requests.ConnectionError:
        return {"valid": False, "message": "无法连接 DeepSeek API，请检查网络"}
    except requests.RequestException as e:
        return {"valid": False, "message": str(e)}


@app.post("/api/settings/balance")
async def get_balance(body: ApiKeyCheck):
    key = body.api_key.strip()
    if not key.startswith("sk-"):
        return {"balance": "0", "error": "API Key 格式错误"}
    try:
        resp = requests.get(
            "https://api.deepseek.com/user/balance",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            infos = data.get("balance_infos", [])
            if infos:
                return {"balance": infos[0].get("total_balance", "0")}
        return {"balance": "0", "error": resp.text[:200]}
    except Exception as e:
        return {"balance": "0", "error": str(e)}


@app.get("/api/languages")
async def get_languages():
    return {
        code: {
            "name": p.name,
            "categories": p.categories,
        }
        for code, p in LANGUAGE_PROFILES.items()
    }


def _get_api_key_from_request(request) -> str:
    """Extract API key from Authorization header or fall back to env var."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        key = auth[7:].strip()
        if key.startswith("sk-"):
            return key
    return _read_saved_api_key() or DEEPSEEK_API_KEY


def _safe_static_file(base: Path, requested_path: str) -> Path | None:
    """Return a file inside base, or None if the request escapes the directory."""
    try:
        base_resolved = base.resolve()
        candidate = (base / requested_path).resolve()
        if not candidate.is_file() or not candidate.is_relative_to(base_resolved):
            return None
        return candidate
    except (OSError, ValueError):
        return None


# Serve React build (production) or static (legacy)
frontend_dist = Path(__file__).parent / "frontend" / "dist"
static_dir = Path(__file__).parent / "static"

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Try React build first
    if frontend_dist.exists():
        file_path = _safe_static_file(frontend_dist, full_path)
        if file_path:
            return FileResponse(str(file_path))
        return HTMLResponse((frontend_dist / "index.html").read_text(encoding="utf-8"))
    # Fallback to legacy static
    if static_dir.exists() and full_path.startswith("static/"):
        file_path = _safe_static_file(static_dir, full_path[7:])
        if file_path:
            return FileResponse(str(file_path))
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Not found</h1>", status_code=404)


if __name__ == "__main__":
    import sys
    import socket
    import uvicorn, subprocess, platform

    def _port_available(host: str, port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((host, port))
                return True
        except OSError:
            return False

    def _find_available_port(host: str, start: int, count: int = 50) -> int | None:
        """Scan for an available port starting from `start`, up to `count` attempts."""
        for port in range(start, start + count):
            if _port_available(host, port):
                return port
        return None

    # ── Resolve port ──
    # Priority: --port CLI arg > DETYPO_PORT env var > PORT env var > auto-detect
    active_port = None
    cli_port = None

    # Parse --port from command line (simple, no argparse needed)
    for i, arg in enumerate(sys.argv[1:], start=1):
        if arg == "--port" and i < len(sys.argv) - 1:
            cli_port = int(sys.argv[i + 1])
            break
        if arg.startswith("--port="):
            cli_port = int(arg.split("=", 1)[1])
            break

    if cli_port is not None:
        # Explicit port requested — use it directly
        if _port_available(HOST, cli_port):
            active_port = cli_port
        else:
            # Port is taken — try to reclaim on Windows
            if platform.system() == "Windows":
                out = subprocess.check_output(["netstat", "-ano"], text=True)
                for line in out.splitlines():
                    if f"{HOST}:{cli_port}" in line and "LISTENING" in line:
                        pid = line.strip().split()[-1]
                        subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
                        print(f"[startup] Killed old process PID {pid} on port {cli_port}")
                        break
                import time
                time.sleep(0.5)
                if _port_available(HOST, cli_port):
                    active_port = cli_port
            if active_port is None:
                print(f"[startup] ERROR: Requested port {cli_port} is in use and could not be freed")
                exit(1)
    else:
        # Auto-detect: try configured PORT first, then scan upward
        active_port = _find_available_port(HOST, PORT)
        if active_port is None:
            print(f"[startup] ERROR: No available port in range {PORT}-{PORT + 50}")
            exit(1)
        if active_port != PORT:
            print(f"[startup] Port {PORT} unavailable, auto-selected port {active_port}")

    # ── Write port file for launcher scripts ──
    port_file = Path(__file__).parent / ".detypo-port"
    port_file.write_text(str(active_port))

    # ── Start server ──
    # Disable ANSI color codes in uvicorn logs (CMD terminal compatibility)
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["use_colors"] = False
    log_config["formatters"]["access"]["use_colors"] = False
    # Prod mode: single process (no reload worker that survives window close)
    use_reload = os.getenv("DETYPO_PROD", "0") != "1"
    reload_dirs = [str(Path(__file__).parent / d) for d in ("core", "utils", "rules")] + [str(Path(__file__))]
    print(f"[startup] Starting on {HOST}:{active_port}")
    uvicorn.run("server:app", host=HOST, port=active_port, reload=use_reload, log_config=log_config, reload_dirs=reload_dirs)
