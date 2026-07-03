from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # PostgreSQL — asyncpg driver
    database_url: str = "postgresql+asyncpg://finverse:finverse@db:5432/finverse"

    # Firebase Admin SDK — service account fields
    # Get from Firebase Console > Project Settings > Service Accounts > Generate New Private Key
    firebase_project_id: str = ""
    firebase_client_email: str = ""
    firebase_private_key: str = ""  # The full PEM private key string

    # Gemini AI — reserved for future AI features
    gemini_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
