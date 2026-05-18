from datetime import datetime
from pydantic import BaseModel


class ResponseBase(BaseModel):
    success: bool = True
    message: str = "ok"


class DataResponse(ResponseBase):
    data: dict | list | None = None


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict | None = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


class PaginatedData(BaseModel):
    items: list
    page: int
    page_size: int
    total: int
    has_next: bool


class HealthStatus(BaseModel):
    status: str
    version: str = "0.1.0"
    database: str = "ok"
    storage: str = "ok"


class DashboardSummary(BaseModel):
    model_status: dict
    recent_tasks: list
    today_reports: list
    stats: dict
