from datetime import datetime, date as date_type
from decimal import Decimal
from sqlalchemy import (
    Column, String, Numeric, Integer, Boolean,
    DateTime, Date, ForeignKey, func, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    """Mirrors the frontend User type. Firebase UID or local UUID is the primary key."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)              # bcrypt hash — never plaintext
    monthly_income = Column(Numeric(12, 2), default=0)
    hours_per_week = Column(Integer, default=40)
    target_savings_percentage = Column(Numeric(5, 2), default=20)
    auth_provider = Column(String, default="email")       # "email" | "google"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    recurring_transactions = relationship("RecurringTransaction", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    contracts = relationship("Contract", back_populates="user", cascade="all, delete-orphan")
    sacrifices = relationship("Sacrifice", back_populates="user", cascade="all, delete-orphan")
    insights = relationship("Insight", back_populates="user", cascade="all, delete-orphan")
    groups = relationship("Group", back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    accountType = Column(String)                          # 'primary', 'savings', 'investment'
    balance = Column(Numeric(12, 2), default=0)           # FIXED: was Float — precision-safe
    createdAt = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="accounts")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_transaction_idempotency"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type = Column(String)                                 # 'income', 'expense', 'goal', 'transfer'
    amount = Column(Numeric(12, 2))                       # FIXED: was Float
    category = Column(String)
    merchant = Column(String)
    description = Column(String, nullable=True)
    transaction_date = Column(Date, index=True)           # FIXED: was String — enables DB-level filtering
    payment_method = Column(String, nullable=True)
    is_recurring = Column(Boolean, default=False)
    regret_tag = Column(String, nullable=True)            # 'good', 'bad', null
    goal_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Transfer-specific fields
    from_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    to_account_id = Column(String, ForeignKey("accounts.id"), nullable=True)
    status = Column(String, nullable=True)                # 'pending', 'completed', 'failed'
    idempotency_key = Column(String, nullable=True, unique=True)

    user = relationship("User", back_populates="transactions")


class RecurringTransaction(Base):
    __tablename__ = "recurring_transactions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    merchant = Column(String)
    amount = Column(Numeric(12, 2))                       # FIXED: was Float
    frequency = Column(String)
    next_expected_date = Column(Date)                     # FIXED: was String
    confidence_score = Column(Integer)

    user = relationship("User", back_populates="recurring_transactions")


class Goal(Base):
    __tablename__ = "goals"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String)
    target_amount = Column(Numeric(12, 2))                # FIXED: was Float
    current_amount = Column(Numeric(12, 2), default=0)   # FIXED: was Float
    target_date = Column(Date, nullable=True)             # FIXED: was String
    priority = Column(Integer, default=3)

    user = relationship("User", back_populates="goals")


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category = Column(String)
    cap_amount = Column(Numeric(12, 2))                   # FIXED: was Float
    start_date = Column(Date)                             # FIXED: was String
    end_date = Column(Date)                               # FIXED: was String
    status = Column(String)
    streak_count = Column(Integer, default=0)

    user = relationship("User", back_populates="contracts")


class Sacrifice(Base):
    __tablename__ = "sacrifices"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount_saved = Column(Numeric(12, 2))                 # FIXED: was Float
    category = Column(String)
    resolved_at = Column(DateTime(timezone=True))         # FIXED: was String
    goal_days_saved = Column(Integer)

    user = relationship("User", back_populates="sacrifices")


class Insight(Base):
    __tablename__ = "insights"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    insight_type = Column(String)
    title = Column(String)
    description = Column(String)
    severity = Column(String)
    detected_at = Column(DateTime(timezone=True))         # FIXED: was String

    user = relationship("User", back_populates="insights")


class Group(Base):
    __tablename__ = "groups"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="groups")
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    expenses = relationship("GroupExpense", back_populates="group", cascade="all, delete-orphan")
    settlements = relationship("Settlement", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(String, primary_key=True, index=True)
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    name = Column(String)
    user_id = Column(String, nullable=True)

    group = relationship("Group", back_populates="members")
    splits = relationship("ExpenseSplit", back_populates="member", cascade="all, delete-orphan")


class GroupExpense(Base):
    __tablename__ = "group_expenses"

    id = Column(String, primary_key=True, index=True)
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    description = Column(String)
    amount = Column(Numeric(12, 2))                       # FIXED: was Float
    paid_by = Column(String, ForeignKey("group_members.id", ondelete="CASCADE"))
    date = Column(Date)                                   # FIXED: was String
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    group = relationship("Group", back_populates="expenses")
    payer = relationship("GroupMember")
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")


class ExpenseSplit(Base):
    __tablename__ = "expense_splits"

    id = Column(String, primary_key=True, index=True)
    expense_id = Column(String, ForeignKey("group_expenses.id", ondelete="CASCADE"), index=True)
    member_id = Column(String, ForeignKey("group_members.id", ondelete="CASCADE"), index=True)
    amount_owed = Column(Numeric(12, 2))                  # FIXED: was Float

    expense = relationship("GroupExpense", back_populates="splits")
    member = relationship("GroupMember", back_populates="splits")


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(String, primary_key=True, index=True)
    group_id = Column(String, ForeignKey("groups.id", ondelete="CASCADE"), index=True)
    paid_by = Column(String, ForeignKey("group_members.id", ondelete="CASCADE"))
    paid_to = Column(String, ForeignKey("group_members.id", ondelete="CASCADE"))
    amount = Column(Numeric(12, 2))                       # FIXED: was Float
    date = Column(DateTime(timezone=True), nullable=True) # FIXED: was String
    status = Column(String)

    group = relationship("Group", back_populates="settlements")
    payer = relationship("GroupMember", foreign_keys=[paid_by])
    payee = relationship("GroupMember", foreign_keys=[paid_to])
