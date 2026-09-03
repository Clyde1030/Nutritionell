"""
Pydantic schemas for the /api/auth router.
"""
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    # Length is validated in the router via auth_service.password_problem() so
    # signup and reset-password enforce one identical rule (including bcrypt's
    # 72-byte ceiling) instead of two that can drift.
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    # Temporary approval gate. The frontend keys its 'pending' state off these,
    # so they ride along on every auth response, not just /me.
    is_approved: bool = False
    is_admin: bool = False

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    profile_id: Optional[UUID] = None


class MeResponse(BaseModel):
    user: UserOut
    profile_id: Optional[UUID] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    # Intentionally constant. Answering differently for a known vs unknown
    # address would turn this endpoint into an account-existence oracle.
    message: str = (
        "If an account exists for that email, a password reset link has been sent."
    )


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str


class ResetPasswordResponse(BaseModel):
    message: str = "Your password has been reset. You can now sign in."
