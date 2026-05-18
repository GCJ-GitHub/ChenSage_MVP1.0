from datetime import datetime
from sqlalchemy import String, Text, Date, Integer, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, gen_uuid, utcnow


class ArxivDailyReport(Base):
    __tablename__ = "arxiv_daily_reports"
    __table_args__ = (UniqueConstraint("direction_id", "report_date", name="unique_direction_report_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    direction_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    report_date: Mapped[str] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    paper_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recommended_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="generated", nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
