from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


# ── Folder ──

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None  # move to another folder


class FolderResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FolderTreeResponse(FolderResponse):
    children: List["FolderTreeResponse"] = []
    projects: List["ProjectResponse"] = []


# ── Project ──

class ProjectCreate(BaseModel):
    name: str
    folder_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[int] = None  # move to folder (null = root)


class ProjectResponse(BaseModel):
    id: int
    name: str
    folder_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    version_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class ProjectDetailResponse(ProjectResponse):
    """Project with nested versions and plot configs."""
    versions: List["DataVersionResponse"] = []
    plot_configs: List["PlotConfigResponse"] = []
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
    chart_type: str = "line"  # "line", "diff_line"
    x_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    metadata_json: Optional[Dict[str, Any]] = None
    lines: List[PlotLineCreate] = []


class PlotConfigUpdate(BaseModel):
    name: Optional[str] = None
    chart_type: Optional[str] = None
    x_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    metadata_json: Optional[Dict[str, Any]] = None
    lines: Optional[List[PlotLineCreate]] = None


class PlotConfigResponse(BaseModel):
    id: int
    project_id: int
    name: str
    chart_type: str
    x_column: Optional[str]
    color_column: Optional[str]
    tooltip_columns: Optional[List[str]]
    metadata_json: Optional[Dict[str, Any]]
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
