import asyncio
from datetime import datetime, timezone
import uuid
from sqlalchemy import select
from database import engine, AsyncSessionLocal
import models
from models import Base

async def seed_db():
    async with engine.begin() as conn:
        print("Dropping existing tables...")
        await conn.run_sync(Base.metadata.drop_all)
        print("Creating tables...")
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        print("Seeding demo data...")
        
        # Check if demo user already exists
        demo_email = "demo@finverse.app"
        result = await db.execute(select(models.User).where(models.User.email == demo_email))
        existing_user = result.scalar_one_or_none()
        
        D = 'demo_priya_001'
        if existing_user:
            print("Demo user already exists. Cleaning up old data...")
            # We rely on cascading deletes for relations, so we just delete the user.
            await db.delete(existing_user)
            await db.commit()

        print("Inserting User...")
        user = models.User(
            id=D,
            email=demo_email,
            username="Kalhara Biju",
            password="Demo@2024",
            monthly_income=95000,
            hours_per_week=42,
            target_savings_percentage=30,
            created_at=datetime.strptime('2024-04-01T00:00:00Z', "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc),
            auth_provider="email"
        )
        db.add(user)

        PA, SA, IA = 'acc_p1', 'acc_s1', 'acc_i1'
        db.add_all([
            models.Account(id=PA, user_id=D, accountType='primary', balance=31800, createdAt='2024-04-01T00:00:00Z'),
            models.Account(id=SA, user_id=D, accountType='savings', balance=108000, createdAt='2024-04-01T00:00:00Z'),
            models.Account(id=IA, user_id=D, accountType='investment', balance=145000, createdAt='2024-04-01T00:00:00Z')
        ])

        transactions = [
            # MAY 2024
            dict(id='tx_m01', user_id=D, type='income', amount=95000, category='Salary', merchant='Infosys Ltd', description='Monthly CTC', transaction_date='2024-05-01', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-05-01T09:00:00Z'),
            dict(id='tx_m02', user_id=D, type='expense', amount=22000, category='Rent', merchant='GreenWood Residency', description='May rent', transaction_date='2024-05-02', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-05-02T10:00:00Z'),
            dict(id='tx_m03', user_id=D, type='expense', amount=4200, category='Groceries', merchant='BigBasket', description='Monthly groceries', transaction_date='2024-05-04', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-05-04T11:00:00Z'),
            dict(id='tx_m04', user_id=D, type='expense', amount=1499, category='Subscriptions', merchant='Netflix', description='Premium plan', transaction_date='2024-05-05', payment_method='Credit Card', is_recurring=True, regret_tag=None, created_at='2024-05-05T12:00:00Z'),
            dict(id='tx_m06', user_id=D, type='expense', amount=5800, category='Dining', merchant='Smoke House Deli', description='Friends dinner', transaction_date='2024-05-08', payment_method='Credit Card', is_recurring=False, regret_tag='bad', created_at='2024-05-08T20:00:00Z'),
            dict(id='tx_m08', user_id=D, type='expense', amount=2500, category='Health', merchant='Cult.fit', description='Monthly gym', transaction_date='2024-05-10', payment_method='UPI', is_recurring=True, regret_tag='good', created_at='2024-05-10T07:00:00Z'),
            dict(id='tx_m09', user_id=D, type='goal', amount=12000, category='Savings Goal', merchant='Emergency Fund', description='Monthly deposit to Savings (acc_s1)', transaction_date='2024-05-12', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-05-12T09:00:00Z', goal_id='goal_001'),
            
            # JUNE 2024
            dict(id='tx_j01', user_id=D, type='income', amount=95000, category='Salary', merchant='Infosys Ltd', description='Monthly CTC', transaction_date='2024-06-01', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-06-01T09:00:00Z'),
            dict(id='tx_j02', user_id=D, type='expense', amount=22000, category='Rent', merchant='GreenWood Residency', description='June rent', transaction_date='2024-06-02', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-06-02T10:00:00Z'),
            dict(id='tx_j03', user_id=D, type='expense', amount=4600, category='Groceries', merchant='BigBasket', description='Monthly groceries', transaction_date='2024-06-04', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-06-04T11:00:00Z'),
            dict(id='tx_j06', user_id=D, type='expense', amount=3600, category='Dining', merchant='Social — Koramangala', description='Birthday celebration', transaction_date='2024-06-07', payment_method='Credit Card', is_recurring=False, regret_tag='bad', created_at='2024-06-07T20:00:00Z'),
            dict(id='tx_j08', user_id=D, type='expense', amount=2500, category='Health', merchant='Cult.fit', description='Monthly gym', transaction_date='2024-06-10', payment_method='UPI', is_recurring=True, regret_tag='good', created_at='2024-06-10T07:00:00Z'),
            dict(id='tx_j09', user_id=D, type='goal', amount=12000, category='Savings Goal', merchant='Emergency Fund', description='Monthly deposit to Savings (acc_s1)', transaction_date='2024-06-12', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-06-12T09:00:00Z', goal_id='goal_001'),
            dict(id='tx_j10', user_id=D, type='goal', amount=5000, category='Savings Goal', merchant='Goa Trip Fund', description='Trip savings deposit (acc_s1)', transaction_date='2024-06-13', payment_method='Bank Transfer', is_recurring=False, regret_tag=None, created_at='2024-06-13T09:30:00Z', goal_id='goal_002'),
            
            # JULY 2024
            dict(id='tx_l01', user_id=D, type='income', amount=95000, category='Salary', merchant='Infosys Ltd', description='Monthly CTC', transaction_date='2024-07-01', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-07-01T09:00:00Z'),
            dict(id='tx_l02', user_id=D, type='expense', amount=22000, category='Rent', merchant='GreenWood Residency', description='July rent', transaction_date='2024-07-02', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-07-02T10:00:00Z'),
            dict(id='tx_l03', user_id=D, type='expense', amount=3800, category='Groceries', merchant='BigBasket', description='Weekly groceries', transaction_date='2024-07-04', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-07-04T11:00:00Z'),
            dict(id='tx_l06', user_id=D, type='expense', amount=2500, category='Health', merchant='Cult.fit', description='Monthly gym', transaction_date='2024-07-06', payment_method='UPI', is_recurring=True, regret_tag='good', created_at='2024-07-06T07:00:00Z'),
            dict(id='tx_l07', user_id=D, type='goal', amount=12000, category='Savings Goal', merchant='Emergency Fund', description='Monthly deposit to Savings (acc_s1)', transaction_date='2024-07-08', payment_method='Bank Transfer', is_recurring=True, regret_tag=None, created_at='2024-07-08T09:00:00Z', goal_id='goal_001'),
            
            # Additional detailed timestamp account transfers
            dict(id='tx_l_tr1', user_id=D, type='expense', amount=10000, category='Transfer', merchant='Investment Account', description='Primary (acc_p1) to Investment (acc_i1)', transaction_date='2024-07-10', payment_method='Internal Transfer', is_recurring=False, regret_tag=None, created_at='2024-07-10T14:32:15Z'),

            # Minor Everyday Spend to fill the graph and prevent flatlines
            # May minor spend
            dict(id='tx_m_min1', user_id=D, type='expense', amount=350, category='Dining', merchant='Third Wave Coffee', description='Coffee', transaction_date='2024-05-03', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-05-03T09:15:00Z'),
            dict(id='tx_m_min2', user_id=D, type='expense', amount=850, category='Transport', merchant='Uber', description='Office ride', transaction_date='2024-05-06', payment_method='Credit Card', is_recurring=False, regret_tag=None, created_at='2024-05-06T18:30:00Z'),
            dict(id='tx_m_min3', user_id=D, type='expense', amount=1200, category='Dining', merchant='Swiggy', description='Late dinner', transaction_date='2024-05-15', payment_method='UPI', is_recurring=False, regret_tag='bad', created_at='2024-05-15T22:45:00Z'),
            dict(id='tx_m_min4', user_id=D, type='expense', amount=400, category='Transport', merchant='Namma Yatri', description='Auto to metro', transaction_date='2024-05-22', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-05-22T08:45:00Z'),
            dict(id='tx_m_min5', user_id=D, type='expense', amount=2500, category='Shopping', merchant='Zara', description='Summer shirt', transaction_date='2024-05-28', payment_method='Credit Card', is_recurring=False, regret_tag='bad', created_at='2024-05-28T16:20:00Z'),
            
            # June minor spend
            dict(id='tx_j_min1', user_id=D, type='expense', amount=450, category='Dining', merchant='Starbucks', description='Latte', transaction_date='2024-06-03', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-06-03T10:10:00Z'),
            dict(id='tx_j_min2', user_id=D, type='expense', amount=980, category='Dining', merchant='Zomato', description='Lunch order', transaction_date='2024-06-08', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-06-08T13:25:00Z'),
            dict(id='tx_j_min3', user_id=D, type='expense', amount=750, category='Transport', merchant='Uber', description='Rain surge pricing', transaction_date='2024-06-15', payment_method='Credit Card', is_recurring=False, regret_tag='bad', created_at='2024-06-15T19:40:00Z'),
            dict(id='tx_j_min4', user_id=D, type='expense', amount=300, category='Dining', merchant='Third Wave Coffee', description='Cold brew', transaction_date='2024-06-19', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-06-19T14:15:00Z'),
            dict(id='tx_j_min5', user_id=D, type='expense', amount=1800, category='Shopping', merchant='Myntra', description='Shoes', transaction_date='2024-06-25', payment_method='Credit Card', is_recurring=False, regret_tag=None, created_at='2024-06-25T21:00:00Z'),
            dict(id='tx_j_min6', user_id=D, type='expense', amount=550, category='Transport', merchant='BluSmart', description='Ride home', transaction_date='2024-06-29', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-06-29T20:10:00Z'),
            
            # July minor spend
            dict(id='tx_l_min1', user_id=D, type='expense', amount=380, category='Dining', merchant='Third Wave Coffee', description='Morning coffee', transaction_date='2024-07-03', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-07-03T08:45:00Z'),
            dict(id='tx_l_min2', user_id=D, type='expense', amount=1100, category='Dining', merchant='Swiggy', description='Pizza craving', transaction_date='2024-07-05', payment_method='UPI', is_recurring=False, regret_tag='bad', created_at='2024-07-05T23:10:00Z'),
            dict(id='tx_l_min3', user_id=D, type='expense', amount=450, category='Transport', merchant='Uber', description='Short ride', transaction_date='2024-07-07', payment_method='Credit Card', is_recurring=False, regret_tag=None, created_at='2024-07-07T11:20:00Z'),
            dict(id='tx_l_min4', user_id=D, type='expense', amount=600, category='Personal Care', merchant='Pharmacy', description='Meds', transaction_date='2024-07-09', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-07-09T18:00:00Z'),
            dict(id='tx_l_min5', user_id=D, type='expense', amount=890, category='Dining', merchant='Zomato', description='Lunch', transaction_date='2024-07-11', payment_method='UPI', is_recurring=False, regret_tag=None, created_at='2024-07-11T13:40:00Z'),
        ]
        
        db.add_all([models.Transaction(**t) for t in transactions])

        recurring = [
            dict(id='rec_01', user_id=D, merchant='GreenWood Residency', amount=22000, frequency='monthly', next_expected_date='2024-08-02', confidence_score=99),
            dict(id='rec_02', user_id=D, merchant='Netflix', amount=1499, frequency='monthly', next_expected_date='2024-08-05', confidence_score=98),
            dict(id='rec_03', user_id=D, merchant='Cult.fit', amount=2500, frequency='monthly', next_expected_date='2024-08-06', confidence_score=96),
        ]
        db.add_all([models.RecurringTransaction(**r) for r in recurring])

        goals = [
            dict(id='goal_001', user_id=D, name='Emergency Fund (6 months)', target_amount=300000, current_amount=108000, target_date='2025-06-01', priority=1),
            dict(id='goal_002', user_id=D, name='Goa Trip — December', target_amount=45000, current_amount=15000, target_date='2024-11-30', priority=2),
            dict(id='goal_003', user_id=D, name='MacBook Pro M4', target_amount=220000, current_amount=40000, target_date='2025-04-01', priority=3),
        ]
        db.add_all([models.Goal(**g) for g in goals])

        contracts = [
            dict(id='con_01', user_id=D, category='Dining', cap_amount=4000, start_date='2024-07-01', end_date='2024-07-31', status='active', streak_count=12),
            dict(id='con_02', user_id=D, category='Shopping', cap_amount=5000, start_date='2024-07-01', end_date='2024-07-31', status='active', streak_count=12),
        ]
        db.add_all([models.Contract(**c) for c in contracts])

        sacrifices = [
            dict(id='sac_01', user_id=D, amount_saved=2600, category='Personal Care', resolved_at='2024-06-30T00:00:00Z', goal_days_saved=3),
            dict(id='sac_02', user_id=D, amount_saved=4500, category='Shopping', resolved_at='2024-06-20T00:00:00Z', goal_days_saved=6),
        ]
        db.add_all([models.Sacrifice(**s) for s in sacrifices])

        insights = [
            dict(id='ins_01', user_id=D, insight_type='overspend', title='Coffee spend is 3× your benchmark', description='You spent ₹2,600 at Starbucks in June — 3× the recommended ₹800/mo. Skipping 5 visits/month saves ₹1,600 — that’s 2 extra days toward your MacBook goal.', severity='high', detected_at='2024-07-01T00:00:00Z'),
            dict(id='ins_02', user_id=D, insight_type='recurring', title='Netflix + Spotify overlap detected', description='You pay ₹1,798/mo for both. Switching to a Family plan (₹649) saves ₹1,149/mo — ₹13,788/year. That alone covers 30% of your Goa Trip.', severity='medium', detected_at='2024-07-01T00:00:00Z'),
            dict(id='ins_03', user_id=D, insight_type='positive', title='Rent is within the safe ceiling', description='At 23% of net income, your rent is under the 25% threshold. You have ₹2,000/mo headroom before it becomes a pressure point.', severity='low', detected_at='2024-07-01T00:00:00Z'),
        ]
        db.add_all([models.Insight(**i) for i in insights])

        await db.commit()
        print("Database seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_db())
