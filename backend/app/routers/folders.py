from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Folder, Project
from app.schemas import FolderCreate, FolderUpdate, FolderResponse, FolderTreeResponse, ProjectResponse

router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.post("", response_model=FolderResponse)
async def create_folder(body: FolderCreate, db: AsyncSession = Depends(get_db)):
    if body.parent_id is not None:
        result = await db.execute(select(Folder).where(Folder.id == body.parent_id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Parent folder not found")
    folder = Folder(name=body.name, parent_id=body.parent_id)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


@router.get("", response_model=List[FolderResponse])
async def list_folders(db: AsyncSession = Depends(get_db)):
    """Return flat list of all folders."""
    result = await db.execute(select(Folder).order_by(Folder.name))
    return result.scalars().all()


@router.get("/tree", response_model=List[FolderTreeResponse])
async def get_folder_tree(db: AsyncSession = Depends(get_db)):
    """Return nested folder tree with projects at each level."""
    # Load all folders
    result = await db.execute(
        select(Folder).options(selectinload(Folder.projects).selectinload(Project.versions))
    )
    all_folders = result.scalars().all()

    # Load root projects (no folder)
    proj_result = await db.execute(
        select(Project)
        .where(Project.folder_id.is_(None))
        .options(selectinload(Project.versions))
    )
    root_projects = proj_result.scalars().all()

    # Build lookup
    folder_map = {f.id: f for f in all_folders}

    def build_tree(folder: Folder) -> FolderTreeResponse:
        children_folders = [f for f in all_folders if f.parent_id == folder.id]
        return FolderTreeResponse(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            created_at=folder.created_at,
            children=[build_tree(c) for c in sorted(children_folders, key=lambda f: f.name)],
            projects=[
                ProjectResponse(
                    id=p.id, name=p.name, folder_id=p.folder_id,
                    created_at=p.created_at, updated_at=p.updated_at,
                    version_count=len(p.versions),
                )
                for p in folder.projects
            ],
        )

    # Root folders (no parent)
    root_folders = [f for f in all_folders if f.parent_id is None]
    tree = [build_tree(f) for f in sorted(root_folders, key=lambda f: f.name)]

    return tree


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int, body: FolderUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    if body.name is not None:
        folder.name = body.name
    if body.parent_id is not None:
        # Prevent circular references
        if body.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Cannot set folder as its own parent")
        folder.parent_id = body.parent_id
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    # Projects in this folder get folder_id set to NULL (orphaned to root)
    proj_result = await db.execute(select(Project).where(Project.folder_id == folder_id))
    for p in proj_result.scalars().all():
        p.folder_id = None
        db.add(p)
    await db.delete(folder)  # cascade deletes child folders
    await db.commit()
    return {"detail": "deleted"}
