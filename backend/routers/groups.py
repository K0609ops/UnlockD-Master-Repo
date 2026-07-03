from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict
from datetime import datetime
import uuid

from database import get_db
import models
import schemas

router = APIRouter()

@router.post("/", response_model=schemas.GroupBase)
async def create_group(group: schemas.GroupBase, db: AsyncSession = Depends(get_db)):
    db_group = models.Group(
        id=group.id,
        user_id=group.user_id,
        name=group.name,
        created_at=group.created_at
    )
    db.add(db_group)
    await db.commit()
    return group

@router.post("/{group_id}/members", response_model=schemas.GroupMemberBase)
async def add_member(group_id: str, member: schemas.GroupMemberBase, db: AsyncSession = Depends(get_db)):
    db_member = models.GroupMember(
        id=member.id,
        group_id=group_id,
        name=member.name,
        user_id=member.user_id
    )
    db.add(db_member)
    await db.commit()
    return member

@router.post("/{group_id}/expenses", response_model=schemas.GroupExpenseBase)
async def add_expense(
    group_id: str, 
    expense: schemas.GroupExpenseBase, 
    splits: List[schemas.ExpenseSplitBase],
    db: AsyncSession = Depends(get_db)
):
    db_expense = models.GroupExpense(
        id=expense.id,
        group_id=group_id,
        description=expense.description,
        amount=expense.amount,
        paid_by=expense.paid_by,
        date=expense.date,
        created_at=expense.created_at
    )
    db.add(db_expense)
    
    for split in splits:
        db_split = models.ExpenseSplit(
            id=split.id,
            expense_id=split.expense_id,
            member_id=split.member_id,
            amount_owed=split.amount_owed
        )
        db.add(db_split)
        
    await db.commit()
    
    # Recalculate settlements
    await calculate_settlements(group_id, db)
    return expense

async def calculate_settlements(group_id: str, db: AsyncSession):
    # Get all expenses and splits for the group
    expenses_res = await db.execute(select(models.GroupExpense).where(models.GroupExpense.group_id == group_id))
    expenses = expenses_res.scalars().all()
    
    if not expenses:
        return
        
    expense_ids = [e.id for e in expenses]
    splits_res = await db.execute(select(models.ExpenseSplit).where(models.ExpenseSplit.expense_id.in_(expense_ids)))
    splits = splits_res.scalars().all()
    
    # Calculate net balance for each member
    balances = {} # member_id -> net balance (+ means they are owed, - means they owe)
    
    for exp in expenses:
        balances[exp.paid_by] = balances.get(exp.paid_by, 0.0) + exp.amount
        
    for split in splits:
        balances[split.member_id] = balances.get(split.member_id, 0.0) - split.amount_owed
        
    # Delete existing pending settlements
    settlements_res = await db.execute(
        select(models.Settlement).where(
            models.Settlement.group_id == group_id, 
            models.Settlement.status == 'pending'
        )
    )
    for settlement in settlements_res.scalars().all():
        await db.delete(settlement)
        
    # Also fetch completed settlements to adjust balances
    completed_res = await db.execute(
        select(models.Settlement).where(
            models.Settlement.group_id == group_id, 
            models.Settlement.status == 'completed'
        )
    )
    for settlement in completed_res.scalars().all():
        balances[settlement.paid_by] = balances.get(settlement.paid_by, 0.0) + settlement.amount
        balances[settlement.paid_to] = balances.get(settlement.paid_to, 0.0) - settlement.amount
        
    # Greedy algorithm to minimize transactions
    debtors = []
    creditors = []
    
    for member_id, balance in balances.items():
        if balance > 0.01:
            creditors.append([member_id, balance])
        elif balance < -0.01:
            debtors.append([member_id, -balance])
            
    # Sort by amount descending
    debtors.sort(key=lambda x: x[1], reverse=True)
    creditors.sort(key=lambda x: x[1], reverse=True)
    
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor_id, debt = debtors[i]
        creditor_id, credit = creditors[j]
        
        amount = min(debt, credit)
        
        if amount > 0.01:
            db_settlement = models.Settlement(
                id=str(uuid.uuid4()),
                group_id=group_id,
                paid_by=debtor_id,
                paid_to=creditor_id,
                amount=amount,
                status='pending'
            )
            db.add(db_settlement)
            
        debtors[i][1] -= amount
        creditors[j][1] -= amount
        
        if debtors[i][1] < 0.01:
            i += 1
        if creditors[j][1] < 0.01:
            j += 1
            
    await db.commit()

@router.post("/{group_id}/settlements/{settlement_id}/pay", response_model=dict)
async def pay_settlement(group_id: str, settlement_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(models.Settlement).where(models.Settlement.id == settlement_id))
    settlement = res.scalar_one_or_none()
    
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
        
    settlement.status = 'completed'
    settlement.date = datetime.now().isoformat()
    await db.commit()
    
    # Recalculate pending settlements
    await calculate_settlements(group_id, db)
    
    return {"status": "success"}
