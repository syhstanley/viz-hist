import json
import os
import uuid
from typing import List

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, File
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

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


def _to_records(df: pd.DataFrame) -> list[dict]:
    """Convert a DataFrame to JSON-safe records.

    NaN / +-inf become null so the response is valid JSON, and numpy
    scalar types are converted to native Python types.
    """
    df = df.replace([np.inf, -np.inf], np.nan)
    return json.loads(df.to_json(orient="records", date_format="iso"))


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

    # Sanitize: strip any path components from the client-supplied filename
    original_filename = os.path.basename(file.filename or "") or "unknown.csv"
    stored_name = f"{uuid.uuid4().hex}.csv"
    file_path = os.path.join(upload_dir, stored_name)

    # Stream to disk in chunks to avoid loading the whole file into memory
    file_size = 0
    with open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
            file_size += len(chunk)

    try:
        df = await run_in_threadpool(pd.read_csv, file_path)
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

    # Delete DB row first, then the file — if the commit fails we keep the
    # file; an orphan file is recoverable, a dangling DB row pointing at a
    # deleted file is not.
    file_path = version.file_path
    await db.delete(version)
    await db.commit()
    if os.path.exists(file_path):
        os.remove(file_path)
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

    df = await run_in_threadpool(pd.read_csv, version.file_path)
    total = len(df)
    if limit > 0:
        df = df.iloc[offset : offset + limit]
    elif offset > 0:
        df = df.iloc[offset:]
    return {
        "columns": list(df.columns),
        "rows": _to_records(df),
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

    base_df = await run_in_threadpool(pd.read_csv, base_version.file_path)
    compare_df = await run_in_threadpool(pd.read_csv, compare_version.file_path)

    index_col = base_df.columns[0]
    if index_col not in compare_df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Compare version is missing index column '{index_col}'",
        )

    def _numeric_cols(df: pd.DataFrame) -> set:
        return {
            c for c in df.columns
            if c != index_col and pd.api.types.is_numeric_dtype(df[c])
        }

    # Only diff columns that are numeric in BOTH versions (schemas may differ)
    common = _numeric_cols(base_df) & _numeric_cols(compare_df)
    numeric_cols = [c for c in base_df.columns if c in common]
    if not numeric_cols:
        raise HTTPException(
            status_code=400,
            detail="No common numeric columns between the two versions",
        )

    merged = pd.merge(
        base_df[[index_col] + numeric_cols],
        compare_df[[index_col] + numeric_cols],
        on=index_col,
        how="outer",
        suffixes=("_base", "_compare"),
    )

    # Vectorized computation. Missing rows stay NaN (-> null in JSON) so the
    # client can distinguish "absent in this version" from an actual 0.
    base_vals = merged[[f"{c}_base" for c in numeric_cols]].to_numpy(dtype=float)
    compare_vals = merged[[f"{c}_compare" for c in numeric_cols]].to_numpy(dtype=float)
    diff_vals = compare_vals - base_vals
    with np.errstate(divide="ignore", invalid="ignore"):
        # base == 0 yields inf/nan -> null after _to_records
        pct_vals = diff_vals / base_vals * 100

    index_series = merged[index_col]

    def _frame(values) -> pd.DataFrame:
        out = pd.DataFrame(values, columns=numeric_cols, index=merged.index)
        out.insert(0, index_col, index_series)
        return out

    return {
        "index_column": index_col,
        "columns": numeric_cols,
        "base": _to_records(_frame(base_vals)),
        "compare": _to_records(_frame(compare_vals)),
        "diff": _to_records(_frame(diff_vals)),
        "diff_pct": _to_records(_frame(pct_vals)),
    }
