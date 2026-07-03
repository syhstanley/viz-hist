from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import PlotConfig, PlotLine, Project
from app.schemas import (
    PlotConfigCreate,
    PlotConfigUpdate,
    PlotConfigResponse,
    PlotLineCreate,
    PlotLineUpdate,
    PlotLineResponse,
)

router = APIRouter(prefix="/api/projects/{project_id}/plots", tags=["plots"])


async def _get_project_or_404(project_id: int, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_config_or_404(
    project_id: int, config_id: int, db: AsyncSession
) -> PlotConfig:
    result = await db.execute(
        select(PlotConfig)
        .where(PlotConfig.id == config_id, PlotConfig.project_id == project_id)
        .options(selectinload(PlotConfig.lines))
    )
    config = result.scalar_one_or_none()
    if config is None:
        raise HTTPException(status_code=404, detail="Plot config not found")
    return config


# ── Plot Configs ──

@router.get("", response_model=List[PlotConfigResponse])
async def list_plot_configs(project_id: int, db: AsyncSession = Depends(get_db)):
    await _get_project_or_404(project_id, db)
    result = await db.execute(
        select(PlotConfig)
        .where(PlotConfig.project_id == project_id)
        .options(selectinload(PlotConfig.lines))
        .order_by(PlotConfig.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=PlotConfigResponse)
async def create_plot_config(
    project_id: int, body: PlotConfigCreate, db: AsyncSession = Depends(get_db)
):
    await _get_project_or_404(project_id, db)

    # If this is the first config, make it default
    existing = await db.execute(
        select(PlotConfig).where(PlotConfig.project_id == project_id)
    )
    is_first = existing.scalar_one_or_none() is None

    config = PlotConfig(
        project_id=project_id,
        name=body.name,
        x_column=body.x_column,
        color_column=body.color_column,
        tooltip_columns=body.tooltip_columns,
        is_default=is_first,
    )
    db.add(config)
    await db.flush()

    # Add lines
    for i, line_data in enumerate(body.lines):
        line = PlotLine(
            plot_config_id=config.id,
            version_id=line_data.version_id,
            y_column=line_data.y_column,
            color=line_data.color,
            enabled=line_data.enabled,
            sort_order=line_data.sort_order if line_data.sort_order else i,
            axis=line_data.axis,
            scalar=line_data.scalar,
        )
        db.add(line)

    await db.commit()
    return await _get_config_or_404(project_id, config.id, db)


@router.get("/{config_id}", response_model=PlotConfigResponse)
async def get_plot_config(
    project_id: int, config_id: int, db: AsyncSession = Depends(get_db)
):
    return await _get_config_or_404(project_id, config_id, db)


@router.put("/{config_id}", response_model=PlotConfigResponse)
async def update_plot_config(
    project_id: int,
    config_id: int,
    body: PlotConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    config = await _get_config_or_404(project_id, config_id, db)

    if body.name is not None:
        config.name = body.name
    if body.x_column is not None:
        config.x_column = body.x_column
    if body.color_column is not None:
        config.color_column = body.color_column
    if body.tooltip_columns is not None:
        config.tooltip_columns = body.tooltip_columns

    # If lines are provided, do a full replacement
    if body.lines is not None:
        # Delete old lines via direct statement to avoid ORM deleted-instance issues
        await db.execute(
            delete(PlotLine).where(PlotLine.plot_config_id == config.id)
        )
        # Expire the config so ORM doesn't hold stale references
        await db.flush()
        db.expire(config, ["lines"])
        # Add new lines
        for i, line_data in enumerate(body.lines):
            line = PlotLine(
                plot_config_id=config.id,
                version_id=line_data.version_id,
                y_column=line_data.y_column,
                color=line_data.color,
                enabled=line_data.enabled,
                sort_order=line_data.sort_order if line_data.sort_order else i,
                axis=line_data.axis,
                scalar=line_data.scalar,
            )
            db.add(line)

    db.add(config)
    await db.commit()
    return await _get_config_or_404(project_id, config.id, db)


@router.delete("/{config_id}")
async def delete_plot_config(
    project_id: int, config_id: int, db: AsyncSession = Depends(get_db)
):
    config = await _get_config_or_404(project_id, config_id, db)
    await db.delete(config)  # cascade deletes lines
    await db.commit()
    return {"detail": "deleted"}


# ── Individual Plot Lines ──

@router.post("/{config_id}/lines", response_model=PlotLineResponse)
async def add_plot_line(
    project_id: int,
    config_id: int,
    body: PlotLineCreate,
    db: AsyncSession = Depends(get_db),
):
    config = await _get_config_or_404(project_id, config_id, db)
    # Determine next sort order
    max_order = max((l.sort_order for l in config.lines), default=-1)
    line = PlotLine(
        plot_config_id=config.id,
        version_id=body.version_id,
        y_column=body.y_column,
        color=body.color,
        enabled=body.enabled,
        sort_order=body.sort_order if body.sort_order else max_order + 1,
        axis=body.axis,
        scalar=body.scalar,
    )
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return line


@router.patch("/{config_id}/lines/{line_id}", response_model=PlotLineResponse)
async def update_plot_line(
    project_id: int,
    config_id: int,
    line_id: int,
    body: PlotLineUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlotLine).where(
            PlotLine.id == line_id,
            PlotLine.plot_config_id == config_id,
        )
    )
    line = result.scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=404, detail="Plot line not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(line, field, value)

    db.add(line)
    await db.commit()
    await db.refresh(line)
    return line


@router.delete("/{config_id}/lines/{line_id}")
async def delete_plot_line(
    project_id: int,
    config_id: int,
    line_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlotLine).where(
            PlotLine.id == line_id,
            PlotLine.plot_config_id == config_id,
        )
    )
    line = result.scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=404, detail="Plot line not found")
    await db.delete(line)
    await db.commit()
    return {"detail": "deleted"}
