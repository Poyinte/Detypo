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
        raw_key = (api_key or DEEPSEEK_API_KEY or "").strip()
        if raw_key.lower().startswith("bearer "):
            raw_key = raw_key[7:]
        self.api_key = raw_key.strip()
        self.model = model or MODEL_NAME
        self.temperature = temperature if temperature is not None else TEMPERATURE

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
    def _filter_false_positives(errors: list[dict], false_reasons: list[str]) -> list[dict]:
        """Filter out LLM responses that are false positives:
        - original == correction (no actual change)
        - reason indicates no error
        - original is too long (likely a whole paragraph with no real error)
        - empty original or correction
        """
        filtered = []
        for err in errors:
            original = err.get("original", "").strip()
            correction = err.get("correction", "").strip()
            reason = err.get("reason", "").strip()

            if not original or not correction:
                continue
            if original == correction:
                continue
            if any(kw in reason for kw in false_reasons):
                continue
            if len(original) > 200:
                continue
            filtered.append(err)
        return filtered

    def proofread(self, annotated_text: str, profile,
                  prefix_context: str = None, suffix_context: str = None
                  ) -> tuple[list[dict], dict]:
        self._ensure_key()

        # Build user message with optional bidirectional context
        parts = []

        if prefix_context:
            parts.append(profile.context_prefix_prompt + "\n" + prefix_context)
            parts.append("---")

        parts.append(profile.proofread_instruction + "\n\n" + annotated_text)

        if suffix_context:
            parts.append("---")
            parts.append(profile.context_suffix_prompt + "\n" + suffix_context)

        user_content = "\n".join(parts)

        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": 4096,
            "messages": [
                {"role": "system", "content": profile.system_prompt},
                {"role": "user", "content": user_content},
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
            except (requests.Timeout, requests.ConnectionError) as e:
                last_exc = e
                if attempt < 2:
                    wait = 2 ** attempt
                    _time.sleep(wait)
                    continue
                if isinstance(e, requests.Timeout):
                    raise LlmError(
                        f"DeepSeek API 请求超时（{REQUEST_TIMEOUT}秒），已重试 3 次。请尝试校对更短的文本段。"
                    )
                raise LlmError(
                    "无法连接 DeepSeek API，已重试 3 次。请检查网络连接和 API Key。",
                    "地址: " + DEEPSEEK_BASE_URL,
                )
            except requests.RequestException as e:
                last_exc = e
                if attempt < 2:
                    wait = 2 ** attempt
                    _time.sleep(wait)
                    continue
                raise LlmError(
                    "DeepSeek API 请求失败，已重试 3 次。请稍后重试。",
                    str(e),
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

        try:
            data = resp.json()
        except ValueError as exc:
            raise LlmError(
                "DeepSeek API 返回了无法解析的响应。",
                (resp.text or "")[:500],
            ) from exc
        usage = data.get("usage", {})
        choices = data.get("choices") or []
        if not choices:
            return [], usage
        content = choices[0].get("message", {}).get("content", "{}")

        try:
            errors = json.loads(content).get("errors", [])
            return self._filter_false_positives(errors, profile.false_reasons), usage
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
                return self._filter_false_positives(errors, profile.false_reasons), usage
            except json.JSONDecodeError:
                return [], usage
