"""
FastAPI application entrypoint.

Run locally:      uvicorn main:app --reload --host 0.0.0.0 --port 8000
Run in container: uvicorn main:app --host 0.0.0.0 --port 8000   (see Dockerfile)
"""
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import admin, analyze, auth, mock_analyze, users
from app.services.yolo_service import yolo_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to start without a signing key rather than serving an API where
    # every session token is forgeable. Raising here fails the container's health
    # check loudly instead of silently accepting an insecure default.
    from app.services.auth_service import require_jwt_secret

    require_jwt_secret()

    # RDS schema is managed via scripts/init_db.sql + scripts/migrate_add_columns.py.
    # Table auto-creation is opt-in for local/dev only.
    if os.getenv("AUTO_CREATE_TABLES", "false").lower() == "true":
        from app.database import create_all_tables

        await create_all_tables()

    # Load the YOLO model into memory once so the first real request isn't slow.
    yolo_service.load()
    yield


app = FastAPI(title="Nutritionell Backend", lifespan=lifespan)

# Auth is a bearer token, not a cookie, so allow_credentials stays off — the
# browser never needs to attach cookies cross-origin for this API. What does
# matter is that `Authorization` is an allowed request header.
ALLOWED_ORIGINS = [
    "http://localhost:3000",           # local Next.js dev
    "https://app.nutritionell.com",    # deployed frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(auth.router)
# Temporary admin-approval gate — remove with the rest of the feature.
app.include_router(admin.router)
app.include_router(users.router)
app.include_router(analyze.router)
app.include_router(mock_analyze.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/model")
async def health_model() -> dict:
    return yolo_service.health()
