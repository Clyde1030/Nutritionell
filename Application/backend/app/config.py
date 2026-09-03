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

    # YOLO product detector
    yolo_conf_threshold: float = 0.25
    yolo_iou_threshold: float = 0.4
    yolo_max_detections: int = 40

    # FastAPI
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # ── Auth ──────────────────────────────────────────────────────────────────
    # No default on purpose. An empty value is a hard startup failure (see
    # main.py's lifespan) rather than a quiet fallback, because a guessable
    # signing key means anyone can mint a token for any user. In deployment this
    # comes from Secrets Manager as JWT_SECRET_KEY — see
    # infra/AWS_SETUP_LOGIN_FEATURE.md.
    jwt_secret_key: str = ""
    # Single long-lived access token. Documented simplification: there is no
    # refresh-token rotation in this pass, so the window is wide.
    jwt_access_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30

    # Base URL of the frontend, used to build the password-reset link. Settable
    # to http://localhost:3000 for local testing.
    app_base_url: str = "https://app.nutritionell.com"

    # ── Email (AWS SES) ───────────────────────────────────────────────────────
    aws_region: str = "us-east-1"
    ses_from_address: str = "no-reply@nutritionell.com"
    # Where "someone new signed up" notifications go while the temporary
    # admin-approval gate is in place.
    admin_notification_email: str = "nutritionell@gmail.com"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
