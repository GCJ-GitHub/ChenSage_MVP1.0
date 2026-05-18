from datetime import datetime
from sqlalchemy import String, DateTime, Boolean, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, gen_uuid, utcnow, TimestampMixin


class ArxivDirection(Base, TimestampMixin):
    __tablename__ = "arxiv_directions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, default="default")
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    keywords: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    exclude_keywords: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    categories: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
