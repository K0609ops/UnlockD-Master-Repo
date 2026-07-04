# Finverse: Financial Intelligence Engine

An enterprise-grade, behavioral-finance-driven wealth operating system. **Finverse** shifts users from retrospective tracking to active, algorithmic wealth preservation. It couples a glassmorphic React 19 frontend with an asynchronous Python/FastAPI backend, engineered specifically to enforce strict mathematical precision, concurrency control, and zero-trust security.

---

## 1. System Architecture

```
[ Client Layer (React 19 + TypeScript) ]
       │ (decimal.js, Framer Motion, Recharts)
       ▼ [ Secure TLS Channel ]
[ Gateway Layer (IP-based Rate Limiting via slowapi) ]
       │ 
       ▼ 
[ Application Layer (FastAPI Async ASGI) ] ─── [ Impulse Negotiation Engine ]
       │                                            │ (Local Heuristics / Gemini AI)
       ▼ (SQLAlchemy Async ORM via asyncpg)        ▼
[ Database Layer (PostgreSQL Cluster) ] ◄───────────┘
       │ (Numeric(12,2), Row-Level Isolation)

```

The Finverse infrastructure is built on a decoupled, containerized architecture managed via `docker-compose`.

* **Frontend Interface:** High-performance single-page application built using **React 19**, **TypeScript**, and **Vite**. UI computation handles exact numeric scaling locally via `decimal.js`, preventing floating-point drift before rendering data to the viewport.
* **Asynchronous API Backend:** Powered by **Python 3.11** and **FastAPI**. Operating on an ASGI runtime loop, the backend architecture handles high-concurrency connections natively using non-blocking I/O via **SQLAlchemy Async ORM** and the **asyncpg** native driver.
* **Security & Gatekeeping:** Infrastructure traffic passes through an embedded **slowapi** rate-limiting middleware configured to prevent programmatic brute-force resource exhausting attacks at the network layer.

---

## 2. Mathematical Framework & Core Logic

### The "Safe-to-Spend" Formulation

Traditional banking systems display raw liquidity pools ($B_{raw}$), resulting in reactive impulse spending. Finverse recalculates absolute spending margins dynamically by applying a 30-day discretionary forecast against hard commitments:

$$\text{Safe-to-Spend} = B_{primary} + I_{expected} - \left( \sum_{i=1}^{n} E_{fixed\_i} + \sum_{j=1}^{m} G_{allocated\_j} + \lambda \cdot I_{expected} \right) - V_{discretionary}$$

Where:

* $B_{primary}$: Real-time balance computed directly from the primary account entity.
* $I_{expected}$: Base monthly income parameter scoped to the active user profile.
* $E_{fixed}$: Summation of all recurring transactional contracts due within a rolling 15-day window.
* $G_{allocated}$: Total capital allocations directed toward active, incomplete financial goals.
* $\lambda$: Dynamic safety buffer coefficient (hardcoded to $0.10$ for a strict 10% reserve margin).
* $V_{discretionary}$: Rolling 30-day average daily burn rate calculated from variable discretionary items.

### Feature 6: The Impulse Negotiation Engine Risk Pipeline

Before approving an un-logged variable expense request, the engine runs parallel 30-day projection matrices. It compares the **Baseline Forecast** against a simulated **Scenario Forecast** ($B_{primary} - \text{Amount}_{purchase}$). The lowest dipping point ($P_{min}$) within the 30-day projection array dictates the system response state:

$$\text{Risk Status} = \begin{cases} 
\text{sunny} & P_{min} \ge ₹15,000 \\
\text{cloudy} & ₹5,000 \le P_{min} < ₹15,000 \\
\text{rainy} & ₹0 \le P_{min} < ₹5,000 \\
\text{storm} & P_{min} < ₹0 
\end{cases}$$

* **Condition A ($P_{min} \ge ₹0$):** Scenario risk maps to sunny, cloudy, or rainy. The system yields an informative warning message and allows transaction logging.
* **Condition B ($P_{min} < ₹0$):** Scenario risk maps to storm. The threshold engine triggers a hard stop, blocking transaction logging and prompting the client interface to handle the entry as a **Sacrifice** (capital preserved).

---

## 3. Database Schema Design

The relational database layer enforces total entity integrity and hard data-type constraints in PostgreSQL. Floating-point types (`FLOAT`, `REAL`) are strictly banned in favor of exact fixed-point decimals.

```sql
-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    monthly_income NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Accounts Table (Supports dynamic asset reallocation)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_type VARCHAR(50) NOT NULL, -- 'primary', 'savings', 'investment'
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_positive_balance CHECK (balance >= 0)
);

-- 3. Upgraded Transactions Table (ACID Compliant Transfers + Behavioral Tags)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    amount NUMERIC(12, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT,
    behavioral_tag VARCHAR(20), -- 'happy', 'regrettable', 'sacrifice'
    status VARCHAR(20) NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'reversed'
    idempotency_key UUID UNIQUE NOT NULL, -- Structural double-spend guard
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes optimized for pagination and analytics query patterns
CREATE INDEX idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);

```

---

