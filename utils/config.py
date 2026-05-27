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
PORT = int(os.getenv("PORT", "8520"))
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")

# Proofreading rules
RULES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "rules"
)
LANGUAGES_JSON = os.path.join(RULES_DIR, "languages.json")


def get_batch_size(page_count: int) -> int:
    if page_count <= 50:
        return 1
    elif page_count <= 300:
        return 5
    elif page_count <= 800:
        return 3
    else:
        return 1
