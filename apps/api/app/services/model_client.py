import time
import requests
from typing import Generator
from app.core.security import encrypt_api_key, decrypt_api_key
from app.models.model_config import ModelConfig


class ModelClient:

    def encrypt_key(self, plain: str) -> str:
        return encrypt_api_key(plain)

    def decrypt_key(self, encrypted: str) -> str | None:
        return decrypt_api_key(encrypted)

    def test_connection(self, config: ModelConfig) -> dict:
        api_key = self.decrypt_key(config.api_key_encrypted) if config.api_key_encrypted else ""
        url = config.base_url.rstrip("/")
        start = time.monotonic()
        try:
            resp = requests.get(
                f"{url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=15,
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            if resp.status_code in (200, 401):
                return {
                    "status": "success" if resp.status_code == 200 else "warning",
                    "latency_ms": latency_ms,
                    "message": "连接成功" if resp.status_code == 200 else "连接成功但鉴权未验证",
                }
            return {"status": "failed", "latency_ms": latency_ms, "message": f"服务返回 {resp.status_code}"}
        except requests.exceptions.Timeout:
            return {"status": "failed", "latency_ms": 0, "message": "连接超时"}
        except requests.exceptions.ConnectionError:
            return {"status": "failed", "latency_ms": 0, "message": "无法连接到 Base URL"}
        except Exception as e:
            return {"status": "failed", "latency_ms": 0, "message": str(e)}

    def generate(self, config: ModelConfig, messages: list[dict], **kwargs) -> dict:
        api_key = self.decrypt_key(config.api_key_encrypted)
        if not api_key:
            raise ValueError("API Key 未配置")

        url = f"{config.base_url.rstrip('/')}/chat/completions"

        params = self._build_params(config, **kwargs)
        body = {
            "model": config.model_name,
            "messages": messages,
            "stream": False,
            **params,
        }

        start = time.monotonic()
        try:
            resp = requests.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=body,
                timeout=600,  # arXiv 长报告可能需要较长时间
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            if resp.status_code != 200:
                return {
                    "success": False,
                    "content": "",
                    "error": resp.text[:500],
                    "usage": {},
                    "latency_ms": latency_ms,
                }
            data = resp.json()
            return {
                "success": True,
                "content": data["choices"][0]["message"]["content"],
                "usage": data.get("usage", {}),
                "latency_ms": latency_ms,
            }
        except Exception as e:
            return {
                "success": False,
                "content": "",
                "error": str(e)[:500],
                "usage": {},
                "latency_ms": 0,
            }

    def stream(self, config: ModelConfig, messages: list[dict], **kwargs) -> Generator[str, None, dict]:
        api_key = self.decrypt_key(config.api_key_encrypted)
        if not api_key:
            raise ValueError("API Key 未配置")

        url = f"{config.base_url.rstrip('/')}/chat/completions"
        params = self._build_params(config, **kwargs)
        body = {
            "model": config.model_name,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            **params,
        }

        usage = {}
        full_text = ""
        start = time.monotonic()

        import json

        try:
            resp = requests.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=body,
                stream=True,
                timeout=600,  # arXiv 长报告可能需要较长时间
            )
            if resp.status_code != 200:
                yield f"ERROR: HTTP {resp.status_code} - {resp.text[:300]}"
                return {"success": False, "content": "", "usage": {}, "latency_ms": 0}

            for line in resp.iter_lines(decode_unicode=True):
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    import json
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            full_text += content
                            yield content
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                    except json.JSONDecodeError:
                        continue

            latency_ms = int((time.monotonic() - start) * 1000)
            yield {"success": True, "content": full_text, "usage": usage, "latency_ms": latency_ms}
            return {"success": True, "content": full_text, "usage": usage, "latency_ms": latency_ms}

        except Exception as e:
            yield f"ERROR: {str(e)[:300]}"
            return {"success": False, "content": full_text, "error": str(e), "usage": {}, "latency_ms": 0}

    def _build_params(self, config: ModelConfig, **override) -> dict:
        extra = config.extra_params or {}
        temperature = override.get("temperature", extra.get("temperature", 0.7))
        max_tokens = override.get("max_tokens", extra.get("max_tokens", 4096))
        thinking_mode = override.get("thinking_mode", extra.get("thinking_mode", "auto"))

        params = {"temperature": temperature, "max_tokens": max_tokens}

        if thinking_mode == "fast":
            params["temperature"] = 0.3
            params["top_p"] = 0.8
        elif thinking_mode == "deep":
            params["temperature"] = 0.9
            params["top_p"] = 0.95

        top_p = override.get("top_p", extra.get("top_p"))
        if top_p is not None:
            params["top_p"] = top_p

        return params
