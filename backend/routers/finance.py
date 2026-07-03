from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any

from database import get_db
import models
import schemas

router = APIRouter()

@router.get("/{email}/state", response_model=schemas.DBStateResponse)
async def get_user_state(email: str, db: AsyncSession = Depends(get_db)):
    """Fetch all data for a given user email to hydrate the frontend."""
    # Find user by email
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user_id = user.id

    # Fetch all associated data
    accounts_res = await db.execute(select(models.Account).where(models.Account.user_id == user_id))
    transactions_res = await db.execute(select(models.Transaction).where(models.Transaction.user_id == user_id))
    recurring_res = await db.execute(select(models.RecurringTransaction).where(models.RecurringTransaction.user_id == user_id))
    goals_res = await db.execute(select(models.Goal).where(models.Goal.user_id == user_id))
    contracts_res = await db.execute(select(models.Contract).where(models.Contract.user_id == user_id))
    sacrifices_res = await db.execute(select(models.Sacrifice).where(models.Sacrifice.user_id == user_id))
    insights_res = await db.execute(select(models.Insight).where(models.Insight.user_id == user_id))

    # Construct DBStateResponse
    state = {
        "currentUserEmail": user.email,
        "users": [{
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "password": user.password,
            "monthly_income": user.monthly_income,
            "hours_per_week": user.hours_per_week,
            "target_savings_percentage": user.target_savings_percentage,
            "created_at": user.created_at.isoformat() if user.created_at else "",
        }],
        "accounts": accounts_res.scalars().all(),
        "transactions": transactions_res.scalars().all(),
        "recurring_transactions": recurring_res.scalars().all(),
        "goals": goals_res.scalars().all(),
        "contracts": contracts_res.scalars().all(),
        "sacrifices": sacrifices_res.scalars().all(),
        "insights": insights_res.scalars().all(),
    }

    return state

@router.patch("/{email}", response_model=dict)
async def update_user(email: str, payload: schemas.UserUpdate, db: AsyncSession = Depends(get_db)):
    """Update user preferences like target savings percentage."""
    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if payload.target_savings_percentage is not None:
        user.target_savings_percentage = payload.target_savings_percentage
    if payload.monthly_income is not None:
        user.monthly_income = payload.monthly_income
        
    await db.commit()
    return {"status": "success", "message": "User updated successfully"}