## 4. Technical Problem Solving & Engineering Overhauls

### Concurrency Controls for Atomic Transfers

* **The Problem:** In a high-concurrency situation (such as network retries or a user double-clicking a submit button), a race condition could allow multiple simultaneous transfer requests to bypass the balance verification step, causing an account overdraft or double-deduction.
* **The Solution:** The backend implements strict **ACID-compliant atomic locking block execution**. Using PostgreSQL `SELECT ... FOR UPDATE` query operations, the application establishes row-level locks on the target account records inside an isolated database transaction block:

```python
# System transaction execution sequence
async def execute_atomic_transfer(db, from_id, to_id, amount, idempotency_key):
    # Idempotency validation to check for duplicate requests
    if await check_duplicate(db, idempotency_key):
        return get_existing_transaction(idempotency_key)
        
    async with db.begin():
        # Order resource locks by primary key to strictly prevent database deadlocks
        first_lock, second_lock = sorted([from_id, to_id])
        await db.execute(select(Account).where(Account.id == first_lock).with_for_update())
        await db.execute(select(Account).where(Account.id == second_lock).with_for_update())
        
        # Isolated state updates
        sender = await db.get(Account, from_id)
        if sender.balance < amount:
            raise InsufficientFundsException()
            
        await db.execute(update(Account).where(Account.id == from_id).values(balance=Account.balance - amount))
        await db.execute(update(Account).where(Account.id == to_id).values(balance=Account.balance + amount))
        # Log transaction row...

```

### Complete Eradication of IEEE-754 Float Drift

* **The Problem:** Standard JavaScript and Python floating-point operations introduce native precision losses ($0.1 + 0.2 = 0.30000000000000004$), which can lead to compounding arithmetic discrepancies over large datasets.
* **The Solution:** The application stack enforces fixed-point decimal scaling. Calculations are stored in PostgreSQL using the explicit `Numeric(12,2)` type, processed in Python via native `Decimal` objects, and computed on the client side using `decimal.js`.

### Zero-Trust Session Management & JWT Scoping

* **The Problem:** Storing session authentication tokens inside standard client-side `localStorage` exposes application configurations to Cross-Site Scripting (XSS) script injections and data hijacking.
* **The Solution:** The authentication pipeline was re-architected to utilize split-token mechanics:
1. **Short-Lived Access Tokens:** Emitted directly in short memory scopes for authorization headers.
2. **HttpOnly Cookies:** Rotation refresh tokens are locked entirely out of client JavaScript reach via secure HTTP configurations (`HttpOnly`, `Secure`, `SameSite=Strict`), eliminating direct storage vulnerabilities.
3. **Strict State Isolation:** Removed insecure client-side state mutations. All transaction ledger modifications are validated on the backend using JWT scoping, protecting the application against Insecure Direct Object Reference (IDOR) exploits.



---

## 5. Deployment & Local Installation

### Prerequisites

Ensure your environment meets these hardware/software minimum dependencies:

* Docker Desktop / Engine v24.0.0+
* Docker Compose v2.20.0+
* Node.js v20+ *(Optional, only for native host running without containers)*
* Python v3.11+ *(Optional, only for native host running without containers)*

### Option A: Fully Containerized Infrastructure Orchestration (Recommended)

This approach mounts the complete UI layer, async API backend instance, and isolated database cluster via secure networks directly inside isolated containers.

**1. Clone the Source Repository**

```bash
git clone https://github.com/your-username/finverse.git
cd finverse

```

**2. Configure Environmental Parameter Keyrings**
Create an environment configurations file named `.env` inside the root directory:

```env
# Database Credentials Set
POSTGRES_USER=finverse_admin
POSTGRES_PASSWORD=secure_vault_pass
POSTGRES_DB=finverse_production
DATABASE_URL=postgresql+asyncpg://finverse_admin:secure_vault_pass@db:5432/finverse_production

# Authentication Secret Arrays
JWT_SECRET_KEY=generate_a_cryptographically_secure_random_hex_string_here
ALGORITHM=HS256

# External Integration Configuration Elements
GEMINI_API_KEY=your_production_gemini_api_credential_token

```

**3. Build and Provision Image Networks**
Execute the Docker compose orchestrator instructions to compile individual build context layers, provision volumes, and initiate internal servers:

```bash
docker-compose up --build -d

```

**4. Execute Database Relational Migrations**
Once the services stabilize, trigger Alembic asynchronous schema mapping runs across the stateful database layer container:

```bash
docker-compose exec api alembic upgrade head

```

**5. System Health Access Ports**

* **Client Interface App Layer:** `http://localhost:5173`
* **Backend OpenAPI Swagger Playground UI:** `http://localhost:8000/docs`

---

### Option B: Bare-Metal Local Development Framework Run

If managing processes manually outside container boundaries:

**1. Database Cluster Configuration**
Spin up a local PostgreSQL engine, verify it maps cleanly to the targeted network configurations, and apply the exact structural fields defined in the `schema` parameters.

**2. Run Backend API Instance Engine**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

```

**3. Run Frontend UI Interface Context**

```bash
cd frontend
npm install
npm run dev

```
