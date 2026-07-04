"""
Finance router — read state + all write mutations (transactions, transfer, goals, recurring, sacrifices).
Every endpoint requires a valid JWT via the get_current_user dependency.
"""
import asyncio
import uuid
from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from dependencies import get_current_user
import models
import schemas

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /finance/state  — hydrate the entire frontend state
# ---------------------------------------------------------------------------
@router.get("/state", response_model=schemas.DBStateResponse)
async def get_user_state(
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch all data for the authenticated user to hydrate the frontend."""
    uid = current_user.id

    # FIXED: fire all queries concurrently with asyncio.gather()
    (
        accounts_res, transactions_res, recurring_res,
        goals_res, contracts_res, sacrifices_res,
        insights_res, groups_res,
    ) = await asyncio.gather(
        db.execute(select(models.Account).where(models.Account.user_id == uid)),
        db.execute(
            select(models.Transaction)
            .where(models.Transaction.user_id == uid)
            .order_by(models.Transaction.transaction_date.desc(), models.Transaction.created_at.desc())
            .limit(50)
        ),
        db.execute(select(models.RecurringTransaction).where(models.RecurringTransaction.user_id == uid)),
        db.execute(select(models.Goal).where(models.Goal.user_id == uid)),
        db.execute(select(models.Contract).where(models.Contract.user_id == uid)),
        db.execute(select(models.Sacrifice).where(models.Sacrifice.user_id == uid)),
        db.execute(select(models.Insight).where(models.Insight.user_id == uid)),
        db.execute(select(models.Group).where(models.Group.user_id == uid)),
    )

    groups = groups_res.scalars().all()
    group_ids = [g.id for g in groups]

    if group_ids:
        members_res, settlements_res, expenses_res = await asyncio.gather(
            db.execute(select(models.GroupMember).where(models.GroupMember.group_id.in_(group_ids))),
            db.execute(select(models.Settlement).where(models.Settlement.group_id.in_(group_ids))),
            db.execute(select(models.GroupExpense).where(models.GroupExpense.group_id.in_(group_ids))),
        )
        expenses = expenses_res.scalars().all()
        expense_ids = [e.id for e in expenses]
        splits = []
        if expense_ids:
            splits_res = await db.execute(
                select(models.ExpenseSplit).where(models.ExpenseSplit.expense_id.in_(expense_ids))
            )
            splits = splits_res.scalars().all()
        members = members_res.scalars().all()
        settlements = settlements_res.scalars().all()
    else:
        members, expenses, splits, settlements = [], [], [], []

    return {
        "currentUserEmail": current_user.email,
        "users": [current_user],           # FIXED: typed UserPublic — password never exposed
        "accounts": accounts_res.scalars().all(),
        "transactions": transactions_res.scalars().all(),
        "recurring_transactions": recurring_res.scalars().all(),
        "goals": goals_res.scalars().all(),
        "contracts": contracts_res.scalars().all(),
        "sacrifices": sacrifices_res.scalars().all(),
        "insights": insights_res.scalars().all(),
        "groups": groups,
        "group_members": members,
        "group_expenses": expenses,
        "expense_splits": splits,
        "settlements": settlements,
    }


# ---------------------------------------------------------------------------
# GET /finance/transactions  — paginated ledger
# ---------------------------------------------------------------------------
@router.get("/transactions", response_model=list[schemas.TransactionBase])
async def get_transactions(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    res = await db.execute(
        select(models.Transaction)
        .where(models.Transaction.user_id == current_user.id)
        .order_by(models.Transaction.transaction_date.desc(), models.Transaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return res.scalars().all()


# ---------------------------------------------------------------------------
# PATCH /finance/preferences  — update user savings/income
# ---------------------------------------------------------------------------
@router.patch("/preferences", response_model=dict)
async def update_preferences(
    payload: schemas.UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if payload.target_savings_percentage is not None:
        current_user.target_savings_percentage = payload.target_savings_percentage
    if payload.monthly_income is not None:
        current_user.monthly_income = payload.monthly_income
    await db.commit()
    return {"status": "success"}


# ---------------------------------------------------------------------------
# POST /finance/accounts  — upsert an account balance
# ---------------------------------------------------------------------------
@router.post("/accounts", response_model=schemas.AccountBase)
async def upsert_account(
    payload: schemas.UpsertAccountRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    acc_res = await db.execute(
        select(models.Account).where(
            models.Account.user_id == current_user.id,
            models.Account.accountType == payload.accountType,
        )
    )
    acc = acc_res.scalar_one_or_none()
    
    if acc:
        acc.balance = payload.balance
    else:
        acc = models.Account(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            accountType=payload.accountType,
            balance=payload.balance,
        )
        db.add(acc)
        
    await db.commit()
    await db.refresh(acc)
    return acc

# ---------------------------------------------------------------------------
# POST /finance/transactions  — add a transaction
# ---------------------------------------------------------------------------
@router.post("/transactions", response_model=schemas.TransactionBase)
async def add_transaction(
    payload: schemas.CreateTransactionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tx = models.Transaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        type=payload.type,
        amount=payload.amount,
        category=payload.category,
        merchant=payload.merchant,
        description=payload.description,
        transaction_date=date_type.fromisoformat(payload.transaction_date),
        payment_method=payload.payment_method,
        is_recurring=payload.is_recurring,
        regret_tag=payload.regret_tag,
        goal_id=payload.goal_id,
        status="completed",
    )
    db.add(tx)

    # If this is a goal contribution, update the goal's current_amount
    if payload.type == "goal" and payload.goal_id:
        goal_res = await db.execute(
            select(models.Goal).where(
                models.Goal.id == payload.goal_id,
                models.Goal.user_id == current_user.id,
            ).with_for_update()
        )
        goal = goal_res.scalar_one_or_none()
        if goal:
            goal.current_amount = goal.current_amount + payload.amount

    # Adjust primary account balance
    acc_res = await db.execute(
        select(models.Account).where(
            models.Account.user_id == current_user.id,
            models.Account.accountType == "primary",
        ).with_for_update()
    )
    primary = acc_res.scalar_one_or_none()
    if primary:
        delta = payload.amount if payload.type == "income" else -payload.amount
        primary.balance = primary.balance + delta

    await db.commit()
    await db.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# DELETE /finance/transactions/{tx_id}  — delete a transaction
# ---------------------------------------------------------------------------
@router.delete("/transactions/{tx_id}", response_model=dict)
async def delete_transaction(
    tx_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    res = await db.execute(
        select(models.Transaction).where(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id,   # IDOR guard
        )
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    if tx.type != "transfer":
        acc_res = await db.execute(
            select(models.Account).where(
                models.Account.user_id == current_user.id,
                models.Account.accountType == "primary",
            ).with_for_update()
        )
        primary = acc_res.scalar_one_or_none()
        if primary:
            delta = tx.amount if tx.type == "income" else -tx.amount
            primary.balance = primary.balance - delta

        if tx.type == "goal" and tx.goal_id:
            goal_res = await db.execute(
                select(models.Goal).where(
                    models.Goal.id == tx.goal_id,
                    models.Goal.user_id == current_user.id,
                ).with_for_update()
            )
            goal = goal_res.scalar_one_or_none()
            if goal:
                goal.current_amount = goal.current_amount - tx.amount
    else:
        if tx.from_account_id:
            from_res = await db.execute(
                select(models.Account).where(models.Account.id == tx.from_account_id).with_for_update()
            )
            from_acc = from_res.scalar_one_or_none()
            if from_acc:
                from_acc.balance = from_acc.balance + tx.amount
                
        if tx.to_account_id:
            to_res = await db.execute(
                select(models.Account).where(models.Account.id == tx.to_account_id).with_for_update()
            )
            to_acc = to_res.scalar_one_or_none()
            if to_acc:
                to_acc.balance = to_acc.balance - tx.amount

    await db.delete(tx)
    await db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# PATCH /finance/transactions/{tx_id}  — update regret tag
# ---------------------------------------------------------------------------
@router.patch("/transactions/{tx_id}", response_model=dict)
async def update_transaction(
    tx_id: str,
    payload: schemas.UpdateTransactionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    res = await db.execute(
        select(models.Transaction).where(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id,
        )
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    tx.regret_tag = payload.regret_tag
    await db.commit()
    return {"status": "updated"}


# ---------------------------------------------------------------------------
# POST /finance/transfer  — atomic transfer with SELECT FOR UPDATE
# ---------------------------------------------------------------------------
@router.post("/transfer", response_model=schemas.TransactionBase)
async def execute_transfer(
    payload: schemas.TransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Idempotency guard — reject duplicate transfer requests
    existing_res = await db.execute(
        select(models.Transaction).where(
            models.Transaction.idempotency_key == payload.idempotency_key
        )
    )
    if existing_res.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Duplicate transfer request (idempotency key already used).")

    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts cannot be the same.")

    # SELECT FOR UPDATE — locks rows to prevent TOCTOU race conditions
    from_res = await db.execute(
        select(models.Account)
        .where(
            models.Account.id == payload.from_account_id,
            models.Account.user_id == current_user.id,
        )
        .with_for_update()
    )
    from_account = from_res.scalar_one_or_none()

    to_res = await db.execute(
        select(models.Account)
        .where(
            models.Account.id == payload.to_account_id,
            models.Account.user_id == current_user.id,
        )
        .with_for_update()
    )
    to_account = to_res.scalar_one_or_none()

    if not from_account or not to_account:
        raise HTTPException(status_code=404, detail="Account not found.")

    # Overdraft protection
    if from_account.balance < payload.amount:
        raise HTTPException(status_code=400, detail="INSUFFICIENT_FUNDS")

    # Atomic debit + credit
    from_account.balance = from_account.balance - payload.amount
    to_account.balance = to_account.balance + payload.amount

    tx = models.Transaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        type="transfer",
        amount=payload.amount,
        category="Transfer",
        merchant="System",
        description=payload.description,
        transaction_date=date_type.today(),
        payment_method="Internal Transfer",
        is_recurring=False,
        regret_tag=None,
        from_account_id=payload.from_account_id,
        to_account_id=payload.to_account_id,
        status="completed",
        idempotency_key=payload.idempotency_key,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return tx


# ---------------------------------------------------------------------------
# POST /finance/goals  — add a goal
# ---------------------------------------------------------------------------
@router.post("/goals", response_model=schemas.GoalBase)
async def add_goal(
    payload: schemas.CreateGoalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target_date = date_type.fromisoformat(payload.target_date) if payload.target_date else None
    goal = models.Goal(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        name=payload.name,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        target_date=target_date,
        priority=payload.priority,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


# ---------------------------------------------------------------------------
# POST /finance/recurring  — add recurring transaction
# ---------------------------------------------------------------------------
@router.post("/recurring", response_model=schemas.RecurringTransactionBase)
async def add_recurring(
    payload: schemas.CreateRecurringRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rec = models.RecurringTransaction(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        merchant=payload.merchant,
        amount=payload.amount,
        frequency=payload.frequency,
        next_expected_date=date_type.fromisoformat(payload.next_expected_date),
        confidence_score=100,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


# ---------------------------------------------------------------------------
# DELETE /finance/recurring/{rec_id}  — remove recurring transaction
# ---------------------------------------------------------------------------
@router.delete("/recurring/{rec_id}", response_model=dict)
async def delete_recurring(
    rec_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    res = await db.execute(
        select(models.RecurringTransaction).where(
            models.RecurringTransaction.id == rec_id,
            models.RecurringTransaction.user_id == current_user.id,
        )
    )
    rec = res.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recurring transaction not found.")
    await db.delete(rec)
    await db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# POST /finance/sacrifices  — log a sacrifice (skipped purchase)
# ---------------------------------------------------------------------------
@router.post("/sacrifices", response_model=schemas.SacrificeBase)
async def add_sacrifice(
    payload: schemas.CreateSacrificeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sac = models.Sacrifice(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        amount_saved=payload.amount_saved,
        category=payload.category,
        resolved_at=datetime.now(timezone.utc),
        goal_days_saved=payload.goal_days_saved,
    )
    db.add(sac)
    await db.commit()
    await db.refresh(sac)
    return sac
