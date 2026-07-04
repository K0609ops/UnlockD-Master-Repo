"""
Authentication router — email/password and Google OAuth flows.
Issues a signed JWT on successful authentication, and HttpOnly refresh cookies.
"""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from database import get_db
from models import User
from schemas import (
    GoogleAuthRequest, EmailLoginRequest, RegisterRequest,
    AuthResponse, UserPublic,
)
from limiter import limiter

router = APIRouter()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _create_access_token(user_id: str) -> str:
    # Short-lived access token (15 mins)
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    payload = {"sub": user_id, "exp": expire, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

def _create_refresh_token(user_id: str) -> str:
    # Long-lived refresh token (7 days)
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": user_id, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ---------------------------------------------------------------------------
# Firebase Admin SDK — optional, only initialised when keys are present
# ---------------------------------------------------------------------------
def _init_firebase():
    if firebase_admin._apps:
        return
    if not (settings.firebase_project_id and settings.firebase_client_email and settings.firebase_private_key):
        print("INFO: Firebase Admin SDK not configured — Google sign-in disabled.")
        return
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": settings.firebase_project_id,
        "client_email": settings.firebase_client_email,
        "private_key": settings.firebase_private_key.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)


_init_firebase()


# ---------------------------------------------------------------------------
# POST /auth/register  — email/password signup
# ---------------------------------------------------------------------------
@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered.")

    user = User(
        id=str(uuid.uuid4()),
        email=payload.email,
        username=payload.username,
        password=_hash_password(payload.password),
        monthly_income=payload.monthly_income,
        hours_per_week=payload.hours_per_week,
        auth_provider="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    refresh_token = _create_refresh_token(user.id)
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="lax", max_age=7*24*60*60)

    return AuthResponse(
        user=UserPublic.model_validate(user),
        access_token=_create_access_token(user.id),
        is_new_user=True,
        message="Account created.",
    )


# ---------------------------------------------------------------------------
# POST /auth/login  — email/password login
# ---------------------------------------------------------------------------
@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(request: Request, response: Response, payload: EmailLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if not user or not user.password:
        raise HTTPException(status_code=401, detail="Invalid credentials.")
    if not _verify_password(payload.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    refresh_token = _create_refresh_token(user.id)
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="lax", max_age=7*24*60*60)

    return AuthResponse(
        user=UserPublic.model_validate(user),
        access_token=_create_access_token(user.id),
        is_new_user=False,
        message="Login successful.",
    )


# ---------------------------------------------------------------------------
# POST /auth/google  — Firebase ID token verification
# ---------------------------------------------------------------------------
@router.post("/google", response_model=AuthResponse)
@limiter.limit("10/minute")
async def google_auth(request: Request, response: Response, payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    if not firebase_admin._apps:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured on this server. Use email/password instead.",
        )

    try:
        decoded = firebase_auth.verify_id_token(payload.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {e}")

    uid = decoded["uid"]
    email = decoded.get("email", "")
    display_name = decoded.get("name") or email.split("@")[0]

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    is_new = False

    if not user:
        user = User(id=uid, email=email, username=display_name, auth_provider="google")
        db.add(user)
        await db.commit()
        await db.refresh(user)
        is_new = True

    refresh_token = _create_refresh_token(user.id)
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="lax", max_age=7*24*60*60)

    return AuthResponse(
        user=UserPublic.model_validate(user),
        access_token=_create_access_token(user.id),
        is_new_user=is_new,
        message="Account created." if is_new else "Login successful.",
    )

# ---------------------------------------------------------------------------
# POST /auth/refresh  — Issue new access token using refresh token cookie
# ---------------------------------------------------------------------------
@router.post("/refresh")
async def refresh_token(request: Request, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing.")
    
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type.")
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload.")
    except JWTError:
        raise HTTPException(status_code=401, detail="Refresh token expired or invalid.")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
        
    return {"access_token": _create_access_token(user.id), "token_type": "bearer"}

# ---------------------------------------------------------------------------
# POST /auth/logout  — Clear refresh token cookie
# ---------------------------------------------------------------------------
@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="lax")
    return {"message": "Logged out."}
