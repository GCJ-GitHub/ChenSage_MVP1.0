import sys
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.core.database import engine
from app.db.base import Base
from app.api.router import router as core_router
from app.api.models_api import router as models_router
from app.api.files_api import router as files_router
from app.api.tasks_api import router as tasks_router
from app.api.interview_api import router as interview_router
from app.api.content_api import router as content_router
from app.api.research_api import router as research_router
from app.api.arxiv_api import router as arxiv_router
from app.api.export_api import router as export_router
from app.api.prompts_api import router as prompts_router
from app.core.database import SessionLocal
from app.services.task_executor import TaskExecutor

settings = get_settings()

os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs(settings.export_dir, exist_ok=True)
os.makedirs(settings.log_dir, exist_ok=True)

Base.metadata.create_all(bind=engine)


def ensure_sqlite_schema_compatibility() -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if not inspector.has_table("arxiv_papers"):
        return

    columns = {column["name"] for column in inspector.get_columns("arxiv_papers")}
    if "batch_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE arxiv_papers ADD COLUMN batch_id VARCHAR(36)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_arxiv_papers_batch_id ON arxiv_papers (batch_id)"))

    if inspector.has_table("arxiv_daily_reports"):
        with engine.begin() as conn:
            table_sql = conn.execute(text(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='arxiv_daily_reports'"
            )).scalar() or ""
            if "unique_direction_report_date" in table_sql:
                conn.execute(text("DROP TABLE IF EXISTS arxiv_daily_reports_old"))
                conn.execute(text("ALTER TABLE arxiv_daily_reports RENAME TO arxiv_daily_reports_old"))
                conn.execute(text("""
                    CREATE TABLE arxiv_daily_reports (
                        id VARCHAR(36) NOT NULL,
                        direction_id VARCHAR(36) NOT NULL,
                        report_date DATE NOT NULL,
                        title VARCHAR(512) NOT NULL,
                        content TEXT NOT NULL,
                        paper_count INTEGER NOT NULL,
                        recommended_count INTEGER NOT NULL,
                        status VARCHAR(32) NOT NULL,
                        error_message TEXT,
                        created_at DATETIME NOT NULL,
                        PRIMARY KEY (id)
                    )
                """))
                conn.execute(text("""
                    INSERT INTO arxiv_daily_reports (
                        id, direction_id, report_date, title, content, paper_count,
                        recommended_count, status, error_message, created_at
                    )
                    SELECT
                        id, direction_id, report_date, title, content, paper_count,
                        recommended_count, status, error_message, created_at
                    FROM arxiv_daily_reports_old
                """))
                conn.execute(text("DROP TABLE arxiv_daily_reports_old"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_arxiv_daily_reports_direction_id ON arxiv_daily_reports (direction_id)"))


ensure_sqlite_schema_compatibility()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(core_router, prefix="/api/v1")
app.include_router(models_router, prefix="/api/v1")
app.include_router(files_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1")
app.include_router(interview_router, prefix="/api/v1")
app.include_router(content_router, prefix="/api/v1")
app.include_router(research_router, prefix="/api/v1")
app.include_router(arxiv_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
app.include_router(prompts_router, prefix="/api/v1")


@app.get("/")
def root():
    return {"app": settings.app_name, "version": "0.1.0", "docs": "/docs"}


@app.on_event("startup")
def cleanup_stale_tasks_on_startup():
    db = SessionLocal()
    try:
        TaskExecutor.mark_stale_tasks(db)
    finally:
        db.close()
