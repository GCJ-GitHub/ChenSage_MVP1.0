from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_serializer


class ModelConfigCreate(BaseModel):
    provider: str = Field(..., min_length=1, max_length=64)
    base_url: str = Field(..., min_length=1, max_length=512)
    api_key: Optional[str] = None
    model_name: str = Field(..., min_length=1, max_length=128)
    display_name: Optional[str] = None
    is_default: bool = False
    is_enabled: bool = True
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1, le=131072)
    thinking_mode: str = Field(default="auto", pattern="^(auto|fast|deep)$")


class ModelConfigUpdate(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    display_name: Optional[str] = None
    is_default: Optional[bool] = None
    is_enabled: Optional[bool] = None
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    max_tokens: Optional[int] = Field(default=None, ge=1, le=131072)
    thinking_mode: Optional[str] = None


class ModelConfigResponse(BaseModel):
    id: str
    provider: str
    base_url: str
    model_name: str
    display_name: Optional[str] = None
    is_default: bool
    is_enabled: bool
    last_test_status: Optional[str] = None
    extra_params: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        return dt.isoformat() + "Z"


class ModelTestResult(BaseModel):
    status: str
    latency_ms: int
    message: str
