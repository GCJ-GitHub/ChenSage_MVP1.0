from datetime import date, datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, field_serializer


class ArxivDirectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    keywords: list[str] = Field(default_factory=list)
    exclude_keywords: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    is_enabled: bool = True


class ArxivDirectionUpdate(BaseModel):
    name: Optional[str] = None
    keywords: Optional[list[str]] = None
    exclude_keywords: Optional[list[str]] = None
    categories: Optional[list[str]] = None
    is_enabled: Optional[bool] = None


class ArxivDirectionResponse(BaseModel):
    id: str
    name: str
    keywords: list
    exclude_keywords: Optional[list] = None
    categories: Optional[list] = None
    is_enabled: bool
    last_run_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at", "updated_at", "last_run_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None: return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.isoformat() + "Z"


class DailyReportRequest(BaseModel):
    report_date: Optional[str] = None
    max_papers: int = Field(default=20, ge=1, le=50)
    model_config_id: Optional[str] = None
    template_id: Optional[str] = None


class ArxivPaperBrief(BaseModel):
    id: str
    arxiv_id: str
    title: str
    authors: Optional[list] = None
    abstract: Optional[str] = None
    summary_zh: Optional[str] = None
    abs_url: Optional[str] = None
    pdf_url: Optional[str] = None
    published_at: Optional[datetime] = None
    categories: Optional[list] = None
    relevance_score: Optional[float] = None
    recommendation_reason: Optional[str] = None
    is_starred: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("published_at", "created_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None: return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.isoformat() + "Z"


class ArxivReportResponse(BaseModel):
    id: str
    report_date: date
    title: str
    content: str
    paper_count: int
    recommended_count: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_serializer("created_at")
    def serialize_dt(self, dt: datetime | None) -> str | None:
        if dt is None: return None
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt.isoformat() + "Z"

    @field_serializer("report_date")
    def serialize_date(self, dt: date | None) -> str | None:
        if dt is None: return None
        return dt.isoformat()
