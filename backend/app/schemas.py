from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict


# ── Project ──

class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime
    version_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ProjectDetailResponse(ProjectResponse):
    """Project with nested versions and default plot config."""
    versions: List["DataVersionResponse"] = []
    default_plot_config: Optional["PlotConfigResponse"] = None


# ── DataVersion ──

class DataVersionCreate(BaseModel):
    label: str


class DataVersionUpdate(BaseModel):
    label: str


class SchemaField(BaseModel):
    name: str
    dtype: str


class DataVersionResponse(BaseModel):
    id: int
    project_id: int
    label: str
    file_path: str
    original_filename: str
    schema_def: Optional[List[SchemaField]] = None
    row_count: Optional[int] = None
    file_size: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UploadResult(BaseModel):
    version: DataVersionResponse
    schema_fields: List[SchemaField]
    rows: int


# ── PlotConfig ──

class PlotLineCreate(BaseModel):
    version_id: int
    y_column: str
    color: str = "#3b82f6"
    enabled: bool = True
    sort_order: int = 0
    axis: str = "left"
    scalar: float = 1.0


class PlotLineUpdate(BaseModel):
    version_id: Optional[int] = None
    y_column: Optional[str] = None
    color: Optional[str] = None
    enabled: Optional[bool] = None
    sort_order: Optional[int] = None
    axis: Optional[str] = None
    scalar: Optional[float] = None


class PlotLineResponse(BaseModel):
    id: int
    plot_config_id: int
    version_id: Optional[int]
    y_column: str
    color: str
    enabled: bool
    sort_order: int
    axis: str
    scalar: float

    model_config = ConfigDict(from_attributes=True)


class PlotConfigCreate(BaseModel):
    name: str = "Default"
    x_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    lines: List[PlotLineCreate] = []


class PlotConfigUpdate(BaseModel):
    name: Optional[str] = None
    x_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    lines: Optional[List[PlotLineCreate]] = None  # full replacement when provided


class PlotConfigResponse(BaseModel):
    id: int
    project_id: int
    name: str
    x_column: Optional[str]
    color_column: Optional[str]
    tooltip_columns: Optional[List[str]]
    is_default: bool
    lines: List[PlotLineResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Legacy compat (for migration) ──

class LegacyChartConfig(BaseModel):
    x_column: Optional[str] = None
    y_columns: Optional[List[str]] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    plot_lines: Optional[List[dict]] = None
