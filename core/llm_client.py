"""DeepSeek API 客户端"""
import json
import requests
from utils.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, MODEL_NAME, TEMPERATURE, REQUEST_TIMEOUT


class LlmError(Exception):
    def __init__(self, message: str, details: str = ""):
        super().__init__(message)
        self.details = details


class LlmClient:
    def __init__(self, model: str = None, temperature: float = None, api_key: str = None):
        raw_key = api_key or DEEPSEEK_API_KEY
        if raw_key.lower().startswith("bearer "):
            raw_key = raw_key[7:]
        self.api_key = raw_key.strip()
        self.model = model or MODEL_NAME
        self.temperature = temperature or TEMPERATURE

    def _ensure_key(self):
        if not self.api_key or not self.api_key.startswith("sk-"):
            raise ValueError(
                "DeepSeek API Key 应以 'sk-' 开头。请检查 DEEPSEEK_API_KEY 环境变量或在设置中配置。"
            )

    def check_connection(self) -> bool:
        try:
            self._ensure_key()
        except ValueError:
            return False
        try:
            resp = requests.post(
                f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
                timeout=10,
            )
            return resp.status_code == 200
        except requests.RequestException:
            return False

    @staticmethod
    def _filter_false_positives(errors: list[dict]) -> list[dict]:
        """Filter out LLM responses that are false positives:
        - original == correction (no actual change)
        - reason indicates no error
        - original is too long (likely a whole paragraph with no real error)
        - empty original or correction
        """
        FALSE_REASONS = ["无错误", "使用正确", "无误", "正确用法", "或使用正确", "没有错误"]
        filtered = []
        for err in errors:
            original = err.get("original", "").strip()
            correction = err.get("correction", "").strip()
            reason = err.get("reason", "").strip()

            if not original or not correction:
                continue
            if original == correction:
                continue
            if any(kw in reason for kw in FALSE_REASONS):
                continue
            if len(original) > 200:
                continue
            filtered.append(err)
        return filtered

    def proofread(self, annotated_text: str, rules_content: str) -> list[dict]:
        self._ensure_key()
        system_prompt = (
            "你是一名专业的图书校对员。请严格按照以下校对规则对用户提供的文本进行校对。\n\n"
            f"{rules_content}\n\n"
            "重要提示：\n"
            "1. 文本中的 [#NNNN] 是文本块位置标识符，不是正文内容，不要校对这些 ID。\n"
            "2. category 必须是以下值之一：用字错误、用词不当、语法错误、标点符号、数字用法、政治敏感\n"
            "3. 只返回确实有错误的条目。原文正确则不要编造条目。\n"
            "4. original 和 correction 必须不同，correction 必须是正确的修改建议。\n"
            "5. 每个 original 控制在 50 字以内，精确指向错误位置，不要整段返回。\n\n"
            "你必须严格输出如下 JSON 格式，不要包含任何其他内容：\n"
            '{"errors": [{"error_id": "#0001", "original": "错字", "correction": "正字", "category": "用字错误", "reason": "原因"}]}\n'
            '如果没有发现任何错误，请输出：{"errors": []}'
        )
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请校对以下文本：\n\n{annotated_text}"},
            ],
            "response_format": {"type": "json_object"},
        }
        import time as _time
        last_exc = None
        for attempt in range(3):
            try:
                resp = requests.post(
                    f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=REQUEST_TIMEOUT,
                )
                if resp.status_code == 429:
                    wait = 2 ** attempt
                    _time.sleep(wait)
                    continue
                break
            except requests.Timeout:
                raise LlmError(
                    f"DeepSeek API 请求超时（{REQUEST_TIMEOUT}秒）。请尝试校对更短的文本段。"
                )
            except requests.ConnectionError:
                raise LlmError(
                    "无法连接 DeepSeek API。请检查网络连接和 API Key。",
                    "地址: " + DEEPSEEK_BASE_URL,
                )
        else:
            raise LlmError(f"DeepSeek API 并发限制（HTTP 429），已重试 3 次均失败。请稍后重试。")

        if not resp.ok:
            try:
                err_data = resp.json()
                err_msg = err_data.get("error", {}).get("message", resp.text)
            except Exception:
                err_msg = resp.text or f"HTTP {resp.status_code}"
            raise LlmError(f"DeepSeek API 错误: {err_msg}")

        data = resp.json()
        usage = data.get("usage", {})
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")

        try:
            errors = json.loads(content).get("errors", [])
            return self._filter_false_positives(errors), usage
        except json.JSONDecodeError:
            text = content.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            try:
                errors = json.loads(text.strip()).get("errors", [])
                return self._filter_false_positives(errors), usage
            except json.JSONDecodeError:
                return [], usage
