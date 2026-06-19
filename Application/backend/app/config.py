from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://nutritionell:nutritionell_secret@localhost:5432/nutritionell_db"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "nutritionell"
    postgres_password: str = "nutritionell_secret"
    postgres_db: str = "nutritionell_db"

    # Gemini
    gemini_api_key: str = ""

    # FastAPI
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
