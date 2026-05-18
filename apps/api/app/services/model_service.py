from app.core.security import encrypt_api_key, decrypt_api_key
from app.models.model_config import ModelConfig
from app.schemas.model import ModelTestResult
import time
import requests


class ModelService:

    @staticmethod
    def encrypt_key(plain: str) -> str:
        return encrypt_api_key(plain)

    @staticmethod
    def decrypt_key(encrypted: str) -> str | None:
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
            return {
                "status": "failed",
                "latency_ms": latency_ms,
                "message": f"服务返回 {resp.status_code}",
            }
        except requests.exceptions.Timeout:
            return {"status": "failed", "latency_ms": 0, "message": "连接超时"}
        except requests.exceptions.ConnectionError:
            return {"status": "failed", "latency_ms": 0, "message": "无法连接到 Base URL"}
        except Exception as e:
            return {"status": "failed", "latency_ms": 0, "message": str(e)}
