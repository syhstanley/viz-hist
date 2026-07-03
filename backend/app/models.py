from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (replaces deprecated datetime.utcnow).

    Kept naive so it stays consistent with existing rows in SQLite.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    parent_id = Column(
        Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    parent = relationship("Folder", back_populates="children", remote_side=[id])
    children = relationship("Folder", back_populates="parent", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="folder")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    folder_id = Column(
        Integer, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    folder = relationship("Folder", back_populates="projects")
    versions = relationship(
        "DataVersion", back_populates="project", cascade="all, delete-orphan"
    )
    plot_configs = relationship(
        "PlotConfig", back_populates="project", cascade="all, delete-orphan"
    )


class DataVersion(Base):
    __tablename__ = "data_versions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False, default="")
    schema_def = Column(JSON, nullable=True)
    row_count = Column(Integer, nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    # Relationships
    project = relationship("Project", back_populates="versions")
    plot_lines = relationship("PlotLine", back_populates="version")


class PlotConfig(Base):
    __tablename__ = "plot_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name = Column(String, nullable=False, default="Default")
    chart_type = Column(String, nullable=False, default="line")  # "line", "diff_line"
    x_column = Column(String, nullable=True)
    color_column = Column(String, nullable=True)
    tooltip_columns = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)  # type-specific settings (e.g. diff params)
    is_default = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # Relationships
    project = relationship("Project", back_populates="plot_configs")
    lines = relationship(
        "PlotLine", back_populates="plot_config", cascade="all, delete-orphan",
        order_by="PlotLine.sort_order",
    )


class PlotLine(Base):
    __tablename__ = "plot_lines"

    id = Column(Integer, primary_key=True, index=True)
    plot_config_id = Column(
        Integer, ForeignKey("plot_configs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_id = Column(
        Integer, ForeignKey("data_versions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    y_column = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#3b82f6")
    enabled = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    axis = Column(String, nullable=False, default="left")
    scalar = Column(Float, nullable=False, default=1.0)

    # Relationships
    plot_config = relationship("PlotConfig", back_populates="lines")
    version = relationship("DataVersion", back_populates="plot_lines")
