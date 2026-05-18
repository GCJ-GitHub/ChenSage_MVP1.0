import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "ChenSage_MVP1.0"

    api_host: str = "127.0.0.1"
    api_port: int = 8000

    database_url: str = f"sqlite:///{PROJECT_ROOT}/data/sqlite/chenshu_ai.db"

    upload_dir: str = str(PROJECT_ROOT / "data" / "uploads")
    export_dir: str = str(PROJECT_ROOT / "data" / "exports")
    log_dir: str = str(PROJECT_ROOT / "logs" / "api")

    secret_key: str = "change-me-in-production"
    enable_auth: bool = False

    default_model_provider: str = "openai_compatible"
    default_model_base_url: str = ""
    default_model_name: str = ""
    default_model_api_key: str = ""
    task_run_timeout_minutes: int = 30

    model_config = {
        "env_file": str(PROJECT_ROOT / ".env.local"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
