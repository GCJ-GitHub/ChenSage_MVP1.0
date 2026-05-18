from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, field_serializer


class TaskCreate(BaseModel):
    type: str = Field(default="generic", max_length=64)
    title: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None
    model_config_id: Optional[str] = None
    input: dict = Field(default_factory=dict)
    file_ids: list[str] = Field(default_factory=list)
    output_format: str = "markdown"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    model_config_id: Optional[str] = None
    input: Optional[dict] = None
    output: Optional[str] = None
    output_format: Optional[str] = None


class TaskRunRequest(BaseModel):
    stream: bool = False
    force_rerun: bool = False


class TaskResponse(BaseModel):
    id: str
    type: str
    title: str
    description: Optional[str] = None
    status: str
    input: dict
    output: Optional[str] = None
    output_format: str
    error_message: Optional[str] = None
    model_config_id: Optional[str] = None
    model_name: Optional[str] = None
    elapsed_ms: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at", "started_at", "finished_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.isoformat() + "Z"
