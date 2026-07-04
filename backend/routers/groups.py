"""
Groups & Bill Splitting router.
All endpoints require a valid JWT.
"""
from decimal import Decimal
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from database import get_db
from dependencies import get_current_user
import models
import schemas

router = APIRouter()


@router.post("/", response_model=schemas.GroupBase)
async def create_group(
    group: schemas.GroupBase,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_group = models.Group(
        id=group.id,
        user_id=current_user.id,   # FIXED: always use the authenticated user's ID
        name=group.name,
    )
    db.add(db_group)
    await db.commit()
    await db.refresh(db_group)
    return db_group


@router.post("/{group_id}/members", response_model=schemas.GroupMemberBase)
async def add_member(
    group_id: str,
    member: schemas.GroupMemberBase,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify the group belongs to the current user
    res = await db.execute(
        select(models.Group).where(
            models.Group.id == group_id,
            models.Group.user_id == current_user.id,
        )
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not your group.")

    db_member = models.GroupMember(
        id=member.id,
        group_id=group_id,
        name=member.name,
        user_id=member.user_id,
    )
    db.add(db_member)
    await db.commit()
    await db.refresh(db_member)
    return db_member


@router.post("/{group_id}/expenses", response_model=schemas.GroupExpenseBase)
async def add_expense(
    group_id: str,
    expense: schemas.GroupExpenseBase,
    splits: List[schemas.ExpenseSplitBase],
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify group ownership or membership
    grp_res = await db.execute(select(models.Group).where(models.Group.id == group_id))
    grp = grp_res.scalar_one_or_none()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found.")
        
    is_owner = grp.user_id == current_user.id
    
    member_res = await db.execute(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id
        )
    )
    is_member = member_res.scalar_one_or_none() is not None
    
    if not (is_owner or is_member):
        raise HTTPException(status_code=403, detail="Not your group.")

    from datetime import date as date_type
    db_expense = models.GroupExpense(
        id=expense.id,
        group_id=group_id,
        description=expense.description,
        amount=expense.amount,
        paid_by=expense.paid_by,
        date=date_type.fromisoformat(str(expense.date)) if expense.date else date_type.today(),
    )
    db.add(db_expense)

    for split in splits:
        db.add(models.ExpenseSplit(
            id=split.id,
            expense_id=split.expense_id,
            member_id=split.member_id,
            amount_owed=split.amount_owed,
        ))

    await db.commit()   # FIXED: single commit before recalculating

    await calculate_settlements(group_id, db)
    return expense


async def calculate_settlements(group_id: str, db: AsyncSession):
    """
    Greedy netting algorithm — minimises number of transactions.
    FIXED: uses Decimal arithmetic throughout to avoid float drift.
    """
    # Lock the group to serialize settlement calculations
    await db.execute(
        select(models.Group).where(models.Group.id == group_id).with_for_update()
    )

    expenses_res = await db.execute(
        select(models.GroupExpense).where(models.GroupExpense.group_id == group_id)
    )
    expenses = expenses_res.scalars().all()
    if not expenses:
        return

    expense_ids = [e.id for e in expenses]
    splits_res = await db.execute(
        select(models.ExpenseSplit).where(models.ExpenseSplit.expense_id.in_(expense_ids))
    )
    splits = splits_res.scalars().all()

    # Use Decimal for all balance arithmetic
    balances: dict[str, Decimal] = {}
    for exp in expenses:
        balances[exp.paid_by] = balances.get(exp.paid_by, Decimal("0")) + Decimal(str(exp.amount))
    for split in splits:
        balances[split.member_id] = balances.get(split.member_id, Decimal("0")) - Decimal(str(split.amount_owed))

    # Delete existing pending settlements
    pending_res = await db.execute(
        select(models.Settlement).where(
            models.Settlement.group_id == group_id,
            models.Settlement.status == "pending",
        )
    )
    for s in pending_res.scalars().all():
        await db.delete(s)

    # Adjust for already-completed settlements
    completed_res = await db.execute(
        select(models.Settlement).where(
            models.Settlement.group_id == group_id,
            models.Settlement.status == "completed",
        )
    )
    for s in completed_res.scalars().all():
        balances[s.paid_by] = balances.get(s.paid_by, Decimal("0")) + Decimal(str(s.amount))
        balances[s.paid_to] = balances.get(s.paid_to, Decimal("0")) - Decimal(str(s.amount))

    THRESHOLD = Decimal("0.01")
    debtors = [[mid, -bal] for mid, bal in balances.items() if bal < -THRESHOLD]
    creditors = [[mid, bal] for mid, bal in balances.items() if bal > THRESHOLD]
    debtors.sort(key=lambda x: x[1], reverse=True)
    creditors.sort(key=lambda x: x[1], reverse=True)

    i = j = 0
    while i < len(debtors) and j < len(creditors):
        debtor_id, debt = debtors[i]
        creditor_id, credit = creditors[j]
        amount = min(debt, credit)

        if amount > THRESHOLD:
            db.add(models.Settlement(
                id=str(uuid.uuid4()),
                group_id=group_id,
                paid_by=debtor_id,
                paid_to=creditor_id,
                amount=float(amount),
                status="pending",
            ))

        debtors[i][1] -= amount
        creditors[j][1] -= amount
        if debtors[i][1] <= THRESHOLD:
            i += 1
        if creditors[j][1] <= THRESHOLD:
            j += 1

    await db.commit()


@router.post("/{group_id}/settlements/{settlement_id}/pay", response_model=dict)
async def pay_settlement(
    group_id: str,
    settlement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify group ownership or membership
    grp_res = await db.execute(select(models.Group).where(models.Group.id == group_id))
    grp = grp_res.scalar_one_or_none()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found.")
        
    is_owner = grp.user_id == current_user.id
    
    member_res = await db.execute(
        select(models.GroupMember).where(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == current_user.id
        )
    )
    is_member = member_res.scalar_one_or_none() is not None
    
    if not (is_owner or is_member):
        raise HTTPException(status_code=403, detail="Not your group.")

    res = await db.execute(
        select(models.Settlement).where(models.Settlement.id == settlement_id)
    )
    settlement = res.scalar_one_or_none()
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found.")

    settlement.status = "completed"
    settlement.date = datetime.now(timezone.utc)
    await db.commit()

    await calculate_settlements(group_id, db)
    return {"status": "success"}
