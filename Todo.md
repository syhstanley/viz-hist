# viz-hist Todo

## All Done

### Bugs (fixed)
- [x] Plot Config Save 500 — ORM deleted-instance fix
- [x] Home page icon mismatch
- [x] Diff endpoint 500 — numpy.int64 serialization
- [x] Tooltip wrong column values
- [x] Save button false dirty state

### Backend
- [x] Delete obsolete uploads.py
- [x] update_plot_config line replacement fix
- [x] Version delete plot_lines cleanup (affected count)
- [x] Pagination on get_version_data
- [x] PlotLine axis/scalar for dual Y-axis
- [x] Chart type + metadata_json on PlotConfig
- [x] Folder model with nested support
- [x] Folder CRUD + tree API
- [x] Project folder_id support

### Frontend
- [x] Save config state restore (dbId sync)
- [x] Home page version count display
- [x] deploy.sh
- [x] BACKEND_URL env var
- [x] Dialog overlays (Project Config, Plot Config)
- [x] Toast notifications
- [x] Dual Y-axis (L/R toggle + scalar)
- [x] Tooltip original + scaled values
- [x] Dark mode (toggle + localStorage + Plotly charts)
- [x] Multi-plot per project (PlotCard component)
- [x] Chart templates (Line Chart, Diff Chart)
- [x] Folder hierarchy + tree view + context menus
- [x] Move folders/projects between folders
- [x] X-axis sort for correct line connections
- [x] Any column as X or Y axis

## Future
- [ ] CSV -> Parquet storage for faster large file reads
- [ ] Diff endpoint memory optimization for large datasets
- [ ] Plot line color picker UI
- [ ] CSV column type detection improvements
- [ ] Large data: streaming, virtual scrolling tables
- [ ] Export charts as PNG/SVG (beyond Plotly built-in)
- [ ] Drag-and-drop reordering of plots
- [ ] Drag-and-drop folder/project organization
