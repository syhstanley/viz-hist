# viz-hist Implementation Status & Issues

## Current Status: Scaffold Complete, Not Yet Runnable

Both frontend and backend scaffolds are in place, but there are several **critical mismatches** between frontend and backend that need fixing before the app can work end-to-end.

---

## Critical Issues (Must Fix)

### 1. Upload API: `label` parameter mismatch
- **Backend** (`uploads.py:36`): `label` is a `Query` parameter (URL query string)
- **Frontend** (`api.ts:59`): sends `label` as a `FormData` field (multipart body)
- **Fix**: Backend should accept `label` as `Form(...)` instead of `Query(...)`

### 2. Version data API: response shape mismatch
- **Backend** (`uploads.py:112`): returns `df.to_dict(orient="records")` -> flat array of objects `[{col: val}, ...]`
- **Frontend** (`api.ts:24-26`): expects `{ columns: string[], rows: Record[] }` (VersionData interface)
- **Frontend** (`projects/[id]/page.tsx:85`): accesses `vData.columns[0]` and `vData.rows` which don't exist
- **Fix**: Backend should return `{"columns": list(df.columns), "rows": df.to_dict(orient="records")}`

### 3. Diff API: response shape mismatch
- **Backend** (`uploads.py:158-164`): returns `base` and `compare` as **2D arrays** (`.values.tolist()`)
- **Frontend** (`DiffChart.tsx:43-44`): expects arrays of **objects** (`Record<string, number | string>[]`) and accesses `r[timeColumn]`, `r[col]`
- **Fix**: Backend should return base/compare as `df.to_dict(orient="records")` with the index included, OR frontend should adapt to the actual format
- Also: backend returns `index` as a separate field but frontend doesn't use it

### 4. Diff API: `columns` semantic confusion
- Backend diff returns `columns` = numeric value columns (excludes index/time column)
- Frontend `ProjectPage` line 156-159 does `diffResult.columns.slice(1)` to get value columns, but it's already sliced on the backend
- This results in skipping the first actual value column

### 5. Version interface: `filename` field doesn't exist
- **Frontend** (`api.ts:18`): `Version` has a `filename` field
- **Backend** (`schemas.py`): `DataVersionResponse` has no `filename` field
- **Frontend** (`projects/[id]/page.tsx:233`): renders `v.filename` which will always be undefined
- **Fix**: Either add `filename` to backend response or remove from frontend

---

## Moderate Issues

### 6. `on_event("startup")` deprecated
- `main.py:23`: uses `@app.on_event("startup")` which is deprecated in FastAPI 0.100+
- **Fix**: Use `lifespan` context manager instead

### 7. No SQLAlchemy relationship
- `models.py`: `Project` and `DataVersion` have no `relationship()` defined
- Getting a project with its versions requires a separate query (which is fine for now, but not ideal)

### 8. Delete project doesn't clean up files
- `projects.py:38-47`: deletes DB records but doesn't delete uploaded CSV files from disk
- **Fix**: Add `shutil.rmtree(f"./data/uploads/{project_id}")` in delete handler

### 9. `timeColumn` state logic is fragile
- `projects/[id]/page.tsx:85-86`: sets `timeColumn` only once (when it's empty), from version data columns
- But in diff mode (line 115), it tries again with `diffResult.columns[0]` which is wrong (diff columns don't include the time column)
- **Fix**: Determine time column from project schema or first column of any loaded data, consistently

### 10. No `.gitignore` for generated/data files
- Missing `.gitignore` at repo root to exclude:
  - `backend/data/` (SQLite DB + uploads)
  - `backend/.venv/`
  - `frontend/node_modules/`
  - `frontend/.next/`

---

## Minor Issues / Nice-to-haves

### 11. Frontend `uploadCSV` response type wrong
- `api.ts:60`: expects `Version` as response, but backend returns `{ version: {...}, schema: [...], rows: int }`
- Should type the response correctly or unwrap `.version`

### 12. No error handling for malformed CSVs
- Backend doesn't validate CSV structure or catch pandas parse errors

### 13. No CORS configuration for production
- Currently `allow_origins=["*"]` which is fine for dev

### 14. Pydantic `orm_mode` vs `from_attributes`
- `schemas.py` uses `class Config: orm_mode = True` which is Pydantic v1 style
- If Pydantic v2 is installed, should use `model_config = ConfigDict(from_attributes=True)`

### 15. ChartOverlay merge is O(n*m)
- `ChartOverlay.tsx:59`: uses `.find()` inside map, producing O(n*m) complexity
- For large datasets this could be slow. Should use a Map/dict for lookup.

---

## Recommended Fix Order

1. **Fix #1** (label Form vs Query) - 1 line change
2. **Fix #2** (version data response shape) - backend 3 lines
3. **Fix #3 + #4** (diff response shape + columns) - backend + frontend
4. **Fix #5** (remove `filename` or add to backend)
5. **Fix #10** (add .gitignore)
6. **Fix #11** (upload response typing)
7. **Fix #8** (file cleanup on delete)
8. **Fix #9** (timeColumn logic)
9. Remaining items as polish

---

## File Inventory

```
backend/
  pyproject.toml          -- uv project config
  .python-version         -- 3.9
  uv.lock                 -- locked deps
  app/
    __init__.py
    main.py               -- FastAPI app, CORS, startup
    database.py           -- async SQLAlchemy engine
    models.py             -- Project, DataVersion
    schemas.py            -- Pydantic models
    routers/
      __init__.py
      projects.py         -- CRUD for projects
      uploads.py          -- CSV upload, version data, diff

frontend/
  package.json            -- Next.js + recharts + axios + date-fns
  src/
    lib/api.ts            -- API client + types
    app/
      page.tsx            -- Home page (project list)
      projects/[id]/
        page.tsx          -- Project detail (upload, chart, diff)
    components/
      ChartOverlay.tsx    -- Multi-version line chart
      DiffChart.tsx       -- Base vs compare diff chart
```
