# viz-hist Design Document

## Overview

viz-hist is a web service for visualizing and comparing time-series data across multiple CSV uploads. Users organize projects in nested folders, upload multiple versions of CSV data, and create multiple chart plots (line charts, diff charts) with configurable axes, scaling, and dual Y-axis support.

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
- **Tests**: pytest + httpx (48 tests)

### Frontend (Next.js 16 / TypeScript / Tailwind)
- **Charting**: Plotly.js (via react-plotly.js, dynamically imported for SSR compat)
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS + shadcn/ui components
- **UI Components**: lucide-react icons
- **Dark Mode**: Class-based (.dark) with localStorage persistence
- **Unit Tests**: Vitest (19 tests)
- **E2E Tests**: Playwright (11 tests)

## Data Model

```
Folder
  id: int (PK)
  name: str
  parent_id: int (FK -> Folder, CASCADE, nullable)  -- self-referential for nesting
  created_at: datetime

Project
  id: int (PK)
  name: str
  folder_id: int (FK -> Folder, SET NULL, nullable)
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
  chart_type: str (default "line")  -- "line", "diff_line"
  x_column: str (nullable)
  color_column: str (nullable)
  tooltip_columns: JSON (nullable)
  metadata_json: JSON (nullable)    -- type-specific settings (e.g. diff params)
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
  axis: str (default "left")       -- "left" or "right" Y-axis
  scalar: float (default 1.0)      -- multiplier for Y values
```

### Relationships
- Folder 1:N Folder (self-referential, cascade delete children)
- Folder 1:N Project (SET NULL on folder delete)
- Project 1:N DataVersion (cascade delete)
- Project 1:N PlotConfig (cascade delete)
- PlotConfig 1:N PlotLine (cascade delete)
- DataVersion 1:N PlotLine (SET NULL on delete)

## API Endpoints

### Folders
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/folders | Create folder (with optional parent_id) |
| GET | /api/folders | List all folders (flat) |
| GET | /api/folders/tree | Get nested folder tree with projects |
| PATCH | /api/folders/{id} | Rename or move folder |
| DELETE | /api/folders/{id} | Delete folder (projects move to root) |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects | Create project (with optional folder_id) |
| GET | /api/projects | List projects (includes version_count) |
| GET | /api/projects/{id} | Get detail (versions + all plot configs) |
| PATCH | /api/projects/{id} | Update name or move to folder |
| DELETE | /api/projects/{id} | Delete project + all data + files |

### Versions
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects/{id}/upload | Upload CSV (auto-detect schema) |
| GET | /api/projects/{id}/versions | List versions |
| PATCH | /api/projects/{id}/versions/{vid} | Update version label |
| DELETE | /api/projects/{id}/versions/{vid} | Delete version + file |
| GET | /api/projects/{id}/versions/{vid}/data | Get data (?offset=&limit=) |

### Diff
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/{id}/diff?base_id=&compare_id= | Compute diff |

### Plot Configs
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/{id}/plots | List plot configs |
| POST | /api/projects/{id}/plots | Create (with chart_type, metadata_json) |
| GET | /api/projects/{id}/plots/{cid} | Get plot config |
| PUT | /api/projects/{id}/plots/{cid} | Update (full line replacement) |
| DELETE | /api/projects/{id}/plots/{cid} | Delete plot config |
| POST | /api/projects/{id}/plots/{cid}/lines | Add line |
| PATCH | /api/projects/{id}/plots/{cid}/lines/{lid} | Update line |
| DELETE | /api/projects/{id}/plots/{cid}/lines/{lid} | Delete line |

## Chart Types

### Line Chart (`chart_type: "line"`)
- Renders as Plotly scatter+lines chart
- Supports multiple lines from different versions
- Dual Y-axis (left/right per line)
- Scalar multiplier per line (tooltip shows original + scaled)
- Data sorted by X-axis values before rendering
- Any column can be X or Y axis

### Diff Line Chart (`chart_type: "diff_line"`)
- Compares two versions side by side
- Three display modes: Overlay, Absolute Diff, Percentage Diff
- Base/Compare version selectors in card header
- Column selector when multiple numeric columns

## Key Design Decisions

- **Per-version schema**: Each version stores its own schema_def
- **File-based storage**: CSVs stored as files, read with pandas on demand
- **Pagination**: get_version_data supports offset/limit
- **Plot line replacement**: PUT does DELETE + re-INSERT to avoid ORM issues
- **Version deletion safety**: SET NULL on plot lines, not cascade
- **Chart templates**: chart_type field on PlotConfig, PlotCard renders accordingly
- **Folder nesting**: Self-referential FK with cascade delete on children
- **Dark mode**: Class-based (.dark on <html>), persisted to localStorage, Plotly charts use transparent bg with adaptive colors

## Deployment

- `deploy.sh` — builds frontend, restarts services
- Backend: `uvicorn app.main:app --port 8001`
- Frontend: `npm run build && npm start` (port 3000)
- `BACKEND_URL` env var configures API proxy target

## Testing

| Suite | Count | Command |
|-------|-------|---------|
| Backend (pytest) | 48 | `cd backend && pytest tests/` |
| Frontend Unit (vitest) | 19 | `cd frontend && npm test` |
| Frontend E2E (playwright) | 11 | `cd frontend && npm run test:e2e` |
| **Total** | **78** | |
