from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.config import get_settings
from app.models.task import Task
from app.models.model_config import ModelConfig
from app.services.task_executor import TaskExecutor
from datetime import datetime, timezone

router = APIRouter()


def _fmt_time(dt):
    if dt is None:
        return None
    return dt.isoformat() + "Z"


@router.get("/health")
def health_check():
    settings = get_settings()
    return {
        "success": True,
        "data": {
            "status": "ok",
            "version": "0.1.0",
            "database": "ok",
            "storage": "ok",
        },
        "message": "ok",
    }


@router.get("/dashboard/summary")
def dashboard_summary(db: Annotated[Session, Depends(get_db)] = None):
    TaskExecutor.mark_stale_tasks(db)
    total = db.query(func.count(Task.id)).filter(Task.deleted_at == None).scalar() or 0
    running = db.query(func.count(Task.id)).filter(Task.deleted_at == None, Task.status == "running").scalar() or 0
    succeeded = db.query(func.count(Task.id)).filter(Task.deleted_at == None, Task.status == "succeeded").scalar() or 0
    failed = db.query(func.count(Task.id)).filter(Task.deleted_at == None, Task.status == "failed").scalar() or 0

    recent = (
        db.query(Task)
        .filter(Task.deleted_at == None)
        .order_by(Task.updated_at.desc())
        .limit(8)
        .all()
    )
    recent_list = [
        {"id": t.id, "title": t.title, "type": t.type, "status": t.status,
         "model_name": t.model_name, "elapsed_ms": t.elapsed_ms,
         "updated_at": _fmt_time(t.updated_at)}
        for t in recent
    ]

    default_model = db.query(ModelConfig).filter(ModelConfig.is_default == True, ModelConfig.is_enabled == True).first()
    model_status = {
        "has_default_model": default_model is not None,
        "default_model_name": default_model.display_name or default_model.model_name if default_model else None,
        "last_test_status": default_model.last_test_status if default_model else None,
    }

    return {
        "success": True,
        "data": {
            "model_status": model_status,
            "recent_tasks": recent_list,
            "today_reports": [],
            "stats": {"task_count": total, "running_count": running, "succeeded_count": succeeded, "failed_count": failed},
        },
        "message": "ok",
    }
