import base64
import os
from cryptography.fernet import Fernet
from app.core.config import get_settings

_settings = get_settings()


def _get_fernet() -> Fernet:
    key = _settings.secret_key.encode("utf-8")
    key = base64.urlsafe_b64encode(key.ljust(32)[:32].encode("utf-8") if len(key) < 32 else key[:32])
    return Fernet(key)


def encrypt_api_key(plain: str) -> str:
    if not plain:
        return ""
    f = _get_fernet()
    return f.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted: str) -> str | None:
    if not encrypted:
        return None
    try:
        f = _get_fernet()
        return f.decrypt(encrypted.encode("utf-8")).decode("utf-8")
    except Exception:
        return None


def mask_api_key(key: str | None) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "****" + key[-4:]
