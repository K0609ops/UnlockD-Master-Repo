from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # PostgreSQL — asyncpg driver
    database_url: str = "postgresql+asyncpg://finverse:finverse@db:5432/finverse"

    # Firebase Admin SDK — service account fields
    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""

    # Gemini AI
    gemini_api_key: str = ""

    # JWT — used to sign tokens issued by our own /auth/login endpoint
    # Change this to a long random secret in production
    jwt_secret: str = "finverse-change-this-secret-in-production-2024"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
