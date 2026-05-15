"""PDF 校对助手 — FastAPI 后端"""
import asyncio
import json
import os
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Request
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from core.pdf_engine import PdfEngine
from core.text_annotator import TextAnnotator
from core.llm_client import LlmClient
from core.proofreader import Proofreader
from utils.config import UPLOAD_DIR, RULES_FILE, CATEGORY_COLORS, CATEGORY_HEX, HOST, PORT, DEEPSEEK_BASE_URL, MODEL_NAME, DEEPSEEK_API_KEY

import requests
from pydantic import BaseModel


class ApiKeyCheck(BaseModel):
    api_key: str


app = FastAPI(title="PDF 校对助手")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory session store
sessions: dict[str, dict] = {}


def _load_rules() -> str:
    with open(RULES_FILE, "r", encoding="utf-8") as f:
        return f.read()


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    file_id = uuid.uuid4().hex[:12]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.pdf")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    orig_path = os.path.join(UPLOAD_DIR, f"{file_id}_orig.pdf")
    shutil.copy2(file_path, orig_path)

    engine = PdfEngine(file_path)
    page_count = engine.page_count

    # Extract text from all pages, count tokens with offline tokenizer
    from utils.token_counter import tokens_per_page
    page_texts = []
    for p in range(page_count):
        page_texts.append(engine.get_page_plain_text(p))
    engine.close()

    sessions[file_id] = {
        "path": file_path,
        "orig_path": orig_path,
        "page_count": page_count,
        "status": "ready",
        "errors": [],
        "proofreader": None,
        "engine": None,
    }
    from utils.token_counter import tokens_per_page
    page_token_counts = tokens_per_page(page_texts)
    total_text_tokens = sum(page_token_counts)
    return {
        "file_id": file_id,
        "page_count": page_count,
        "filename": file.filename,
        "page_token_counts": page_token_counts,
        "total_text_tokens": total_text_tokens,
    }


@app.get("/api/pdf/{file_id}/page/{page_num}")
async def get_page_image(file_id: str, page_num: int):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")

    engine = PdfEngine(session["path"])
    if page_num < 0 or page_num >= engine.page_count:
        engine.close()
        raise HTTPException(404, "页码超出范围")

    png_bytes = engine.render_page(page_num, scale=1.5)
    engine.close()
    return Response(content=png_bytes, media_type="image/png")


@app.get("/api/pdf/{file_id}")
async def get_pdf_file(file_id: str):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    file_path = session["path"]
    if not os.path.exists(file_path):
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
    start_page: int = None,
    end_page: int = None,
):
    session = sessions.get(file_id)
    if not session:
        raise HTTPException(404, "文件不存在")
    if session.get("status") == "running":
        raise HTTPException(400, "校对正在进行中")

    session["status"] = "running"
    engine = PdfEngine(session["path"])
    annotator = TextAnnotator(engine)
    # Support both header and query param
    api_key = _get_api_key_from_request(request)
    if (not api_key or not api_key.startswith("sk-")) and token and token.startswith("sk-"):
        api_key = token
    if not api_key or not api_key.startswith("sk-"):
        engine.close()
        raise HTTPException(400, "请先在设置中配置有效的 DeepSeek API Key")
    llm = LlmClient(api_key=api_key)
    rules = _load_rules()
    proofreader = Proofreader(engine, annotator, llm, rules)

    session["engine"] = engine
    session["proofreader"] = proofreader

    import threading

    loop = asyncio.get_running_loop()

    async def event_stream():
        q = asyncio.Queue()

        def run_proofreader():
            try:
                for event in proofreader.run(
                    start_page=start_page or 1,
                    end_page=end_page or engine.page_count,
                ):
                    asyncio.run_coroutine_threadsafe(q.put(event), loop)
                asyncio.run_coroutine_threadsafe(q.put(None), loop)
            except Exception as e:
                asyncio.run_coroutine_threadsafe(
                    q.put({"event": "error", "data": {"message": str(e)}}), loop)

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
                if event["event"] in ("complete", "proofread_error", "stopped"):
                    break
        finally:
            try:
                engine.save()
            except Exception:
                pass
            session["status"] = "done"
            session["errors"] = proofreader.errors
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


class ExportRequest(BaseModel):
    exclude_ids: list[str] = []


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
    for err in errors:
        if err.get("error_id") in exclude_set:
            continue
        category = err.get("category", "用字错误")
        color = CATEGORY_COLORS.get(category, CATEGORY_COLORS["用字错误"])
        bbox = tuple(err.get("bbox", [0, 0, 0, 0]))
        page_idx = err.get("page", 1) - 1
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
    engine.close()

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename=f"proofread_{file_id}.pdf",
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
            # Response: {"is_available": true, "balance_infos": [{"currency": "CNY", "total_balance": "...", "topped_up_balance": "...", "granted_balance": "..."}]}
            infos = data.get("balance_infos", [])
            if infos:
                total = infos[0].get("total_balance", "0")
                return {"balance": total}
        return {"balance": "0", "error": resp.text[:200]}
    except Exception as e:
        return {"balance": "0", "error": str(e)}


def _get_api_key_from_request(request) -> str:
    """Extract API key from Authorization header or fall back to env var."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        key = auth[7:].strip()
        if key.startswith("sk-"):
            return key
    return DEEPSEEK_API_KEY


# Serve React build (production) or static (legacy)
frontend_dist = Path(__file__).parent / "frontend" / "dist"
static_dir = Path(__file__).parent / "static"

if frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Try React build first
    if frontend_dist.exists():
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return HTMLResponse((frontend_dist / "index.html").read_text(encoding="utf-8"))
    # Fallback to legacy static
    if static_dir.exists() and full_path.startswith("static/"):
        file_path = static_dir / full_path[7:]
        if file_path.is_file():
            return FileResponse(str(file_path))
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(index_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Not found</h1>", status_code=404)


if __name__ == "__main__":
    import uvicorn, subprocess, platform
    if platform.system() == "Windows":
        out = subprocess.check_output(["netstat", "-ano"], text=True)
        for line in out.splitlines():
            if f"{HOST}:{PORT}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True)
                print(f"[startup] Killed old process PID {pid} on port {PORT}")
                break
    # Disable ANSI color codes in uvicorn logs (CMD terminal compatibility)
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["use_colors"] = False
    log_config["formatters"]["access"]["use_colors"] = False
    # Prod mode: single process (no reload worker that survives window close)
    use_reload = os.getenv("DETYPO_PROD", "0") != "1"
    uvicorn.run("server:app", host=HOST, port=PORT, reload=use_reload, log_config=log_config, reload_dirs=[str(Path(__file__).parent)])
