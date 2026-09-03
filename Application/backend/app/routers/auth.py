"""
Account endpoints: signup, login, session restore, and password reset.

  POST /api/auth/signup
  POST /api/auth/login
  GET  /api/auth/me
  POST /api/auth/forgot-password
  POST /api/auth/reset-password

There is no logout endpoint: with a stateless bearer token and no refresh-token
state, logging out is deleting the token client-side. Nothing exists server-side
to revoke.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import PasswordResetToken, User, UserProfile
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MeResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignupRequest,
    UserOut,
)
from app.services import email_service
from app.services.auth_service import (
    create_access_token,
    get_current_user,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    password_problem,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    """Lowercase + strip. Stored this way so lookups are case-insensitive and the
    unique index actually prevents Bob@x.com and bob@x.com being two accounts."""
    return email.strip().lower()


async def _profile_id_for(db: AsyncSession, user: User) -> str | None:
    result = await db.execute(select(UserProfile.id).where(UserProfile.user_id == user.id))
    return result.scalar_one_or_none()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    problem = password_problem(body.password)
    if problem:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=problem)

    email = _normalize_email(body.email)

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    user = User(email=email, hashed_password=hash_password(body.password))
    db.add(user)
    # Flush (not commit) so the profile can reference user.id while both rows
    # still live in one transaction — a failure here leaves no half-made account.
    await db.flush()

    profile = UserProfile(user_id=user.id)
    db.add(profile)
    await db.commit()
    await db.refresh(user)
    await db.refresh(profile)

    # Best-effort: a new account is pending until Mel approves it, and this is
    # the only signal that someone is waiting. It must never be able to fail a
    # signup, so every failure is swallowed after logging — the account is
    # already committed by this point either way.
    try:
        email_service.send_new_signup_notification(user.email)
    except Exception as exc:  # noqa: BLE001 — notification is not part of the contract
        logger.error("Failed to send new-signup admin notification: %s", exc)

    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
        profile_id=profile.id,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    email = _normalize_email(body.email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    # One identical failure for "no such user" and "wrong password". Naming which
    # one was wrong would let anyone test whether an address has an account.
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return AuthResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
        profile_id=await _profile_id_for(db, user),
    )


@router.get("/me", response_model=MeResponse)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """What the frontend calls on load to turn a stored token back into a session."""
    return MeResponse(
        user=UserOut.model_validate(current_user),
        profile_id=await _profile_id_for(db, current_user),
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Always 200, whether or not the address has an account.

    Any observable difference — status, body, or a conspicuous timing gap — would
    make this an account-existence oracle.
    """
    email = _normalize_email(body.email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is not None:
        raw_token, token_hash = generate_reset_token()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc)
                + timedelta(minutes=settings.password_reset_token_expire_minutes),
            )
        )
        await db.commit()
        # Failure is logged inside the service and swallowed here on purpose:
        # an SES outage must not change this endpoint's response.
        email_service.send_password_reset_email(user.email, raw_token)

    return ForgotPasswordResponse()


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    problem = password_problem(body.new_password)
    if problem:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=problem)

    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_reset_token(body.token)
        )
    )
    reset = result.scalar_one_or_none()

    # One message for unknown / expired / already-used, so a caller can't probe
    # which tokens ever existed.
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This password reset link is invalid or has expired. Please request a new one.",
    )
    if reset is None or reset.used_at is not None:
        raise invalid

    # SQLite (tests) hands back naive datetimes; Postgres returns tz-aware ones.
    expires_at = reset.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise invalid

    user_result = await db.execute(select(User).where(User.id == reset.user_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise invalid

    user.hashed_password = hash_password(body.new_password)
    reset.used_at = datetime.now(timezone.utc)
    await db.commit()

    # Known limitation: access tokens are stateless, so any token issued before
    # this reset stays valid until it expires. Resetting a password does not sign
    # other devices out. Revoking would need token versioning or a denylist —
    # deferred with refresh-token rotation.
    return ResetPasswordResponse()
