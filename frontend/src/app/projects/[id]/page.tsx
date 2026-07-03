"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getProject,
  getVersionData,
  uploadCSV,
  updateVersionLabel,
  getDiff,
  createPlotConfig,
  updatePlotConfig,
  type ProjectDetail,
  type Version,
  type VersionData,
  type DiffResult,
} from "@/lib/api";
import ChartOverlay, { type TraceLine } from "@/components/ChartOverlay";
import DiffChart, { type DiffDisplayMode } from "@/components/DiffChart";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Upload,
  Save,
  Database,
  LineChart,
  GitCompare,
  Check,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  FileSpreadsheet,
} from "lucide-react";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

type Panel = "none" | "project" | "plot" | "diff";

// Local UI state for a plot line
interface UIPlotLine {
  id: string;          // `${versionId}-${yColumn}` for new lines, or db id
  dbId: number | null; // actual DB id, null if not yet saved
  versionId: number;
  versionLabel: string;
  yColumn: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>("none");

  // Plot config
  const [plotConfigId, setPlotConfigId] = useState<number | null>(null);
  const [plotLines, setPlotLines] = useState<UIPlotLine[]>([]);
  const [versionDataMap, setVersionDataMap] = useState<Map<number, Record<string, number | string>[]>>(new Map());

  // Column config
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [xColumn, setXColumn] = useState<string>("");
  const [colorColumn, setColorColumn] = useState<string>("");
  const [tooltipColumns, setTooltipColumns] = useState<string[]>([]);

