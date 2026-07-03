# viz-hist Todo

## Bugs
- [x] Plot Config Save 回 500 — 改用 `delete()` statement + `db.expire()` 取代 `config.lines.clear()`
- [x] Home page `BarChart3` icon 改成 `Calendar`（配日期）+ 加 `Database` icon 顯示 version count

## DB Schema 已完成
- [x] 4 張正規化表：`projects`, `data_versions`, `plot_configs`, `plot_lines`
- [x] FK constraints with CASCADE / SET NULL
- [x] Indexes on all FK columns
- [x] Per-version `schema_def`, `original_filename`, `row_count`, `file_size`
- [x] `updated_at` on projects and plot_configs
- [x] Migration script (`migrate.py`) 從舊 schema 遷移資料
- [x] 舊 `uploads.py` router 已被 `versions.py` 取代（但檔案還在，可刪除）

## Backend
- [x] 刪除舊的 `app/routers/uploads.py`（已被 `versions.py` 取代）
- [x] `update_plot_config` (PUT) 的 plot_lines replacement 邏輯修復
- [x] 加上 version delete endpoint 的 plot_lines cleanup 確認（回傳 affected_plot_lines count）
- [x] 加 pagination 到 `get_version_data`（支援 `?offset=0&limit=100`，預設回傳全部）
- [ ] 考慮 CSV 轉 Parquet 儲存以加速大檔讀取
- [ ] Diff endpoint 對大檔案的效能優化（目前全載入記憶體）

## Frontend
- [x] Save plot config 後 reload 正確還原所有狀態（update 後同步 dbId）
- [x] Home page 加上每個 project 的 version 數量顯示（backend 回傳 version_count）
- [x] Production build + restart 流程做成 `deploy.sh`
- [x] `next.config.ts` rewrites 改用 `BACKEND_URL` 環境變數

## 未來功能
- [ ] 支援多個 PlotConfig per project（目前只用 default）
- [ ] Plot line 顏色選擇器（目前只能自動分配）
- [ ] Version 刪除功能（UI 上還沒有刪除按鈕）
- [ ] CSV 欄位類型偵測改進（目前只分 int/float/str/datetime）
- [ ] 大資料支援：分頁載入、streaming、虛擬捲動表格
- [ ] 匯出圖表為 PNG/SVG
- [ ] Dark mode 支援
