from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    email: str
    username: Optional[str] = None
    monthly_income: float = 0.0
    hours_per_week: int = 40
    target_savings_percentage: float = 20.0

class UserResponse(UserBase):
    id: str
    auth_provider: str
    created_at: datetime

    model_config = {"from_attributes": True}

class GoogleAuthRequest(BaseModel):
    id_token: str

class AuthResponse(BaseModel):
    user: UserResponse
    message: str
    is_new_user: bool

from pydantic import BaseModel, Field

class AccountBase(BaseModel):
    id: str
    userId: str = Field(validation_alias="user_id", serialization_alias="userId")
    accountType: str
    balance: float
    createdAt: str
    model_config = {"from_attributes": True, "populate_by_name": True}

class TransactionBase(BaseModel):
    id: str
    user_id: str
    type: str
    amount: float
    category: str
    merchant: str
    description: Optional[str] = None
    transaction_date: str
    payment_method: Optional[str] = None
    is_recurring: bool
    regret_tag: Optional[str] = None
    goal_id: Optional[str] = None
    created_at: str
    model_config = {"from_attributes": True}

class RecurringTransactionBase(BaseModel):
    id: str
    user_id: str
    merchant: str
    amount: float
    frequency: str
    next_expected_date: str
    confidence_score: int
    model_config = {"from_attributes": True}

class GoalBase(BaseModel):
    id: str
    user_id: str
    name: str
    target_amount: float
    current_amount: float
    target_date: str
    priority: int
    model_config = {"from_attributes": True}

class ContractBase(BaseModel):
    id: str
    user_id: str
    category: str
    cap_amount: float
    start_date: str
    end_date: str
    status: str
    streak_count: int
    model_config = {"from_attributes": True}

class SacrificeBase(BaseModel):
    id: str
    user_id: str
    amount_saved: float
    category: str
    resolved_at: str
    goal_days_saved: int
    model_config = {"from_attributes": True}

class InsightBase(BaseModel):
    id: str
    user_id: str
    insight_type: str
    title: str
    description: str
    severity: str
    detected_at: str
    model_config = {"from_attributes": True}

class GroupBase(BaseModel):
    id: str
    user_id: str
    name: str
    created_at: str
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
    amount: float
    paid_by: str
    date: str
    created_at: str
    model_config = {"from_attributes": True}

class ExpenseSplitBase(BaseModel):
    id: str
    expense_id: str
    member_id: str
    amount_owed: float
    model_config = {"from_attributes": True}

class SettlementBase(BaseModel):
    id: str
    group_id: str
    paid_by: str
    paid_to: str
    amount: float
    date: Optional[str] = None
    status: str
    model_config = {"from_attributes": True}

class DBStateResponse(BaseModel):
    currentUserEmail: Optional[str] = None
    users: List[dict]
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

class UserUpdate(BaseModel):
    target_savings_percentage: Optional[float] = None
    monthly_income: Optional[float] = None

