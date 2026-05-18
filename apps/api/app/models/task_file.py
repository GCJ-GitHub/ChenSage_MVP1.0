from datetime import datetime
from sqlalchemy import String, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, gen_uuid, utcnow


class TaskFile(Base):
    __tablename__ = "task_files"
    __table_args__ = (UniqueConstraint("task_id", "file_id", "usage_type", name="unique_task_file_usage"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    task_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    file_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    usage_type: Mapped[str] = mapped_column(String(32), default="context", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
