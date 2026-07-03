# viz-hist Design Document

## Overview

viz-hist is a web service for visualizing and comparing time-series data across multiple CSV uploads. Users create "projects", define schemas (auto-detected from CSVs), and upload multiple versions of data to overlay on charts or compute diffs.

## Architecture

```
Frontend (Next.js :3000)  <-->  Backend (FastAPI :8000)  <-->  SQLite + File Storage
```

### Backend (Python 3.9 / FastAPI / uv)
- **Framework**: FastAPI (async)
- **Database**: SQLite via SQLAlchemy async (aiosqlite)
- **CSV Processing**: pandas
- **File Storage**: Local filesystem (`./data/uploads/{project_id}/`)

### Frontend (Next.js / TypeScript / Tailwind)
- **Charting**: Recharts (LineChart, ComposedChart)
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS

## Data Model

```
Project
  id: int (PK)
  name: str
  schema_def: JSON (nullable) -- auto-detected from first CSV upload
  created_at: datetime

DataVersion
  id: int (PK)
  project_id: int (FK -> Project)
  label: str
  file_path: str -- path to stored CSV file
  created_at: datetime
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects | Create project |
| GET | /api/projects | List projects |
| GET | /api/projects/{id} | Get project detail |
| DELETE | /api/projects/{id} | Delete project + versions |
| POST | /api/projects/{id}/upload | Upload CSV, auto-detect schema |
| GET | /api/projects/{id}/versions | List versions |
| GET | /api/projects/{id}/versions/{vid}/data | Get version data as JSON |
| GET | /api/projects/{id}/diff?base_id=&compare_id= | Compute diff between two versions |

## Core Workflow

1. User creates a project (just a name)
2. Uploads first CSV -> pandas auto-detects column names & types -> stores as project schema
3. Subsequent CSV uploads become new "versions" under same project
4. UI can:
   - Overlay multiple versions on a single LineChart (checkbox selection)
   - Switch to Diff Mode: pick base + compare version -> shows base line, compare line, shaded diff area

## Key Design Decisions

- **Schema auto-detection**: First CSV upload sets the project schema. Subsequent uploads should match.
- **File-based storage**: CSVs are stored as files, read with pandas on demand. No row-level DB storage.
- **Diff computation**: Server-side via pandas merge + numeric diff. First column assumed to be time/index.
- **Version management**: Each upload is a version with a user-defined label.

## Future Considerations

- Schema validation on subsequent uploads (warn if columns don't match)
- Support for non-time-series data (bar charts, scatter plots)
- Chart configuration persistence (colors, axis labels, chart type)
- Export charts as images
- Multi-column diff visualization (currently only first numeric column)
- Authentication / multi-user support
- Drag-and-drop upload
