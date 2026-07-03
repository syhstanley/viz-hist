# viz-hist

A web application for visualizing and comparing historical time-series data across multiple CSV uploads. Organize projects in nested folders, overlay multiple data versions on interactive charts, compute diffs, and configure dual Y-axis with scaling.

## Features

- **Folder Organization** — Nested folders to organize projects. Create, rename, move, delete via context menu.
- **Project Management** — Create projects, upload multiple CSV versions, edit labels, delete versions.
- **Multiple Plots per Project** — Each project can have multiple independent charts (Line Chart or Diff Chart).
- **Line Chart** — Overlay lines from different versions/columns. Configurable X/Y axes, dual Y-axis (left/right), per-line scalar multiplier.
- **Diff Chart** — Compare two versions with overlay, absolute diff, or percentage diff views.
- **Plot Settings** — Dialog overlay to configure X axis, color grouping, tooltip columns, and manage lines.
- **Dark Mode** — Toggle with sun/moon button, persists to localStorage, respects system preference. Plotly charts adapt.
- **Tooltips** — Shows original + scaled values when scalar is applied. Excludes other plotted columns to avoid clutter.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.9, FastAPI, SQLAlchemy (async), SQLite, pandas |
| Frontend | Next.js 16, TypeScript, Tailwind CSS, shadcn/ui |
| Charts | Plotly.js (via react-plotly.js) |
| Package Mgmt | uv (backend), npm (frontend) |

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 22+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

### Backend

```bash
cd backend
uv sync
source .venv/bin/activate
uvicorn app.main:app --port 8001
```

### Frontend

```bash
cd frontend
npm install
npm run build
npm start
# Or for development:
npm run dev
```

The frontend proxies `/api/*` to `http://localhost:8001` by default. Override with `BACKEND_URL` env var:

```bash
BACKEND_URL=http://prod:8001 npm run build
```

### Deploy Script

```bash
./deploy.sh  # Builds frontend, restarts services
```

## Project Structure

```
viz-hist/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + lifespan
│   │   ├── database.py      # SQLAlchemy engine + session
│   │   ├── models.py        # Folder, Project, DataVersion, PlotConfig, PlotLine
│   │   ├── schemas.py       # Pydantic models
│   │   └── routers/
│   │       ├── folders.py   # Folder CRUD + tree
│   │       ├── projects.py  # Project CRUD
│   │       ├── versions.py  # Upload, data, diff
│   │       └── plots.py     # PlotConfig + PlotLine CRUD
│   ├── tests/               # pytest (48 tests)
│   ├── data/                # SQLite DB + uploaded CSVs
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx     # Home: folder tree, project cards
│   │   │   └── projects/[id]/page.tsx  # Project: plots, settings
│   │   ├── components/
│   │   │   ├── PlotCard.tsx      # Line/Diff chart card
│   │   │   ├── ChartOverlay.tsx  # Plotly line chart with dual axis
│   │   │   ├── DiffChart.tsx     # Plotly diff chart
│   │   │   └── ui/              # shadcn components
│   │   └── lib/
│   │       ├── api.ts           # API client + types
│   │       └── useDarkMode.ts   # Dark mode hook
│   ├── tests/               # Vitest unit tests (19 tests)
│   ├── e2e/                 # Playwright E2E tests (11 tests)
│   ├── playwright.config.ts
│   └── vitest.config.ts
├── deploy.sh
├── design.md                # Detailed design document
└── Todo.md                  # Progress tracker
```

## Data Model

```
Folder (nested via parent_id)
  └── Project (folder_id, nullable)
        ├── DataVersion (CSV file + schema)
        └── PlotConfig (chart_type: "line" | "diff_line")
              └── PlotLine (version_id, y_column, axis, scalar)
```

## API Overview

| Group | Endpoints |
|-------|-----------|
| Folders | `POST/GET/PATCH/DELETE /api/folders`, `GET /api/folders/tree` |
| Projects | `POST/GET/PATCH/DELETE /api/projects`, `GET /api/projects/{id}` |
| Versions | `POST /api/projects/{id}/upload`, `GET/PATCH/DELETE .../versions/{vid}`, `GET .../versions/{vid}/data` |
| Diff | `GET /api/projects/{id}/diff?base_id=&compare_id=` |
| Plots | `POST/GET/PUT/DELETE /api/projects/{id}/plots/{cid}`, `POST/PATCH/DELETE .../lines/{lid}` |

Full API docs available at `http://localhost:8001/docs` (Swagger UI).

## Testing

```bash
# Backend (48 tests)
cd backend && source .venv/bin/activate && pytest tests/ -v

# Frontend unit tests (19 tests)
cd frontend && npm test

# Frontend E2E tests (11 tests)
cd frontend && npm run test:e2e

# Total: 78 tests
```

## License

MIT
