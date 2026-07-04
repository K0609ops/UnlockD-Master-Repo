"""
Seed script — populates the database with a realistic demo user.

Usage:
  python seed.py           # safe upsert (drops demo user data, re-inserts)
  python seed.py --drop    # drops ALL tables first (use after schema changes)
"""
import asyncio
import sys
import bcrypt
from datetime import datetime, date, timezone
from decimal import Decimal

from sqlalchemy import select
from database import engine, AsyncSessionLocal
import models
from models import Base


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


async def seed_db():
    drop_all = "--drop" in sys.argv

    async with engine.begin() as conn:
        if drop_all:
            print("Dropping all tables...")
            await conn.run_sync(Base.metadata.drop_all)
        print("Creating tables (if not exist)...")
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        print("Seeding demo data...")

        demo_email = "demo@finverse.app"
        result = await db.execute(select(models.User).where(models.User.email == demo_email))
        existing_user = result.scalar_one_or_none()

        D = "demo_priya_001"
        if existing_user:
            print("Demo user exists — removing old data and re-seeding...")
            await db.delete(existing_user)
            await db.commit()

        print("Inserting User...")
        user = models.User(
            id=D,
            email=demo_email,
            username="Kalhara Biju",
            password=_hash_password("Demo@2024"),   # FIXED: bcrypt hash, never plaintext
            monthly_income=Decimal("95000"),
            hours_per_week=42,
            target_savings_percentage=Decimal("30"),
            created_at=datetime(2024, 4, 1, tzinfo=timezone.utc),
            auth_provider="email",
        )
        db.add(user)

        PA, SA, IA = "acc_p1", "acc_s1", "acc_i1"
        db.add_all([
            models.Account(id=PA, user_id=D, accountType="primary",    balance=Decimal("31800"), createdAt=datetime(2024, 4, 1, tzinfo=timezone.utc)),
            models.Account(id=SA, user_id=D, accountType="savings",    balance=Decimal("108000"), createdAt=datetime(2024, 4, 1, tzinfo=timezone.utc)),
            models.Account(id=IA, user_id=D, accountType="investment", balance=Decimal("145000"), createdAt=datetime(2024, 4, 1, tzinfo=timezone.utc)),
        ])

        # FIXED: all dates are proper date/datetime objects, not strings
        transactions = [
            # MAY 2024
            dict(id="tx_m01", user_id=D, type="income",  amount=Decimal("95000"), category="Salary",       merchant="Infosys Ltd",       description="Monthly CTC",          transaction_date=date(2024,5,1),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,5,1,9,0,tzinfo=timezone.utc)),
            dict(id="tx_m02", user_id=D, type="expense", amount=Decimal("22000"), category="Rent",         merchant="GreenWood Residency",description="May rent",             transaction_date=date(2024,5,2),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,5,2,10,0,tzinfo=timezone.utc)),
            dict(id="tx_m03", user_id=D, type="expense", amount=Decimal("4200"),  category="Groceries",   merchant="BigBasket",           description="Monthly groceries",   transaction_date=date(2024,5,4),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,5,4,11,0,tzinfo=timezone.utc)),
            dict(id="tx_m04", user_id=D, type="expense", amount=Decimal("1499"),  category="Subscriptions",merchant="Netflix",             description="Premium plan",        transaction_date=date(2024,5,5),  payment_method="Credit Card",   is_recurring=True,  regret_tag=None, created_at=datetime(2024,5,5,12,0,tzinfo=timezone.utc)),
            dict(id="tx_m06", user_id=D, type="expense", amount=Decimal("5800"),  category="Dining",      merchant="Smoke House Deli",    description="Friends dinner",      transaction_date=date(2024,5,8),  payment_method="Credit Card",   is_recurring=False, regret_tag="bad",  created_at=datetime(2024,5,8,20,0,tzinfo=timezone.utc)),
            dict(id="tx_m08", user_id=D, type="expense", amount=Decimal("2500"),  category="Health",      merchant="Cult.fit",            description="Monthly gym",         transaction_date=date(2024,5,10), payment_method="UPI",           is_recurring=True,  regret_tag="good", created_at=datetime(2024,5,10,7,0,tzinfo=timezone.utc)),
            dict(id="tx_m09", user_id=D, type="goal",    amount=Decimal("12000"), category="Savings Goal",merchant="Emergency Fund",      description="Monthly deposit",     transaction_date=date(2024,5,12), payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, goal_id="goal_001", created_at=datetime(2024,5,12,9,0,tzinfo=timezone.utc)),
            # MAY minor
            dict(id="tx_m_min1", user_id=D, type="expense", amount=Decimal("350"),  category="Dining",    merchant="Third Wave Coffee",  description="Coffee",              transaction_date=date(2024,5,3),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,5,3,9,15,tzinfo=timezone.utc)),
            dict(id="tx_m_min2", user_id=D, type="expense", amount=Decimal("850"),  category="Transport", merchant="Uber",               description="Office ride",         transaction_date=date(2024,5,6),  payment_method="Credit Card",   is_recurring=False, regret_tag=None, created_at=datetime(2024,5,6,18,30,tzinfo=timezone.utc)),
            dict(id="tx_m_min3", user_id=D, type="expense", amount=Decimal("1200"), category="Dining",    merchant="Swiggy",             description="Late dinner",         transaction_date=date(2024,5,15), payment_method="UPI",           is_recurring=False, regret_tag="bad",  created_at=datetime(2024,5,15,22,45,tzinfo=timezone.utc)),
            dict(id="tx_m_min4", user_id=D, type="expense", amount=Decimal("400"),  category="Transport", merchant="Namma Yatri",        description="Auto to metro",       transaction_date=date(2024,5,22), payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,5,22,8,45,tzinfo=timezone.utc)),
            dict(id="tx_m_min5", user_id=D, type="expense", amount=Decimal("2500"), category="Shopping",  merchant="Zara",               description="Summer shirt",        transaction_date=date(2024,5,28), payment_method="Credit Card",   is_recurring=False, regret_tag="bad",  created_at=datetime(2024,5,28,16,20,tzinfo=timezone.utc)),
            # JUNE 2024
            dict(id="tx_j01", user_id=D, type="income",  amount=Decimal("95000"), category="Salary",      merchant="Infosys Ltd",        description="Monthly CTC",         transaction_date=date(2024,6,1),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,6,1,9,0,tzinfo=timezone.utc)),
            dict(id="tx_j02", user_id=D, type="expense", amount=Decimal("22000"), category="Rent",        merchant="GreenWood Residency",description="June rent",           transaction_date=date(2024,6,2),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,6,2,10,0,tzinfo=timezone.utc)),
            dict(id="tx_j03", user_id=D, type="expense", amount=Decimal("4600"),  category="Groceries",  merchant="BigBasket",           description="Monthly groceries",   transaction_date=date(2024,6,4),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,6,4,11,0,tzinfo=timezone.utc)),
            dict(id="tx_j06", user_id=D, type="expense", amount=Decimal("3600"),  category="Dining",     merchant="Social — Koramangala",description="Birthday celebration",transaction_date=date(2024,6,7),  payment_method="Credit Card",   is_recurring=False, regret_tag="bad",  created_at=datetime(2024,6,7,20,0,tzinfo=timezone.utc)),
            dict(id="tx_j08", user_id=D, type="expense", amount=Decimal("2500"),  category="Health",     merchant="Cult.fit",            description="Monthly gym",         transaction_date=date(2024,6,10), payment_method="UPI",           is_recurring=True,  regret_tag="good", created_at=datetime(2024,6,10,7,0,tzinfo=timezone.utc)),
            dict(id="tx_j09", user_id=D, type="goal",    amount=Decimal("12000"), category="Savings Goal",merchant="Emergency Fund",     description="Monthly deposit",     transaction_date=date(2024,6,12), payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, goal_id="goal_001", created_at=datetime(2024,6,12,9,0,tzinfo=timezone.utc)),
            dict(id="tx_j10", user_id=D, type="goal",    amount=Decimal("5000"),  category="Savings Goal",merchant="Goa Trip Fund",      description="Trip savings deposit", transaction_date=date(2024,6,13), payment_method="Bank Transfer", is_recurring=False, regret_tag=None, goal_id="goal_002", created_at=datetime(2024,6,13,9,30,tzinfo=timezone.utc)),
            # JUNE minor
            dict(id="tx_j_min1", user_id=D, type="expense", amount=Decimal("450"),  category="Dining",   merchant="Starbucks",          description="Latte",               transaction_date=date(2024,6,3),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,6,3,10,10,tzinfo=timezone.utc)),
            dict(id="tx_j_min2", user_id=D, type="expense", amount=Decimal("980"),  category="Dining",   merchant="Zomato",             description="Lunch order",         transaction_date=date(2024,6,8),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,6,8,13,25,tzinfo=timezone.utc)),
            dict(id="tx_j_min3", user_id=D, type="expense", amount=Decimal("750"),  category="Transport",merchant="Uber",               description="Rain surge pricing",  transaction_date=date(2024,6,15), payment_method="Credit Card",   is_recurring=False, regret_tag="bad",  created_at=datetime(2024,6,15,19,40,tzinfo=timezone.utc)),
            dict(id="tx_j_min4", user_id=D, type="expense", amount=Decimal("300"),  category="Dining",   merchant="Third Wave Coffee",  description="Cold brew",           transaction_date=date(2024,6,19), payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,6,19,14,15,tzinfo=timezone.utc)),
            dict(id="tx_j_min5", user_id=D, type="expense", amount=Decimal("1800"), category="Shopping", merchant="Myntra",             description="Shoes",               transaction_date=date(2024,6,25), payment_method="Credit Card",   is_recurring=False, regret_tag=None, created_at=datetime(2024,6,25,21,0,tzinfo=timezone.utc)),
            dict(id="tx_j_min6", user_id=D, type="expense", amount=Decimal("550"),  category="Transport",merchant="BluSmart",           description="Ride home",           transaction_date=date(2024,6,29), payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,6,29,20,10,tzinfo=timezone.utc)),
            # JULY 2024
            dict(id="tx_l01", user_id=D, type="income",  amount=Decimal("95000"), category="Salary",      merchant="Infosys Ltd",        description="Monthly CTC",         transaction_date=date(2024,7,1),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,7,1,9,0,tzinfo=timezone.utc)),
            dict(id="tx_l02", user_id=D, type="expense", amount=Decimal("22000"), category="Rent",        merchant="GreenWood Residency",description="July rent",           transaction_date=date(2024,7,2),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, created_at=datetime(2024,7,2,10,0,tzinfo=timezone.utc)),
            dict(id="tx_l03", user_id=D, type="expense", amount=Decimal("3800"),  category="Groceries",  merchant="BigBasket",           description="Weekly groceries",   transaction_date=date(2024,7,4),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,7,4,11,0,tzinfo=timezone.utc)),
            dict(id="tx_l06", user_id=D, type="expense", amount=Decimal("2500"),  category="Health",     merchant="Cult.fit",            description="Monthly gym",         transaction_date=date(2024,7,6),  payment_method="UPI",           is_recurring=True,  regret_tag="good", created_at=datetime(2024,7,6,7,0,tzinfo=timezone.utc)),
            dict(id="tx_l07", user_id=D, type="goal",    amount=Decimal("12000"), category="Savings Goal",merchant="Emergency Fund",     description="Monthly deposit",     transaction_date=date(2024,7,8),  payment_method="Bank Transfer", is_recurring=True,  regret_tag=None, goal_id="goal_001", created_at=datetime(2024,7,8,9,0,tzinfo=timezone.utc)),
            # JULY minor
            dict(id="tx_l_min1", user_id=D, type="expense", amount=Decimal("380"),  category="Dining",   merchant="Third Wave Coffee",  description="Morning coffee",      transaction_date=date(2024,7,3),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,7,3,8,45,tzinfo=timezone.utc)),
            dict(id="tx_l_min2", user_id=D, type="expense", amount=Decimal("1100"), category="Dining",   merchant="Swiggy",             description="Pizza craving",       transaction_date=date(2024,7,5),  payment_method="UPI",           is_recurring=False, regret_tag="bad",  created_at=datetime(2024,7,5,23,10,tzinfo=timezone.utc)),
            dict(id="tx_l_min3", user_id=D, type="expense", amount=Decimal("450"),  category="Transport",merchant="Uber",               description="Short ride",          transaction_date=date(2024,7,7),  payment_method="Credit Card",   is_recurring=False, regret_tag=None, created_at=datetime(2024,7,7,11,20,tzinfo=timezone.utc)),
            dict(id="tx_l_min4", user_id=D, type="expense", amount=Decimal("600"),  category="Personal Care",merchant="Pharmacy",        description="Meds",                transaction_date=date(2024,7,9),  payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,7,9,18,0,tzinfo=timezone.utc)),
            dict(id="tx_l_min5", user_id=D, type="expense", amount=Decimal("890"),  category="Dining",   merchant="Zomato",             description="Lunch",               transaction_date=date(2024,7,11), payment_method="UPI",           is_recurring=False, regret_tag=None, created_at=datetime(2024,7,11,13,40,tzinfo=timezone.utc)),
        ]
        db.add_all([models.Transaction(**t) for t in transactions])

        recurring = [
            dict(id="rec_01", user_id=D, merchant="GreenWood Residency", amount=Decimal("22000"), frequency="monthly", next_expected_date=date(2024,8,2), confidence_score=99),
            dict(id="rec_02", user_id=D, merchant="Netflix",             amount=Decimal("1499"),  frequency="monthly", next_expected_date=date(2024,8,5), confidence_score=98),
            dict(id="rec_03", user_id=D, merchant="Cult.fit",            amount=Decimal("2500"),  frequency="monthly", next_expected_date=date(2024,8,6), confidence_score=96),
        ]
        db.add_all([models.RecurringTransaction(**r) for r in recurring])

        goals = [
            dict(id="goal_001", user_id=D, name="Emergency Fund (6 months)", target_amount=Decimal("300000"), current_amount=Decimal("108000"), target_date=date(2025,6,1),  priority=1),
            dict(id="goal_002", user_id=D, name="Goa Trip — December",       target_amount=Decimal("45000"),  current_amount=Decimal("15000"),  target_date=date(2024,11,30), priority=2),
            dict(id="goal_003", user_id=D, name="MacBook Pro M4",            target_amount=Decimal("220000"), current_amount=Decimal("40000"),  target_date=date(2025,4,1),  priority=3),
        ]
        db.add_all([models.Goal(**g) for g in goals])

        contracts = [
            dict(id="con_01", user_id=D, category="Dining",    cap_amount=Decimal("4000"), start_date=date(2024,7,1), end_date=date(2024,7,31), status="active", streak_count=12),
            dict(id="con_02", user_id=D, category="Shopping",  cap_amount=Decimal("5000"), start_date=date(2024,7,1), end_date=date(2024,7,31), status="active", streak_count=12),
        ]
        db.add_all([models.Contract(**c) for c in contracts])

        sacrifices = [
            dict(id="sac_01", user_id=D, amount_saved=Decimal("2600"), category="Personal Care", resolved_at=datetime(2024,6,30,tzinfo=timezone.utc), goal_days_saved=3),
            dict(id="sac_02", user_id=D, amount_saved=Decimal("4500"), category="Shopping",      resolved_at=datetime(2024,6,20,tzinfo=timezone.utc), goal_days_saved=6),
        ]
        db.add_all([models.Sacrifice(**s) for s in sacrifices])

        insights = [
            dict(id="ins_01", user_id=D, insight_type="overspend", title="Coffee spend is 3× your benchmark",      description="You spent ₹2,600 at Starbucks in June — 3× the recommended ₹800/mo.", severity="high",   detected_at=datetime(2024,7,1,tzinfo=timezone.utc)),
            dict(id="ins_02", user_id=D, insight_type="recurring", title="Netflix + Spotify overlap detected",      description="You pay ₹1,798/mo for both. Switching saves ₹1,149/mo.",            severity="medium", detected_at=datetime(2024,7,1,tzinfo=timezone.utc)),
            dict(id="ins_03", user_id=D, insight_type="positive",  title="Rent is within the safe ceiling",         description="At 23% of net income, your rent is under the 25% threshold.",       severity="low",    detected_at=datetime(2024,7,1,tzinfo=timezone.utc)),
        ]
        db.add_all([models.Insight(**i) for i in insights])

        await db.commit()
        print("Database seeded successfully.")
        print(f"Login: demo@finverse.app / Demo@2024")


if __name__ == "__main__":
    asyncio.run(seed_db())
