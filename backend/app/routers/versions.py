import os
from datetime import datetime
from typing import List

import pandas as pd
from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, File
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import DataVersion, PlotLine, Project
from app.schemas import DataVersionResponse, DataVersionUpdate, SchemaField

router = APIRouter(prefix="/api/projects/{project_id}", tags=["versions"])


def _map_dtype(dtype) -> str:
    kind = dtype.kind
    if kind in ("i", "u"):
        return "int"
    if kind == "f":
        return "float"
    if kind in ("M",):
        return "datetime"
    return "str"


def _detect_schema(df: pd.DataFrame) -> list[dict[str, str]]:
    return [{"name": col, "dtype": _map_dtype(df[col].dtype)} for col in df.columns]


@router.post("/upload", response_model=dict)
async def upload_csv(
    project_id: int,
    file: UploadFile = File(...),
    label: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    upload_dir = os.path.join(".", "data", "uploads", str(project_id))
    os.makedirs(upload_dir, exist_ok=True)

    original_filename = file.filename or "unknown.csv"
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    stored_name = f"{timestamp}_{original_filename}"
    file_path = os.path.join(upload_dir, stored_name)

    contents = await file.read()
    file_size = len(contents)
    with open(file_path, "wb") as f:
        f.write(contents)

    try:
        df = pd.read_csv(file_path)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    schema = _detect_schema(df)
    row_count = len(df)
    version_label = label or original_filename

    version = DataVersion(
        project_id=project_id,
        label=version_label,
        file_path=file_path,
        original_filename=original_filename,
        schema_def=schema,
        row_count=row_count,
        file_size=file_size,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)

    return {
        "version": {
            "id": version.id,
            "project_id": version.project_id,
            "label": version.label,
            "file_path": version.file_path,
            "original_filename": version.original_filename,
            "schema_def": schema,
            "row_count": row_count,
            "file_size": file_size,
            "created_at": version.created_at.isoformat(),
        },
        "schema_fields": schema,
        "rows": row_count,
    }


@router.get("/versions", response_model=List[DataVersionResponse])
async def list_versions(project_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DataVersion)
        .where(DataVersion.project_id == project_id)
        .order_by(DataVersion.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/versions/{version_id}", response_model=DataVersionResponse)
async def update_version(
    project_id: int,
    version_id: int,
    body: DataVersionUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DataVersion).where(
            DataVersion.id == version_id,
            DataVersion.project_id == project_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    version.label = body.label
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


@router.delete("/versions/{version_id}")
async def delete_version(
    project_id: int,
    version_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DataVersion).where(
            DataVersion.id == version_id,
            DataVersion.project_id == project_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")
    # Check how many plot lines reference this version (will be SET NULL by FK)
    affected_result = await db.execute(
        select(func.count()).where(PlotLine.version_id == version_id)
    )
    affected_lines = affected_result.scalar() or 0

    # Clean up file
    if os.path.exists(version.file_path):
        os.remove(version.file_path)
    await db.delete(version)
    await db.commit()
    return {
        "detail": "deleted",
        "affected_plot_lines": affected_lines,
    }


@router.get("/versions/{version_id}/data")
async def get_version_data(
    project_id: int,
    version_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(0, ge=0, description="0 means all rows"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DataVersion).where(
            DataVersion.id == version_id,
            DataVersion.project_id == project_id,
        )
    )
    version = result.scalar_one_or_none()
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    df = pd.read_csv(version.file_path)
    total = len(df)
    if limit > 0:
        df = df.iloc[offset : offset + limit]
    elif offset > 0:
        df = df.iloc[offset:]
    return {
        "columns": list(df.columns),
        "rows": df.to_dict(orient="records"),
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/diff")
async def diff_versions(
    project_id: int,
    base_id: int = Query(...),
    compare_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    base_result = await db.execute(
        select(DataVersion).where(
            DataVersion.id == base_id, DataVersion.project_id == project_id
        )
    )
    base_version = base_result.scalar_one_or_none()

    compare_result = await db.execute(
        select(DataVersion).where(
            DataVersion.id == compare_id, DataVersion.project_id == project_id
        )
    )
    compare_version = compare_result.scalar_one_or_none()

    if base_version is None or compare_version is None:
        raise HTTPException(status_code=404, detail="Version not found")

    base_df = pd.read_csv(base_version.file_path)
    compare_df = pd.read_csv(compare_version.file_path)

    index_col = base_df.columns[0]
    numeric_cols = [
        c for c in base_df.columns
        if c != index_col and pd.api.types.is_numeric_dtype(base_df[c])
    ]

    merged = pd.merge(
        base_df[[index_col] + numeric_cols],
        compare_df[[index_col] + numeric_cols],
        on=index_col,
        how="outer",
        suffixes=("_base", "_compare"),
    ).fillna(0)

    def _native(val):
        """Convert numpy types to Python native for JSON serialization."""
        if hasattr(val, "item"):
            return val.item()
        return val

    base_records, compare_records, diff_records, diff_pct_records = [], [], [], []
    for _, row in merged.iterrows():
        idx_val = _native(row[index_col])
        base_row = {index_col: idx_val}
        compare_row = {index_col: idx_val}
        diff_row = {index_col: idx_val}
        diff_pct_row = {index_col: idx_val}
        for col in numeric_cols:
            b = float(row.get(f"{col}_base", 0))
            c = float(row.get(f"{col}_compare", 0))
            base_row[col] = b
            compare_row[col] = c
            diff_row[col] = c - b
            diff_pct_row[col] = (
                ((c - b) / b * 100) if b != 0 else (0.0 if c == 0 else float("inf"))
            )
        base_records.append(base_row)
        compare_records.append(compare_row)
        diff_records.append(diff_row)
        diff_pct_records.append(diff_pct_row)

    return {
        "index_column": index_col,
        "columns": numeric_cols,
        "base": base_records,
        "compare": compare_records,
        "diff": diff_records,
        "diff_pct": diff_pct_records,
    }
