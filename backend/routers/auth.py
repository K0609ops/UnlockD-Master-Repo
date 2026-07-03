import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from database import get_db
from models import User
from schemas import GoogleAuthRequest, AuthResponse, UserResponse

router = APIRouter()

# ---------------------------------------------------------------------------
# Initialize Firebase Admin SDK (once, on first import)
# ---------------------------------------------------------------------------
def _init_firebase():
    if firebase_admin._apps:
        return
    if not settings.firebase_project_id or not settings.firebase_client_email or not settings.firebase_private_key:
        # Running without Firebase Admin — token verification will be skipped in dev mode
        print("WARNING: Firebase Admin SDK not configured. Token verification disabled.")
        return
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": settings.firebase_project_id,
        "client_email": settings.firebase_client_email,
        # Private key in .env is a single-line string — restore actual newlines
        "private_key": settings.firebase_private_key.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    })
    firebase_admin.initialize_app(cred)


_init_firebase()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/google", response_model=AuthResponse, status_code=status.HTTP_200_OK)
async def google_auth(payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """
    Verify a Firebase ID token and upsert the user in PostgreSQL.
    Called by the frontend after Google sign-in.
    """
    # Verify token with Firebase Admin
    try:
        if firebase_admin._apps:
            decoded = firebase_auth.verify_id_token(payload.id_token)
            uid = decoded["uid"]
            email = decoded.get("email", "")
            display_name = decoded.get("name") or email.split("@")[0]
        else:
            # Dev mode fallback — extract claims without verification
            # DO NOT use this in production without Firebase configured
            import base64, json as _json
            parts = payload.id_token.split(".")
            padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
            decoded_payload = _json.loads(base64.urlsafe_b64decode(padded))
            uid = decoded_payload.get("sub", "dev_uid")
            email = decoded_payload.get("email", "dev@finverse.app")
            display_name = decoded_payload.get("name", email.split("@")[0])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Firebase token: {str(e)}"
        )

    # Check if user already exists
    result = await db.execute(select(User).where(User.id == uid))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        return AuthResponse(
            user=UserResponse.model_validate(existing_user),
            message="Login successful.",
            is_new_user=False,
        )

    # Create new user
    new_user = User(
        id=uid,
        email=email,
        username=display_name,
        auth_provider="google",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return AuthResponse(
        user=UserResponse.model_validate(new_user),
        message="Account created.",
        is_new_user=True,
    )
