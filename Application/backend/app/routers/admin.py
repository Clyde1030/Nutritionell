"""
Admin endpoints for the TEMPORARY approval gate.

  GET  /api/admin/users/pending
  GET  /api/admin/users
  POST /api/admin/users/{user_id}/approve
  POST /api/admin/users/{user_id}/revoke
  POST /api/admin/users/{user_id}/make-admin
  POST /api/admin/users/{user_id}/remove-admin

Every route requires an admin token. They are driven from the Admin screen in the
web app (account menu → Admin, admins only) and are equally callable by hand —
see the "Admin approval (temporary)" section of Application/backend/README.md for
copy-pasteable curl.

REMOVAL NOTE: this whole file goes away when open signup is ready. Deleting it,
`get_current_approved_user` / `get_current_admin_user` in auth_service.py, and
the two `users` columns is the complete removal — nothing else depends on the
gate.
"""
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import get_current_admin_user

logger = logging.getLogger(__name__)

# The admin dependency is declared once at router level rather than repeated on
# each route, so a new route here cannot accidentally ship ungated.
router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin_user)],
)


class AdminUserOut(BaseModel):
    id: UUID
    email: str
    is_approved: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminActionResponse(BaseModel):
    user: AdminUserOut
    message: str


async def _get_user(db: AsyncSession, user_id: str) -> User:
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("/users/pending", response_model=List[AdminUserOut])
async def list_pending_users(db: AsyncSession = Depends(get_db)):
    """Accounts waiting on approval — the working queue.

    Oldest first, so whoever has been waiting longest is at the top.
    """
    result = await db.execute(
        select(User).where(User.is_approved.is_(False)).order_by(User.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/users", response_model=List[AdminUserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    """Every account and its status, for general visibility."""
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return list(result.scalars().all())


@router.post("/users/{user_id}/approve", response_model=AdminActionResponse)
async def approve_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    user = await _get_user(db, user_id)
    already = user.is_approved
    user.is_approved = True
    await db.commit()
    await db.refresh(user)

    logger.info("Admin approved user %s", user.id)
    return AdminActionResponse(
        user=AdminUserOut.model_validate(user),
        message=(
            f"{user.email} was already approved." if already
            else f"{user.email} is now approved."
        ),
    )


@router.post("/users/{user_id}/revoke", response_model=AdminActionResponse)
async def revoke_user(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Undo an approval. Note this does NOT revoke an admin's access: `is_admin`
    implies access on its own, so revoking an admin is a no-op until you also
    clear `is_admin` by hand — the message says so rather than failing silently.
    """
    user = await _get_user(db, user_id)
    already = not user.is_approved
    user.is_approved = False
    await db.commit()
    await db.refresh(user)

    logger.info("Admin revoked approval for user %s", user.id)
    if user.is_admin:
        message = (
            f"{user.email} is an admin, so they still have access. "
            "Use remove-admin as well to fully revoke."
        )
    elif already:
        message = f"{user.email} was already unapproved."
    else:
        message = f"{user.email}'s approval has been revoked."

    return AdminActionResponse(user=AdminUserOut.model_validate(user), message=message)


@router.post("/users/{user_id}/make-admin", response_model=AdminActionResponse)
async def make_admin(user_id: UUID, db: AsyncSession = Depends(get_db)):
    """Grant admin rights.

    Exists so promoting someone no longer needs a psql connection to RDS — the
    first admin still has to be made by hand (nothing reachable over the network
    can grant itself admin), but every one after that goes through here.

    Note this does not touch `is_approved`: it doesn't need to, because an admin
    is always treated as approved (see User.has_access).
    """
    user = await _get_user(db, user_id)
    already = user.is_admin
    user.is_admin = True
    await db.commit()
    await db.refresh(user)

    logger.info("Admin granted admin rights to user %s", user.id)
    return AdminActionResponse(
        user=AdminUserOut.model_validate(user),
        message=(
            f"{user.email} is already an admin." if already
            else f"{user.email} is now an admin."
        ),
    )


@router.post("/users/{user_id}/remove-admin", response_model=AdminActionResponse)
async def remove_admin(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin_user),
):
    """Revoke admin rights.

    `current_admin` is declared on this handler specifically: the router-level
    dependency gates every route but doesn't hand the resolved user to the
    handler, and this is the one route that needs to know who is calling.

    Mirroring revoke_user (which leaves `is_admin` alone), this leaves
    `is_approved` alone — so a former admin who was never separately approved
    loses access outright. The message says so rather than letting it be a
    surprise.
    """
    if str(user_id) == str(current_admin.id):
        # The difference between "undo a mis-promotion" and "the only admin
        # locks itself out". Removing your own rights has to go through another
        # admin, or the database.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "You can't remove your own admin rights here — ask another admin, "
                "or change it directly in the database."
            ),
        )

    user = await _get_user(db, user_id)
    already = not user.is_admin
    user.is_admin = False
    await db.commit()
    await db.refresh(user)

    logger.info("Admin removed admin rights from user %s", user.id)
    if already:
        message = f"{user.email} was not an admin."
    elif not user.is_approved:
        message = (
            f"{user.email} is no longer an admin. They also aren't approved, so "
            "they've lost access — approve them if that's not intended."
        )
    else:
        message = f"{user.email} is no longer an admin."

    return AdminActionResponse(user=AdminUserOut.model_validate(user), message=message)
