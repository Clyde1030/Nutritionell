"""
SQLAlchemy ORM model for a Nutritionell user profile.
"""
import uuid as _uuid_module
from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(_uuid_module.uuid4()),
        server_default=func.gen_random_uuid(),
    )

    name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # ── Health constraints ───────────────────────────────────────────────────
    allergies_and_conditions: Mapped[List[str]] = mapped_column(
        ARRAY(String(100)), nullable=False, default=list, server_default="{}"
    )

    # ── Goals ────────────────────────────────────────────────────────────────
    free_text_goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Dietary philosophy ───────────────────────────────────────────────────
    # "builtin:<name>" for standard philosophies, or "custom" for user-built
    dietary_philosophy: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # JSON-encoded philosophy customisations: {"stricter": [...], "lenient": [...], "extra": [...]}
    philosophy_customizations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Full text of a user-built custom philosophy
    custom_philosophy_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Ingredient avoidance ─────────────────────────────────────────────────
    # Specific ingredients to always avoid
    avoided_ingredients: Mapped[List[str]] = mapped_column(
        ARRAY(String(200)), nullable=False, default=list, server_default="{}"
    )

    # 0 = no restriction, 1 = minimal processing only, 2 = low, 3 = medium, 4 = highly processed OK
    processed_food_tolerance: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3, server_default="3"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<UserProfile id={self.id} name={self.name!r}>"