  // Add line form
  const [addLineVersion, setAddLineVersion] = useState<string>("");
  const [addLineColumn, setAddLineColumn] = useState<string>("");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);

  // Edit label state
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  // Diff state
  const [diffMode, setDiffMode] = useState(false);
  const [baseVersionId, setBaseVersionId] = useState<number | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffYColumn, setDiffYColumn] = useState<string>("");
  const [diffDisplayMode, setDiffDisplayMode] = useState<DiffDisplayMode>("overlay");

  // Save config state
  const [configDirty, setConfigDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const configInitialized = useRef(false);

  const [error, setError] = useState<string | null>(null);

  // Derived
  const selectableYColumns = useMemo(() => {
    return availableColumns.filter((c) => c !== xColumn && c !== colorColumn);
  }, [availableColumns, xColumn, colorColumn]);

  const enabledLines = useMemo(() => plotLines.filter((l) => l.enabled), [plotLines]);

  // Track config dirty
  useEffect(() => {
    if (configInitialized.current) setConfigDirty(true);
  }, [xColumn, colorColumn, tooltipColumns, plotLines]);

  // ── Fetch project (with versions + default plot config) ──
  const fetchProject = useCallback(async () => {
    try {
      const proj = await getProject(projectId);
      setProject(proj);
      setVersions(proj.versions);

      // Find available columns from first version with schema
      const firstWithSchema = proj.versions.find((v) => v.schema_def && v.schema_def.length > 0);
      if (firstWithSchema && firstWithSchema.schema_def) {
        const cols = firstWithSchema.schema_def.map((s) => s.name);
        setAvailableColumns(cols);

        if (!configInitialized.current) {
          const cfg = proj.default_plot_config;
          if (cfg) {
            setPlotConfigId(cfg.id);
            setXColumn(cfg.x_column || cols[0] || "");
            setColorColumn(cfg.color_column || "");

            // Restore tooltip columns
            if (Array.isArray(cfg.tooltip_columns)) {
              setTooltipColumns(cfg.tooltip_columns);
            } else {
              setTooltipColumns(getDefaultYCols(firstWithSchema.schema_def));
            }

            // Restore plot lines from DB
            if (cfg.lines.length > 0) {
              setPlotLines(cfg.lines.map((pl, idx) => {
                const ver = proj.versions.find((v) => v.id === pl.version_id);
                return {
                  id: `${pl.version_id}-${pl.y_column}`,
                  dbId: pl.id,
                  versionId: pl.version_id!,
                  versionLabel: ver?.label || `v${pl.version_id}`,
                  yColumn: pl.y_column,
                  color: pl.color || COLORS[idx % COLORS.length],
                  enabled: pl.enabled,
                  sortOrder: pl.sort_order,
                };
              }));
            }
          } else {
            setXColumn(cols[0] || "");
            setTooltipColumns(getDefaultYCols(firstWithSchema.schema_def));
          }
          setTimeout(() => { configInitialized.current = true; }, 0);
        }
      }
    } catch {
      setError("Failed to load project.");
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    void fetchProject();
  }, [fetchProject]);

  // ── Load version data for enabled lines ──
  useEffect(() => {
    const versionIds = new Set(enabledLines.map((l) => l.versionId));
    if (versionIds.size === 0) {
      // Defer to avoid synchronous setState in effect body
      const id = requestAnimationFrame(() => setVersionDataMap(new Map()));
      return () => cancelAnimationFrame(id);
    }

    const loadData = async () => {
      const newMap = new Map<number, Record<string, number | string>[]>();
      for (const vId of versionIds) {
        try {
          const vData: VersionData = await getVersionData(projectId, vId);
          if (vData.columns.length > 0 && availableColumns.length === 0) {
            setAvailableColumns(vData.columns);
            if (!xColumn) setXColumn(vData.columns[0]);
          }
          newMap.set(vId, vData.rows);
        } catch { /* skip */ }
      }
      setVersionDataMap(newMap);
    };
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledLines, projectId, versions]);

  // Build traces for chart
  const chartLines: TraceLine[] = useMemo(() => {
    return enabledLines
      .filter((l) => versionDataMap.has(l.versionId))
      .map((l) => ({
        label: `${l.yColumn} (${l.versionLabel})`,
        data: versionDataMap.get(l.versionId)!,
        yColumn: l.yColumn,
        color: l.color,
      }));
  }, [enabledLines, versionDataMap]);

  // ── Load diff ──
  useEffect(() => {
    if (!diffMode || baseVersionId === null || compareVersionId === null) {
      const id = requestAnimationFrame(() => setDiffResult(null));
      return () => cancelAnimationFrame(id);
    }
    const loadDiff = async () => {
      try {
        const result = await getDiff(projectId, baseVersionId, compareVersionId);
        setDiffResult(result);
        if (!diffYColumn && result.columns.length > 0) setDiffYColumn(result.columns[0]);
      } catch { setError("Failed to load diff."); }
    };
    void loadDiff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffMode, baseVersionId, compareVersionId, projectId]);

  // ── Handlers ──

  const handleUpload = async () => {
    if (!file || !label.trim()) return;
    try {
      setUploading(true);
      await uploadCSV(projectId, file, label.trim());
      setFile(null);
      setLabel("");
      const fileInput = document.getElementById("csv-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      fetchProject();
    } catch { setError("Failed to upload CSV."); } finally { setUploading(false); }
  };

  const handleUpdateLabel = async (versionId: number) => {
    if (!editLabelValue.trim()) return;
    try {
      await updateVersionLabel(projectId, versionId, editLabelValue.trim());
      setEditingVersionId(null);
      setEditLabelValue("");
      fetchProject();
    } catch { setError("Failed to update label."); }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const payload = {
        name: "Default",
        x_column: xColumn || undefined,
        color_column: colorColumn || undefined,
        tooltip_columns: tooltipColumns,
        lines: plotLines.map((l, i) => ({
          version_id: l.versionId,
          y_column: l.yColumn,
          color: l.color,
          enabled: l.enabled,
          sort_order: i,
        })),
      };

      if (plotConfigId) {
        const updated = await updatePlotConfig(projectId, plotConfigId, payload);
        // Sync dbIds from server response (lines were replaced, IDs changed)
        setPlotLines((prev) =>
          prev.map((l, i) => ({
            ...l,
            dbId: updated.lines[i]?.id ?? null,
          }))
        );
      } else {
        const created = await createPlotConfig(projectId, payload);
        setPlotConfigId(created.id);
        // Update dbIds from response
        setPlotLines((prev) =>
          prev.map((l, i) => ({
            ...l,
            dbId: created.lines[i]?.id ?? null,
          }))
        );
      }
      setConfigDirty(false);
    } catch { setError("Failed to save plot config."); } finally { setSaving(false); }
  };

  const addLine = () => {
    if (!addLineVersion || !addLineColumn) return;
    const vId = Number(addLineVersion);
    const lineId = `${vId}-${addLineColumn}`;
    if (plotLines.some((l) => l.id === lineId)) return;
    const ver = versions.find((v) => v.id === vId);
    setPlotLines((prev) => [
      ...prev,
      {
        id: lineId,
        dbId: null,
        versionId: vId,
        versionLabel: ver?.label || `v${vId}`,
        yColumn: addLineColumn,
        color: COLORS[prev.length % COLORS.length],
        enabled: true,
        sortOrder: prev.length,
      },
    ]);
    setAddLineVersion("");
    setAddLineColumn("");
  };

  const removeLine = (id: string) => {
    setPlotLines((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleLine = (id: string) => {
    setPlotLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  };

  const toggleTooltipColumn = (col: string) => {
    setTooltipColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const togglePanel = (panel: Panel) => {
    setActivePanel((prev) => (prev === panel ? "none" : panel));
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link href="/">
              <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to projects
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">
              {project?.name || "Loading..."}
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button variant={activePanel === "project" ? "default" : "outline"} size="sm" onClick={() => togglePanel("project")}>
              <Database className="mr-1.5 h-4 w-4" />
              Project
            </Button>
            <Button variant={activePanel === "plot" ? "default" : "outline"} size="sm" onClick={() => togglePanel("plot")}>
              <LineChart className="mr-1.5 h-4 w-4" />
              Plot
            </Button>
            <Button variant={activePanel === "diff" ? "default" : "outline"} size="sm" onClick={() => togglePanel("diff")}>
              <GitCompare className="mr-1.5 h-4 w-4" />
              Diff
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 hover:underline">Dismiss</button>
          </div>
        )}

        {/* ── Project Config Panel ── */}
        {activePanel === "project" && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Project Config</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setActivePanel("none")}><X className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h3 className="text-base font-medium flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload Data Source
                  </h3>
                  <Input id="csv-upload" type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
                  <Input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Version label (e.g. v1.0)" />
                  <Button onClick={handleUpload} disabled={!file || !label.trim() || uploading} className="w-full" size="sm">
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
                <div className="space-y-3">
                  <h3 className="text-base font-medium">Data Sources</h3>
                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data sources yet. Upload a CSV to get started.</p>
                  ) : (
                    <div className="rounded-md border">
                      <table className="w-full text-base">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source File</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Rows</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((v) => {
                            const isEditing = editingVersionId === v.id;
                            return (
                              <tr key={v.id} className="border-b last:border-0">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{v.original_filename}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5">
                                      <Input
                                        value={editLabelValue}
                                        onChange={(e) => setEditLabelValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") handleUpdateLabel(v.id);
                                          if (e.key === "Escape") { setEditingVersionId(null); setEditLabelValue(""); }
                                        }}
                                        className="h-7 text-sm"
                                        autoFocus
                                      />
                                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleUpdateLabel(v.id)}>
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingVersionId(null); setEditLabelValue(""); }}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className="font-medium">{v.label}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{v.row_count ?? "-"}</td>
                                <td className="px-3 py-2 text-right">
                                  {!isEditing && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                      onClick={() => { setEditingVersionId(v.id); setEditLabelValue(v.label); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Plot Config Panel ── */}
        {activePanel === "plot" && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Plot Config</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={configDirty ? "default" : "outline"} onClick={handleSaveConfig} disabled={!configDirty || saving}>
                    {saving ? "Saving..." : configDirty ? (<><Save className="mr-1.5 h-3.5 w-3.5" />Save</>) : (<><Check className="mr-1.5 h-3.5 w-3.5" />Saved</>)}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setActivePanel("none")}><X className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {availableColumns.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Upload a CSV first in Project Config.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-base font-medium">X Axis</Label>
                      <Select value={xColumn} onValueChange={(v) => v && setXColumn(v)}>
                        <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                        <SelectContent>
                          {availableColumns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-medium">Color (group by)</Label>
                      <Select value={colorColumn || "__none__"} onValueChange={(v) => setColorColumn(!v || v === "__none__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {availableColumns.filter((c) => c !== xColumn).map((col) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-medium">Tooltip Columns</Label>
                      <ScrollArea className="h-24 rounded-md border p-2">
                        <div className="space-y-1.5">
                          {availableColumns.map((col) => (
                            <label key={col} className="flex items-center space-x-2 cursor-pointer">
                              <Checkbox checked={tooltipColumns.includes(col)} onCheckedChange={() => toggleTooltipColumn(col)} />
                              <span className="text-base">{col}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-medium">Lines</h3>
                      <Badge variant="secondary">{enabledLines.length} active / {plotLines.length} total</Badge>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-base">Version</Label>
                        <Select value={addLineVersion} onValueChange={(v) => v && setAddLineVersion(v)}>
                          <SelectTrigger><SelectValue placeholder="Select version..." /></SelectTrigger>
                          <SelectContent>
                            {versions.map((v) => (<SelectItem key={v.id} value={v.id.toString()}>{v.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-base">Y Column</Label>
                        <Select value={addLineColumn} onValueChange={(v) => v && setAddLineColumn(v)}>
                          <SelectTrigger><SelectValue placeholder="Select column..." /></SelectTrigger>
                          <SelectContent>
                            {selectableYColumns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" onClick={addLine} disabled={!addLineVersion || !addLineColumn}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>

                    {plotLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No lines configured. Add one above.</p>
                    ) : (
                      <div className="rounded-md border">
                        <table className="w-full text-base">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10"></th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Version</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Y Column</th>
                              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-10">Color</th>
                              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-10"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {plotLines.map((line) => (
                              <tr key={line.id} className={`border-b last:border-0 ${!line.enabled ? "opacity-40" : ""}`}>
                                <td className="px-3 py-2">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleLine(line.id)} title={line.enabled ? "Disable" : "Enable"}>
                                    {line.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                  </Button>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant="outline">{line.versionLabel}</Badge>
                                </td>
                                <td className="px-3 py-2 font-mono text-base">{line.yColumn}</td>
                                <td className="px-3 py-2">
                                  <div className="h-4 w-4 rounded-full border" style={{ backgroundColor: line.color }} />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(line.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Diff Panel ── */}
        {activePanel === "diff" && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Diff Mode</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setActivePanel("none")}><X className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Label className="text-base">Enable Diff Mode</Label>
                  <Switch checked={diffMode} onCheckedChange={setDiffMode} />
                </div>
                {diffMode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label className="text-base">Base Version</Label>
                      <Select value={baseVersionId?.toString() ?? undefined} onValueChange={(v) => setBaseVersionId(v ? Number(v) : null)}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => (<SelectItem key={v.id} value={v.id.toString()}>{v.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base">Compare Version</Label>
                      <Select value={compareVersionId?.toString() ?? undefined} onValueChange={(v) => setCompareVersionId(v ? Number(v) : null)}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {versions.map((v) => (<SelectItem key={v.id} value={v.id.toString()}>{v.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base">Display</Label>
                      <div className="flex gap-1">
                        {([["overlay", "Overlay"], ["absolute", "Abs Diff"], ["percentage", "% Diff"]] as const).map(([mode, modeLabel]) => (
                          <Button key={mode} size="sm" variant={diffDisplayMode === mode ? "default" : "outline"} className="flex-1 text-sm" onClick={() => setDiffDisplayMode(mode as DiffDisplayMode)}>
                            {modeLabel}
                          </Button>
                        ))}
                      </div>
                    </div>
                    {diffResult && diffResult.columns.length > 1 && (
                      <div className="space-y-2">
                        <Label className="text-base">Diff Column</Label>
                        <Select value={diffYColumn} onValueChange={(v) => v && setDiffYColumn(v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {diffResult.columns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Chart area */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {diffMode ? "Diff Chart" : "Chart Overlay"}
              </CardTitle>
              {!diffMode && enabledLines.length > 0 && (
                <Badge variant="secondary">
                  {enabledLines.length} line{enabledLines.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {diffMode ? (
              diffResult ? (
                <DiffChart
                  baseData={diffResult.base}
                  compareData={diffResult.compare}
                  diffData={diffResult.diff}
                  diffPctData={diffResult.diff_pct}
                  timeColumn={diffResult.index_column}
                  valueColumns={diffResult.columns}
                  selectedYColumn={diffYColumn}
                  displayMode={diffDisplayMode}
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Select base and compare versions to view the diff.
                </div>
              )
            ) : (
              <ChartOverlay
                lines={chartLines}
                xColumn={xColumn}
                tooltipColumns={tooltipColumns}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function getDefaultYCols(schemaDef: { name: string; dtype: string }[]): string[] {
  const numericCols = schemaDef
    .filter((s) => s.dtype === "int" || s.dtype === "float")
    .map((s) => s.name);
  if (numericCols.length > 0) return [numericCols[0]];
  return schemaDef.length > 1 ? [schemaDef[1].name] : [];
}
