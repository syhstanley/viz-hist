# viz-hist

A web application for visualizing and comparing historical time-series data across multiple CSV uploads. Organize projects in nested folders, overlay multiple data versions on interactive charts, compute diffs, and configure dual Y-axis with scaling.

## Features

- **Folder Organization** — Nested folders to organize projects. Create, rename, move, delete via context menu.
- **Project Management** — Create projects, upload multiple CSV versions, edit labels, delete versions.
- **Multiple Plots per Project** — Each project can have multiple independent charts (Line Chart, Diff Chart, or Custom Template).
- **Line Chart** — Overlay lines from different versions/columns. Configurable X/Y axes, dual Y-axis (left/right), per-line scalar multiplier.
- **Diff Chart** — Compare two versions with overlay, absolute diff, or percentage diff views.
- **Plot Settings** — Dialog overlay to configure X axis, color grouping, tooltip columns, and manage lines.
- **Dark Mode** — Toggle with sun/moon button, persists to localStorage, respects system preference. Plotly charts adapt.
- **Tooltips** — Shows original + scaled values when scalar is applied. Excludes other plotted columns to avoid clutter.
- **Custom Chart Templates** — Write JS templates (data transform + Plotly figure) at `/templates`: a management list plus a wide editor+preview overlay. Templates declare `params` that auto-generate the chart's config UI. Stored as files in `templates/` (git-tracked). Broken template code only breaks its own chart card — never the site.
- **AI Template Generation** — `/templates` ships a one-click copyable prompt (template contract, param types, hard rules) so any AI assistant can write a working template from a description + sample CSV rows.

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
│   │       ├── plots.py     # PlotConfig + PlotLine CRUD
│   │       └── templates.py # Template file CRUD
│   ├── tests/               # pytest (78 tests)
│   ├── data/                # SQLite DB + uploaded CSVs
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx     # Home: folder tree, project cards
│   │   │   ├── templates/page.tsx      # Template admin: list + editor/preview overlay + AI prompt
│   │   │   └── projects/[id]/page.tsx  # Project: plots, settings
│   │   ├── components/
│   │   │   ├── PlotCard.tsx      # Line/Diff/Custom chart dispatch
│   │   │   ├── ChartOverlay.tsx  # Plotly line chart with dual axis
│   │   │   ├── DiffChart.tsx     # Plotly diff chart
│   │   │   ├── CustomChartCard.tsx    # Template-driven chart card
│   │   │   ├── TemplateParamForm.tsx  # Param controls + error boundary
│   │   │   └── ui/              # shadcn components
│   │   └── lib/
│   │       ├── api.ts           # API client + types
│   │       ├── templates.ts     # Template compile/run (fault-isolated)
│   │       ├── csv.ts           # Client-side CSV parser (preview)
│   │       └── useDarkMode.ts   # Dark mode hook
│   ├── tests/               # Vitest unit tests (45 tests)
│   ├── e2e/                 # Playwright E2E tests (15 tests)
│   ├── playwright.config.ts
│   └── vitest.config.ts
├── templates/               # Custom chart templates (JS files, git-tracked)
├── deploy.sh
├── design.md                # Detailed design document
└── Todo.md                  # Progress tracker
```

## Data Model

```
Folder (nested via parent_id)
  └── Project (folder_id, nullable)
        ├── DataVersion (CSV file + schema)
        └── PlotConfig (chart_type: "line" | "diff_line" | "custom")
              └── PlotLine (version_id, y_column, axis, scalar)
```

## API Overview

| Group | Endpoints |
|-------|-----------|
| Folders | `POST/GET/PATCH/DELETE /api/folders`, `GET /api/folders/tree` |
| Projects | `POST/GET/PATCH/DELETE /api/projects`, `GET /api/projects/{id}` |
| Versions | `POST /api/projects/{id}/upload`, `GET/PATCH/DELETE .../versions/{vid}`, `GET .../versions/{vid}/data` |
| Diff | `GET /api/projects/{id}/diff?base_id=&compare_id=` |
| Templates | `GET /api/templates`, `GET/PUT/DELETE /api/templates/{id}` |
| Plots | `POST/GET/PUT/DELETE /api/projects/{id}/plots/{cid}`, `POST/PATCH/DELETE .../lines/{lid}` |

Full API docs available at `http://localhost:8001/docs` (Swagger UI).

## Custom Chart Templates

Manage templates at `/templates`: the main page lists templates
(create / edit / delete); clicking one opens a wide overlay with the code
editor on the left and a live preview on the right (feed it sample CSVs —
parsed entirely in the browser, nothing is uploaded). The page also includes a
collapsible **"Generate a template with AI"** section with a copyable prompt:
paste it into any AI assistant together with a chart description and a few
sample CSV rows, and it returns template code you can paste straight in.

A template is a JS file that evaluates to an object:

```js
({
  name: "My Chart",
  params: [
    // types: string | number | boolean | column | version | select
    { key: "column", label: "Y Column", type: "column" },
  ],
  render(ctx) {
    // ctx.versions: [{ id, label, columns, rows }]  — all uploaded versions
    // ctx.params:   current values of the params above
    // ctx.dark:     dark mode flag
    return { data: [/* plotly traces */], layout: {} };
  },
})
```

Templates live in `templates/*.js` — commit them to git for history. User code
runs only in the browser inside try/catch + an error boundary: a broken
template shows an error card on its own chart, the rest of the app keeps
working. To use one, add a plot and pick the template as its type.

## Testing

```bash
# Backend (78 tests)
cd backend && source .venv/bin/activate && pytest tests/ -v

# Frontend unit tests (45 tests)
cd frontend && npm test

# Frontend E2E tests (15 tests)
cd frontend && npm run test:e2e

# Total: 138 tests
```

## License

MIT
