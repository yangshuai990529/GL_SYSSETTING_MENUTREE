from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import router
from app.core.config import get_settings
from app.db import engine
from app.schemas import HealthRead

settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health", response_model=HealthRead, tags=["system"])
def health() -> HealthRead:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return HealthRead(status="ok")
