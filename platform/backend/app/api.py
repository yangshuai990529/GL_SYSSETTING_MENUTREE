from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AuditLog, DatasetSnapshot, Project, ProjectVersion
from app.schemas import (
    ProjectCreate,
    ProjectRead,
    SnapshotRead,
    SnapshotWrite,
    VersionCreate,
    VersionRead,
)

router = APIRouter(prefix="/api", tags=["platform"])


def get_project_or_404(db: Session, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def get_version_or_404(db: Session, project_id: UUID, version_id: UUID) -> ProjectVersion:
    version = db.get(ProjectVersion, version_id)
    if version is None or version.project_id != project_id:
        raise HTTPException(status_code=404, detail="版本不存在")
    return version


def audit(db: Session, project_id: UUID, action: str, version_id: UUID | None = None, region: str | None = None, detail: dict | None = None) -> None:
    db.add(AuditLog(project_id=project_id, version_id=version_id, region=region, action=action, detail=detail or {}))


@router.get("/projects", response_model=list[ProjectRead])
def list_projects(db: Session = Depends(get_db)) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.updated_at.desc())))


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)) -> Project:
    if db.scalar(select(Project.id).where(Project.name == body.name)):
        raise HTTPException(status_code=409, detail="项目名称已存在")
    project = Project(**body.model_dump())
    db.add(project)
    db.flush()
    audit(db, project.id, "project.create", detail={"name": project.name})
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}/versions", response_model=list[VersionRead])
def list_versions(project_id: UUID, db: Session = Depends(get_db)) -> list[ProjectVersion]:
    get_project_or_404(db, project_id)
    return list(db.scalars(select(ProjectVersion).where(ProjectVersion.project_id == project_id).order_by(ProjectVersion.created_at)))


@router.post("/projects/{project_id}/versions", response_model=VersionRead, status_code=status.HTTP_201_CREATED)
def create_version(project_id: UUID, body: VersionCreate, db: Session = Depends(get_db)) -> ProjectVersion:
    get_project_or_404(db, project_id)
    if body.parent_id:
        get_version_or_404(db, project_id, body.parent_id)
    if db.scalar(select(ProjectVersion.id).where(ProjectVersion.project_id == project_id, ProjectVersion.name == body.name)):
        raise HTTPException(status_code=409, detail="版本名称已存在")
    version = ProjectVersion(project_id=project_id, **body.model_dump())
    db.add(version)
    db.flush()
    audit(db, project_id, "version.create", version.id, detail={"name": version.name, "parent_id": str(version.parent_id) if version.parent_id else None})
    db.commit()
    db.refresh(version)
    return version


@router.get("/projects/{project_id}/versions/{version_id}/regions/{region}", response_model=SnapshotRead)
def get_snapshot(project_id: UUID, version_id: UUID, region: str, db: Session = Depends(get_db)) -> DatasetSnapshot:
    get_version_or_404(db, project_id, version_id)
    snapshot = db.scalar(select(DatasetSnapshot).where(DatasetSnapshot.version_id == version_id, DatasetSnapshot.region == region))
    if snapshot is None:
        raise HTTPException(status_code=404, detail="该区域尚无数据快照")
    return snapshot


@router.put("/projects/{project_id}/versions/{version_id}/regions/{region}", response_model=SnapshotRead)
def save_snapshot(project_id: UUID, version_id: UUID, region: str, body: SnapshotWrite, response: Response, db: Session = Depends(get_db)) -> DatasetSnapshot:
    get_version_or_404(db, project_id, version_id)
    snapshot = db.scalar(select(DatasetSnapshot).where(DatasetSnapshot.version_id == version_id, DatasetSnapshot.region == region).with_for_update())
    if snapshot is None:
        if body.expected_revision not in (None, 0):
            raise HTTPException(status_code=409, detail="快照尚未创建，请重新加载后保存")
        snapshot = DatasetSnapshot(version_id=version_id, region=region, payload=body.payload)
        db.add(snapshot)
        action = "snapshot.create"
    else:
        if body.expected_revision is not None and body.expected_revision != snapshot.revision:
            raise HTTPException(status_code=409, detail={"message": "数据已被其他修改覆盖，请重新加载", "revision": snapshot.revision})
        snapshot.payload = body.payload
        snapshot.revision += 1
        action = "snapshot.update"
    db.flush()
    audit(db, project_id, action, version_id, region, {"revision": snapshot.revision})
    db.commit()
    db.refresh(snapshot)
    response.headers["ETag"] = f'"{snapshot.revision}"'
    return snapshot
