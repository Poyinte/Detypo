"""应用全局配置"""
import os
from pathlib import Path

# 加载 .env 文件（优先级高于系统环境变量需放在 load_dotenv 调用前，
# 但这里我们让 .env 补充默认值，系统环境变量优先）
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)  # override=False: 系统环境变量优先
except ImportError:
    pass

# DeepSeek API
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL_NAME = "deepseek-v4-flash"
TEMPERATURE = 0.1
REQUEST_TIMEOUT = 300

# Server
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "3000"))
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

# Proofreading rules
RULES_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "rules", "proofreading-rules.md"
)

# Highlight colors (RGB 0–1 for PyMuPDF, hex for frontend)
CATEGORY_COLORS = {
    "用字错误": (0.83, 0.27, 0.27),
    "用词不当": (0.55, 0.41, 0.08),
    "语法错误": (0.18, 0.31, 0.08),
    "标点符号": (0.27, 0.55, 0.42),
    "数字用法": (0.55, 0.27, 0.55),
    "政治敏感": (0.83, 0.27, 0.38),
}

CATEGORY_HEX = {
    "用字错误": "#D44545",
    "用词不当": "#D4A86E",
    "语法错误": "#6E9ED4",
    "标点符号": "#45D46E",
    "数字用法": "#A86ED4",
    "政治敏感": "#D46E9E",
}

def get_batch_size(page_count: int) -> int:
    if page_count <= 50:
        return 1
    elif page_count <= 300:
        return 5
    elif page_count <= 800:
        return 3
    else:
        return 1
