from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = None


class ProjectRead(ProjectCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class VersionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    parent_id: UUID | None = None


class VersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    parent_id: UUID | None
    name: str
    status: str
    created_at: datetime
    updated_at: datetime


class SnapshotWrite(BaseModel):
    payload: dict[str, Any]
    expected_revision: int | None = Field(default=None, ge=1)


class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    region: str
    revision: int
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class HealthRead(BaseModel):
    status: Literal["ok"]
