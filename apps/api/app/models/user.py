from sqlalchemy import Column, String, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, gen_uuid, utcnow, TimestampMixin, SoftDeleteMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    auth_type: Mapped[str] = mapped_column(String(32), default="local", nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
