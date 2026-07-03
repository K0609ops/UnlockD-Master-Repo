from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import engine, Base
from routers import auth, users, finance, groups

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(
    title="FINVERSE API",
    version="1.0.0",
    description="FINVERSE Backend — Financial Intelligence Engine with PostgreSQL persistence.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(finance.router, prefix="/finance", tags=["Finance State"])
app.include_router(groups.router, prefix="/groups", tags=["Groups & Bill Splitting"])


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "FINVERSE API", "version": "1.0.0"}
