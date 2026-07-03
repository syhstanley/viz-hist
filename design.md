# viz-hist Design Document

## Overview

viz-hist is a web service for visualizing and comparing time-series data across multiple CSV uploads. Users create "projects", upload multiple versions of CSV data, configure plot lines to overlay on charts, and compute diffs between versions.

## Architecture

```
Frontend (Next.js :3000)  --(rewrite)--> Backend (FastAPI :8001) --> SQLite + File Storage
```

The frontend proxies `/api/*` requests to the backend via Next.js rewrites. The backend URL is configurable via the `BACKEND_URL` environment variable (default: `http://localhost:8001`).

### Backend (Python 3.9 / FastAPI / uv)
- **Framework**: FastAPI (async)
- **Database**: SQLite via SQLAlchemy async (aiosqlite)
- **CSV Processing**: pandas
- **File Storage**: Local filesystem (`./data/uploads/{project_id}/`)
- **Package Manager**: uv

### Frontend (Next.js 16 / TypeScript / Tailwind)
- **Charting**: Plotly.js (via react-plotly.js, dynamically imported for SSR compat)
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS + shadcn/ui components
- **UI Components**: lucide-react icons

## Data Model

```
Project
  id: int (PK)
  name: str
  created_at: datetime
  updated_at: datetime

DataVersion
  id: int (PK)
  project_id: int (FK -> Project, CASCADE)
  label: str
  file_path: str
  original_filename: str
  schema_def: JSON (nullable)      -- per-version column schema [{name, dtype}]
  row_count: int (nullable)
  file_size: int (nullable, bytes)
  created_at: datetime

PlotConfig
  id: int (PK)
  project_id: int (FK -> Project, CASCADE)
  name: str (default "Default")
  x_column: str (nullable)
  color_column: str (nullable)
  tooltip_columns: JSON (nullable) -- list of column names
  is_default: bool
  created_at: datetime
  updated_at: datetime

PlotLine
  id: int (PK)
  plot_config_id: int (FK -> PlotConfig, CASCADE)
  version_id: int (FK -> DataVersion, SET NULL, nullable)
  y_column: str
  color: str (default "#3b82f6")
  enabled: bool
  sort_order: int
```

### Relationships
- Project 1:N DataVersion (cascade delete)
- Project 1:N PlotConfig (cascade delete)
- PlotConfig 1:N PlotLine (cascade delete)
- DataVersion 1:N PlotLine (SET NULL on delete — lines keep existing but lose version reference)

## API Endpoints

### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects | Create project |
| GET | /api/projects | List projects (includes `version_count`) |
| GET | /api/projects/{id} | Get project detail (versions + default plot config) |
| PATCH | /api/projects/{id} | Update project name |
| DELETE | /api/projects/{id} | Delete project + all related data + files |

### Versions
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects/{id}/upload | Upload CSV (auto-detect schema) |
| GET | /api/projects/{id}/versions | List versions |
| PATCH | /api/projects/{id}/versions/{vid} | Update version label |
| DELETE | /api/projects/{id}/versions/{vid} | Delete version + file (returns `affected_plot_lines`) |
| GET | /api/projects/{id}/versions/{vid}/data | Get version data (supports `?offset=&limit=` pagination) |

### Diff
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/{id}/diff?base_id=&compare_id= | Compute diff between two versions |

### Plot Configs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/{id}/plots | List plot configs |
| POST | /api/projects/{id}/plots | Create plot config with lines |
| GET | /api/projects/{id}/plots/{cid} | Get plot config |
| PUT | /api/projects/{id}/plots/{cid} | Update config (full line replacement) |
| DELETE | /api/projects/{id}/plots/{cid} | Delete plot config |

### Plot Lines
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects/{id}/plots/{cid}/lines | Add a line |
| PATCH | /api/projects/{id}/plots/{cid}/lines/{lid} | Update a line |
| DELETE | /api/projects/{id}/plots/{cid}/lines/{lid} | Delete a line |

## Core Workflow

1. User creates a project (just a name)
2. Uploads CSV -> pandas auto-detects column names & types -> stored as per-version schema
3. Subsequent CSV uploads become new "versions" under the same project
4. User configures plot lines: picks version + Y column + color for each line
5. Chart overlay renders all enabled lines via Plotly.js
6. Plot config (x column, color column, tooltip columns, lines) can be saved and restored
7. Diff mode: pick base + compare version -> overlay, absolute diff, or percentage diff views

## Key Design Decisions

- **Per-version schema**: Each version stores its own `schema_def`, not a project-level schema. This allows flexibility when columns change between versions.
- **File-based storage**: CSVs stored as files, read with pandas on demand. No row-level DB storage.
- **Pagination**: `get_version_data` supports `offset`/`limit` for large CSVs (default returns all rows for backward compat).
- **Diff computation**: Server-side via pandas merge + numeric diff. First column assumed to be the index.
- **Plot line replacement**: PUT on plot config does a full line replacement (DELETE + re-INSERT) to avoid ORM session issues.
- **Version deletion safety**: Deleting a version SET NULLs the `version_id` on related plot lines rather than cascading delete, so plot config structure is preserved.

## Deployment

- `deploy.sh` — builds frontend, restarts backend/frontend services
- Backend: `uvicorn app.main:app --port 8001`
- Frontend: `npm run build && npm start` (port 3000)
- `BACKEND_URL` env var configures the API proxy target

## Future Considerations

- CSV -> Parquet storage for faster large file reads
- Diff endpoint memory optimization for large datasets
- Multiple PlotConfigs per project
- Plot line color picker UI
- Version delete button in UI
- Improved column type detection
- Large data: streaming, virtual scrolling tables
- Export charts as PNG/SVG
- Dark mode
