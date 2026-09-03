"""
Password hashing, JWT issuing/decoding, and the `get_current_user` dependency.

Session design (deliberate, documented simplification — see the login backend
prompt): a single long-lived bearer access token, returned in the response body
and sent as `Authorization: Bearer <token>`. No cookies, because app.* and api.*
are different subdomains and the mobile app has no cookie jar; no refresh-token
rotation, because that is a second moving part this pass does not need.

Consequence to harden later: the token is stateless, so nothing server-side can
revoke it. A token minted before a password reset stays valid until it expires.
Fixing that needs token versioning (a counter on the user, checked at decode) or
a denylist — deliberately deferred, not overlooked.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALGORITHM = "HS256"

# bcrypt silently truncates anything past 72 bytes, so a longer password would
# be accepted at signup and then "work" with only its first 72 bytes at login.
# Reject it loudly instead.
MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8


class ConfigurationError(RuntimeError):
    """Raised when the app is misconfigured in a way that is unsafe to run with."""


def require_jwt_secret() -> str:
    """Return the signing key, or refuse to operate.

    Called at startup (fail fast, before serving traffic) and again on every
    token operation, so a runtime reconfiguration can never downgrade to an
    unsigned or default-keyed token.
    """
    key = (settings.jwt_secret_key or "").strip()
    if not key:
        raise ConfigurationError(
            "JWT_SECRET_KEY is not set. Refusing to issue or accept tokens with an "
            "empty signing key — anyone could forge a session. Set it via the "
            "environment (locally) or Secrets Manager (deployed); see "
            "infra/AWS_SETUP_LOGIN_FEATURE.md."
        )
    return key


# ── Passwords ────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        # Malformed/unknown hash in the row — treat as a failed login, not a 500.
        logger.warning("Password verification failed against a malformed hash")
        return False


def password_problem(password: str) -> Optional[str]:
    """Return a human-readable reason the password is unusable, or None if it's fine."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters."
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        return f"Password must be at most {MAX_PASSWORD_BYTES} bytes."
    return None


# ── Access tokens ────────────────────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_access_token_expire_days)).timestamp()),
    }
    return jwt.encode(payload, require_jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    """Return the user id from a valid token, or None if it is invalid/expired."""
    try:
        payload = jwt.decode(token, require_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


# ── Password-reset tokens ────────────────────────────────────────────────────
# The raw token goes only into the email; the database stores its SHA-256. A
# read of password_reset_tokens therefore cannot be replayed into a reset.

def generate_reset_token() -> tuple[str, str]:
    """Return (raw_token, token_hash)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_reset_token(raw)


def hash_reset_token(raw_token: str) -> str:
    import hashlib

    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ── FastAPI dependency ───────────────────────────────────────────────────────

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

# Machine-readable so the frontend can tell "you're pending" apart from any other
# 403 and show the waiting notice instead of a raw error.
PENDING_APPROVAL_DETAIL = "pending_approval"


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the caller from `Authorization: Bearer <token>`.

    401 if the header is missing, malformed, expired, or names a user that no
    longer exists. Read the header directly rather than using OAuth2PasswordBearer
    so the OpenAPI docs don't advertise a password-grant flow this API doesn't have.
    """
    header = request.headers.get("Authorization") or ""
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _UNAUTHORIZED

    user_id = decode_access_token(token.strip())
    if not user_id:
        raise _UNAUTHORIZED

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise _UNAUTHORIZED
    return user


# ── Temporary admin-approval gate ────────────────────────────────────────────
# Everything below exists only while Mel is hand-approving accounts during the
# rebuild. It is deliberately confined to these two dependencies (plus
# app/routers/admin.py and the two `users` columns) so switching the gate off is
# deleting them and reverting the Depends() calls — not hunting scattered flags.

async def get_current_approved_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """A logged-in user who is also allowed to use the real features.

    403 (not 401) on purpose: the caller IS authenticated, so re-logging-in would
    not help. `is_admin` implies access regardless of `is_approved`, which keeps
    the manual first-admin bootstrap from needing two columns set correctly.
    """
    if not current_user.has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PENDING_APPROVAL_DETAIL,
        )
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Gate for /api/admin/*.

    Note this checks `is_admin` only, not `has_access` — an admin is always
    treated as approved, so there is nothing extra to require.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
