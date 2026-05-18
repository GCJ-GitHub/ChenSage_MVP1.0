from datetime import datetime
from sqlalchemy import String, Text, DateTime, Boolean, JSON, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, gen_uuid, utcnow


class ArxivPaper(Base):
    __tablename__ = "arxiv_papers"
    __table_args__ = (UniqueConstraint("direction_id", "arxiv_id", name="unique_direction_arxiv"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    direction_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    arxiv_id: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    authors: Mapped[list | None] = mapped_column(JSON, nullable=True)
    abstract: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary_zh: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    abs_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at_arxiv: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    categories: Mapped[list | None] = mapped_column(JSON, nullable=True)
    relevance_score: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)
    recommendation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
