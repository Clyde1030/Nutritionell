"""
SQLAlchemy ORM models for Nutritionell accounts and user profiles.

`User` is the login identity (email + password). `UserProfile` is the dietary
profile, one per user. `PasswordResetToken` backs the forgot-password flow.
"""
import uuid as _uuid_module
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    """A login identity. One User has exactly one UserProfile."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(_uuid_module.uuid4()),
        server_default=func.gen_random_uuid(),
    )

    # Always stored lowercased so lookups are case-insensitive; the unique index
    # is what actually enforces "one account per address" (see the migration).
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)

    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # ── TEMPORARY admin-approval gate ────────────────────────────────────────
    # Signup stays open, but a new account can't reach the real features until
    # it is approved by hand. This is scaffolding for the current rebuild, not a
    # permanent access-tier system — see app/routers/admin.py for the removal
    # notes. Both default to false: a new account is pending, and nothing can
    # mint an admin except a manual UPDATE (deliberate, see the runbook).
    is_approved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    @property
    def has_access(self) -> bool:
        """Admins are always treated as approved.

        Keeps the manual bootstrap from being a footgun: setting is_admin alone
        on the first account is enough, without also remembering is_approved.
        """
        return bool(self.is_admin or self.is_approved)

    def __repr__(self) -> str:
        return (
            f"<User id={self.id} email={self.email!r} "
            f"approved={self.is_approved} admin={self.is_admin}>"
        )


class PasswordResetToken(Base):
    """A single-use, expiring password-reset token.

    Only the HASH of the token is stored — the raw value exists solely in the
    email we send, so a database read cannot be turned into a password reset.
    """

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(_uuid_module.uuid4()),
        server_default=func.gen_random_uuid(),
    )

    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # NULL = still unused. Set on a successful reset so the token cannot be replayed.
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<PasswordResetToken user_id={self.user_id} used={self.used_at is not None}>"


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(_uuid_module.uuid4()),
        server_default=func.gen_random_uuid(),
    )

    # Owner of this profile. Nullable at the column level ONLY so the pre-auth
    # orphaned rows survive the migration without a backfill — every code path
    # resolves a profile from the authenticated user, so a NULL user_id row is
    # unreachable through the API. New profiles are always created with an owner.
    user_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        unique=True,
        index=True,
    )

    name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    # Optional — used to tailor recommendations (e.g. iron, protein targets differ by sex)
    sex: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Optional — one of AGE_GROUP_OPTIONS keys (e.g. "18-29", "65+"); tailors
    # nutrient guidance (bone health, sodium sensitivity, growth needs, etc.)
    age_group: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

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
