from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User
from schemas import UserPublic

router = APIRouter()


@router.get("/me/{user_id}", response_model=UserPublic)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve a user by their Firebase UID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserPublic.model_validate(user)


# ---------------------------------------------------------------------------
# Reserved routes for future AI features
# ---------------------------------------------------------------------------
# @router.get("/{user_id}/insights")  — AI-generated spending insights
# @router.get("/{user_id}/forecast")  — AI-powered balance forecast
# @router.post("/{user_id}/negotiate") — Server-side negotiation engine
