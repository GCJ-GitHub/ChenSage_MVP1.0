from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_serializer


class PromptTemplateCreate(BaseModel):
    task_type: str = Field(..., max_length=64)
    sub_type: str = Field(default="", max_length=128)
    name: str = Field(..., min_length=1, max_length=128)
    system_prompt: Optional[str] = None
    user_prompt_template: str = Field(..., min_length=1)
    description: Optional[str] = None
    is_default: bool = False
    is_active: bool = True


class PromptTemplateUpdate(BaseModel):
    task_type: Optional[str] = None
    sub_type: Optional[str] = None
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class PromptTemplateResponse(BaseModel):
    id: str
    task_type: str
    sub_type: str
    name: str
    version: str
    system_prompt: Optional[str] = None
    user_prompt_template: str
    description: Optional[str] = None
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None: return None
        return dt.isoformat() + "Z"
