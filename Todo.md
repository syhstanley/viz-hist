# viz-hist Todo

## Bugs (all fixed)
- [x] Plot Config Save 回 500 — 改用 `delete()` statement + `db.expire()` 取代 `config.lines.clear()`
- [x] Home page `BarChart3` icon 改成 `Calendar`（配日期）+ 加 `Database` icon 顯示 version count
- [x] Diff endpoint 500 — numpy.int64 無法 JSON serialize，加 `_native()` 轉換
- [x] Tooltip 顯示錯誤的 column 值 — 改為永遠顯示自己的 Y column，排除其他 plotted columns
- [x] Save plot config 後按鈕馬上跳回 dirty — 加 `savingRef` 暫停 dirty tracking

## DB Schema 已完成
- [x] 4 張正規化表：`projects`, `data_versions`, `plot_configs`, `plot_lines`
- [x] FK constraints with CASCADE / SET NULL
- [x] Indexes on all FK columns
- [x] Per-version `schema_def`, `original_filename`, `row_count`, `file_size`
- [x] `updated_at` on projects and plot_configs
- [x] Migration script (`migrate.py`) 從舊 schema 遷移資料
- [x] `plot_lines` 加 `axis` (left/right) 和 `scalar` (float) 欄位

## Backend
- [x] 刪除舊的 `app/routers/uploads.py`（已被 `versions.py` 取代）
- [x] `update_plot_config` (PUT) 的 plot_lines replacement 邏輯修復
- [x] 加上 version delete endpoint 的 plot_lines cleanup 確認（回傳 affected_plot_lines count）
- [x] 加 pagination 到 `get_version_data`（支援 `?offset=0&limit=100`，預設回傳全部）
- [x] PlotLine model 加 axis/scalar 支援 dual Y-axis
- [ ] 考慮 CSV 轉 Parquet 儲存以加速大檔讀取
- [ ] Diff endpoint 對大檔案的效能優化（目前全載入記憶體）

## Frontend
- [x] Save plot config 後 reload 正確還原所有狀態（update 後同步 dbId）
- [x] Home page 加上每個 project 的 version 數量顯示（backend 回傳 version_count）
- [x] Production build + restart 流程做成 `deploy.sh`
- [x] `next.config.ts` rewrites 改用 `BACKEND_URL` 環境變數
- [x] Project Config / Plot Config 改成 Dialog overlay（取代 panel）
- [x] Diff mode 改成 inline toggle switch + controls 內嵌在 chart header
- [x] Save 成功後左下角綠色 toast 通知
- [x] Dual Y-axis 支援（L/R toggle + scalar input）
- [x] Tooltip 顯示 original + scaled 值
- [x] Dialog 加大（sm:max-w-4xl）

## 未來功能
- [ ] 支援多個 PlotConfig per project（目前只用 default）
- [ ] Plot line 顏色選擇器（目前只能自動分配）
- [ ] Version 刪除功能（UI 上還沒有刪除按鈕）
- [ ] CSV 欄位類型偵測改進（目前只分 int/float/str/datetime）
- [ ] 大資料支援：分頁載入、streaming、虛擬捲動表格
- [ ] 匯出圖表為 PNG/SVG
- [ ] Dark mode 支援
