from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_serializer


class FileUploadResponse(BaseModel):
    id: str
    original_name: str
    size_bytes: int
    parse_status: str


class FileResponse(BaseModel):
    id: str
    original_name: str
    mime_type: Optional[str] = None
    extension: Optional[str] = None
    size_bytes: int
    parse_status: str
    parsed_text: Optional[str] = None
    parse_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None:
            return None
        return dt.isoformat() + "Z"
