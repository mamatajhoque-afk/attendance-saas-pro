import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Config
    APP_NAME: str = "SaaS Attendance System"
    API_V1_STR: str = "/api/v1"
    
    # Security (Load from Env, or use unsafe default for local dev only)
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev_secret_key_change_this_in_prod")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 Days

    # Database (Auto-detects Render/Heroku Postgres)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./attendance.db")

    # Hardware / IoT Config
    ZK_API_KEY: str = os.getenv("ZK_API_KEY", "")
    ZK_API_URL: str = os.getenv("ZK_API_URL", "https://api.zkteco.cloud")

    # Fix for Render's "postgres://" URL format
    def get_database_url(self):
        if self.DATABASE_URL and self.DATABASE_URL.startswith("postgres://"):
            return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return self.DATABASE_URL

    class Config:
        env_file = ".env"

settings = Settings()