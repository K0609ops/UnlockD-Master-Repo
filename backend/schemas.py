from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Union
from datetime import datetime, date
import datetime as dt
from decimal import Decimal


# ---------------------------------------------------------------------------
# User — Public schema (password deliberately excluded)
# ---------------------------------------------------------------------------
class UserPublic(BaseModel):
    id: str
    email: str
    username: Optional[str] = None
    monthly_income: Decimal = Decimal("0.0")
    hours_per_week: int = 40
    target_savings_percentage: Decimal = Decimal("20.0")
    auth_provider: str = "email"
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class GoogleAuthRequest(BaseModel):
    id_token: str

class EmailLoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    monthly_income: Decimal = Decimal("0.0")
    hours_per_week: int = 40

class AuthResponse(BaseModel):
    user: UserPublic
    access_token: str
    token_type: str = "bearer"
    is_new_user: bool = False
    message: str = "OK"

# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------
class AccountBase(BaseModel):
    id: str
    userId: str = Field(validation_alias="user_id", serialization_alias="userId")
    accountType: str
    balance: Decimal
    createdAt: Optional[dt.datetime] = Field(None, validation_alias="createdAt")
    model_config = {"from_attributes": True, "populate_by_name": True}

class UpsertAccountRequest(BaseModel):
    accountType: str
    balance: Decimal


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------
class TransactionBase(BaseModel):
    id: str
    user_id: str
    type: str
    amount: Decimal
    category: str
    merchant: str
    description: Optional[str] = None
    transaction_date: date
    payment_method: Optional[str] = None
    is_recurring: bool
    regret_tag: Optional[str] = None
    goal_id: Optional[str] = None
    created_at: Optional[datetime] = None
    # Transfer fields
    fromAccountId: Optional[str] = Field(None, validation_alias="from_account_id", serialization_alias="fromAccountId")
    toAccountId: Optional[str] = Field(None, validation_alias="to_account_id", serialization_alias="toAccountId")
    status: Optional[str] = None
    idempotencyKey: Optional[str] = Field(None, validation_alias="idempotency_key", serialization_alias="idempotencyKey")
    model_config = {"from_attributes": True, "populate_by_name": True}

class CreateTransactionRequest(BaseModel):
    type: str
    amount: Decimal
    category: str
    merchant: str
    description: Optional[str] = None
    transaction_date: str              # accept string from frontend, parse in router
    payment_method: Optional[str] = "Card"
    is_recurring: bool = False
    regret_tag: Optional[str] = None
    goal_id: Optional[str] = None

class UpdateTransactionRequest(BaseModel):
    regret_tag: Optional[str] = None  # 'good', 'bad', or null to clear

# ---------------------------------------------------------------------------
# Transfer
# ---------------------------------------------------------------------------
class TransferRequest(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: Decimal
    idempotency_key: str
    description: str = "Internal transfer"

# ---------------------------------------------------------------------------
# Recurring Transaction
# ---------------------------------------------------------------------------
class RecurringTransactionBase(BaseModel):
    id: str
    user_id: str
    merchant: str
    amount: Decimal
    frequency: str
    next_expected_date: date
    confidence_score: int
    model_config = {"from_attributes": True}

class CreateRecurringRequest(BaseModel):
    merchant: str
    amount: Decimal
    frequency: str
    next_expected_date: str

# ---------------------------------------------------------------------------
# Goal
# ---------------------------------------------------------------------------
class GoalBase(BaseModel):
    id: str
    user_id: str
    name: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: Optional[date] = None
    priority: int
    model_config = {"from_attributes": True}

class CreateGoalRequest(BaseModel):
    name: str
    target_amount: Decimal
    current_amount: Decimal = Decimal("0.0")
    target_date: Optional[str] = None
    priority: int = 3

# ---------------------------------------------------------------------------
# Contract
# ---------------------------------------------------------------------------
class ContractBase(BaseModel):
    id: str
    user_id: str
    category: str
    cap_amount: Decimal
    start_date: date
    end_date: date
    status: str
    streak_count: int
    model_config = {"from_attributes": True}

# ---------------------------------------------------------------------------
# Sacrifice
# ---------------------------------------------------------------------------
class SacrificeBase(BaseModel):
    id: str
    user_id: str
    amount_saved: Decimal
    category: str
    resolved_at: Optional[datetime] = None
    goal_days_saved: int
    model_config = {"from_attributes": True}

class CreateSacrificeRequest(BaseModel):
    amount_saved: Decimal
    category: str
    goal_days_saved: int = 0

# ---------------------------------------------------------------------------
# Insight
# ---------------------------------------------------------------------------
class InsightBase(BaseModel):
    id: str
    user_id: str
    insight_type: str
    title: str
    description: str
    severity: str
    detected_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

# ---------------------------------------------------------------------------
# Groups
# ---------------------------------------------------------------------------
class GroupBase(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

class GroupMemberBase(BaseModel):
    id: str
    group_id: str
    name: str
    user_id: Optional[str] = None
    model_config = {"from_attributes": True}

class GroupExpenseBase(BaseModel):
    id: str
    group_id: str
    description: str
    amount: Decimal
    paid_by: str
    date: Optional[dt.date] = None
    created_at: Optional[dt.datetime] = None
    model_config = {"from_attributes": True}

class ExpenseSplitBase(BaseModel):
    id: str
    expense_id: str
    member_id: str
    amount_owed: Decimal
    model_config = {"from_attributes": True}

class SettlementBase(BaseModel):
    id: str
    group_id: str
    paid_by: str
    paid_to: str
    amount: Decimal
    date: Optional[datetime] = None
    status: str
    model_config = {"from_attributes": True}

# ---------------------------------------------------------------------------
# User preference update
# ---------------------------------------------------------------------------
class UserUpdate(BaseModel):
    target_savings_percentage: Optional[Decimal] = None
    monthly_income: Optional[Decimal] = None

# ---------------------------------------------------------------------------
# Full State Response (hydrates frontend on login)
# ---------------------------------------------------------------------------
class DBStateResponse(BaseModel):
    currentUserEmail: Optional[str] = None
    users: List[UserPublic]                              # FIXED: typed, no password
    accounts: List[AccountBase]
    transactions: List[TransactionBase]
    recurring_transactions: List[RecurringTransactionBase]
    goals: List[GoalBase]
    contracts: List[ContractBase]
    sacrifices: List[SacrificeBase]
    insights: List[InsightBase]
    groups: List[GroupBase] = []
    group_members: List[GroupMemberBase] = []
    group_expenses: List[GroupExpenseBase] = []
    expense_splits: List[ExpenseSplitBase] = []
    settlements: List[SettlementBase] = []
