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

from app.routers import analyze, mock_analyze, users
from app.services.yolo_service import yolo_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # RDS schema is managed via scripts/init_db.sql + scripts/migrate_add_columns.py.
    # Table auto-creation is opt-in for local/dev only.
    if os.getenv("AUTO_CREATE_TABLES", "false").lower() == "true":
        from app.database import create_all_tables

        await create_all_tables()

    # Load the YOLO model into memory once so the first real request isn't slow.
    yolo_service.load()
    yield


app = FastAPI(title="Nutritionell Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(analyze.router)
app.include_router(mock_analyze.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/health/model")
async def health_model() -> dict:
    return yolo_service.health()
