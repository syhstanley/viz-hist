"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getProject,
  uploadCSV,
  updateVersionLabel,
  deleteVersion,
  getPlotConfigs,
  createPlotConfig,
  updatePlotConfig,
  deletePlotConfig,
  getTemplates,
  type ProjectDetail,
  type Version,
  type PlotConfig,
  type TemplateFile,
} from "@/lib/api";
import { compileTemplate } from "@/lib/templates";
import PlotCard from "@/components/PlotCard";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Upload,
  Save,
  Database,
  Check,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  FileSpreadsheet,
  Moon,
  Sun,
} from "lucide-react";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// No more panel system — everything is dialog or inline

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
  axis: "left" | "right";
  scalar: number;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showProjectConfig, setShowProjectConfig] = useState(false);

  // Plot config
  const [showPlotConfig, setShowPlotConfig] = useState(false);
  const [allPlotConfigs, setAllPlotConfigs] = useState<PlotConfig[]>([]);
  const [plotConfigId, setPlotConfigId] = useState<number | null>(null);
  const [plotConfigName, setPlotConfigName] = useState("Default");
  const [plotLines, setPlotLines] = useState<UIPlotLine[]>([]);

  // Column config
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [xColumn, setXColumn] = useState<string>("");
  const [colorColumn, setColorColumn] = useState<string>("");
  const [tooltipColumns, setTooltipColumns] = useState<string[]>([]);

  // Add line form
  const [addLineVersion, setAddLineVersion] = useState<string>("");
  const [addLineColumn, setAddLineColumn] = useState<string>("");

  // Add plot form — newPlotType is "line" | "diff_line" | `custom:<templateId>`
  const [showAddPlot, setShowAddPlot] = useState(false);
  const [newPlotName, setNewPlotName] = useState("");
  const [newPlotType, setNewPlotType] = useState<string>("line");
  const [creatingPlot, setCreatingPlot] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<{ id: string; name: string }[]>([]);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);

  // Edit label state
  const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  // (Diff is now handled per-PlotCard with chart_type="diff_line")

  // Save config state
  const [configDirty, setConfigDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const configInitialized = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dark mode
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("viz-hist-dark");
    if (stored === "true" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from localStorage on mount
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);
  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("viz-hist-dark", String(next));
      return next;
    });
  };

  // Derived
  const selectableYColumns = useMemo(() => {
    return availableColumns.filter((c) => c !== colorColumn);
  }, [availableColumns, colorColumn]);

  const enabledLines = useMemo(() => plotLines.filter((l) => l.enabled), [plotLines]);

  // Track config dirty (skip during save to avoid false triggers from dbId sync)
  const savingRef = useRef(false);
  useEffect(() => {
    if (configInitialized.current && !savingRef.current) setConfigDirty(true);
  }, [xColumn, colorColumn, tooltipColumns, plotLines]);

  // ── Load a specific plot config into UI state ──
  const loadConfig = useCallback((cfg: PlotConfig, vers: Version[], cols: string[], schemaDef?: { name: string; dtype: string }[]) => {
    savingRef.current = true; // prevent dirty tracking
    setPlotConfigId(cfg.id);
    setPlotConfigName(cfg.name);
    setXColumn(cfg.x_column || cols[0] || "");
    setColorColumn(cfg.color_column || "");
    if (Array.isArray(cfg.tooltip_columns)) {
      setTooltipColumns(cfg.tooltip_columns);
    } else if (schemaDef) {
      setTooltipColumns(getDefaultYCols(schemaDef));
    }
    if (cfg.lines.length > 0) {
      setPlotLines(cfg.lines.map((pl, idx) => {
        const ver = vers.find((v) => v.id === pl.version_id);
        return {
          id: `${pl.version_id}-${pl.y_column}`,
          dbId: pl.id,
          versionId: pl.version_id!,
          versionLabel: ver?.label || `v${pl.version_id}`,
          yColumn: pl.y_column,
          color: pl.color || COLORS[idx % COLORS.length],
          enabled: pl.enabled,
          sortOrder: pl.sort_order,
          axis: (pl.axis === "right" ? "right" : "left") as "left" | "right",
          scalar: pl.scalar ?? 1.0,
        };
      }));
    } else {
      setPlotLines([]);
    }
    setConfigDirty(false);
    setTimeout(() => { savingRef.current = false; }, 0);
  }, []);

  // ── Fetch project (with versions + plot configs) ──
  const fetchProject = useCallback(async () => {
    try {
      const proj = await getProject(projectId);
      setProject(proj);
      setVersions(proj.versions);
      setAllPlotConfigs(proj.plot_configs);

      // Find available columns from first version with schema
      const firstWithSchema = proj.versions.find((v) => v.schema_def && v.schema_def.length > 0);
      if (firstWithSchema && firstWithSchema.schema_def) {
        const cols = firstWithSchema.schema_def.map((s) => s.name);
        setAvailableColumns(cols);

        if (!configInitialized.current) {
          const cfg = proj.default_plot_config;
          if (cfg) {
            loadConfig(cfg, proj.versions, cols, firstWithSchema.schema_def);
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
  }, [projectId, loadConfig]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    void fetchProject();
  }, [fetchProject]);

  // Load custom templates for the "New Plot" type selector
  useEffect(() => {
    (async () => {
      try {
        const files: TemplateFile[] = await getTemplates();
        setAvailableTemplates(
          files.map((f) => {
            const compiled = compileTemplate(f.code);
            return { id: f.id, name: compiled.ok ? compiled.template.name : f.id };
          })
        );
      } catch { /* templates are optional; selector just shows built-ins */ }
    })();
  }, []);

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
      savingRef.current = true;
      const payload = {
        name: plotConfigName || "Default",
        x_column: xColumn || undefined,
        color_column: colorColumn || undefined,
        tooltip_columns: tooltipColumns,
        lines: plotLines.map((l, i) => ({
          version_id: l.versionId,
          y_column: l.yColumn,
          color: l.color,
          enabled: l.enabled,
          sort_order: i,
          axis: l.axis,
          scalar: l.scalar,
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
      setShowPlotConfig(false);
      showToast("Plot config saved");
      // Refresh configs list
      const configs = await getPlotConfigs(projectId);
      setAllPlotConfigs(configs);
    } catch { setError("Failed to save plot config."); } finally { setSaving(false); savingRef.current = false; }
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
        axis: "left",
        scalar: 1.0,
      },
    ]);
    setAddLineVersion("");
    setAddLineColumn("");
  };

  const handleNewConfig = async () => {
    if (!newPlotName.trim()) return;
    try {
      setCreatingPlot(true);
      const isCustom = newPlotType.startsWith("custom:");
      const created = await createPlotConfig(projectId, {
        name: newPlotName.trim(),
        chart_type: isCustom ? "custom" : newPlotType,
        metadata_json: isCustom
          ? { template_id: newPlotType.slice("custom:".length), params: {} }
          : undefined,
        lines: [],
      });
      const configs = await getPlotConfigs(projectId);
      setAllPlotConfigs(configs);
      loadConfig(created, versions, availableColumns);
      setNewPlotName("");
      setShowAddPlot(false);
      showToast(`Plot "${created.name}" created`);
    } catch { setError("Failed to create plot."); } finally { setCreatingPlot(false); }
  };

  const handleDeleteConfig = async (configId: number) => {
    if (!confirm("Delete this plot config?")) return;
    try {
      await deletePlotConfig(projectId, configId);
      const configs = await getPlotConfigs(projectId);
      setAllPlotConfigs(configs);
      if (plotConfigId === configId) {
        // Switch to another config or reset
        if (configs.length > 0) {
          loadConfig(configs[0], versions, availableColumns);
        } else {
          setPlotConfigId(null);
          setPlotConfigName("Default");
          setPlotLines([]);
        }
      }
      showToast("Config deleted");
    } catch { setError("Failed to delete config."); }
  };

  const handleDeleteVersion = async (versionId: number) => {
    if (!confirm("Delete this version? Plot lines referencing it will lose their data.")) return;
    try {
      await deleteVersion(projectId, versionId);
      fetchProject();
      showToast("Version deleted");
    } catch { setError("Failed to delete version."); }
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
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

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowProjectConfig(true)} title="Project Settings">
              <Database className="h-4 w-4" />
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

        {/* ── Project Config Dialog ── */}
        <Dialog open={showProjectConfig} onOpenChange={setShowProjectConfig}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Project Settings</DialogTitle>
            </DialogHeader>
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
                                <div className="flex items-center justify-end gap-0.5">
                                  {!isEditing && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
                                      onClick={() => { setEditingVersionId(v.id); setEditLabelValue(v.label); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteVersion(v.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
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
          </DialogContent>
        </Dialog>

        {/* ── Plot Config Dialog ── */}
        <Dialog open={showPlotConfig} onOpenChange={setShowPlotConfig}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{plotConfigName || "Plot Settings"}</DialogTitle>
            </DialogHeader>
            {availableColumns.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Upload a CSV first in Project Config.</p>
            ) : (
              <div className="space-y-6">
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
                        <SelectTrigger><SelectValue placeholder="Select version...">{addLineVersion ? versions.find((v) => v.id.toString() === addLineVersion)?.label : undefined}</SelectValue></SelectTrigger>
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
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Axis</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Scale</th>
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
                              <td className="px-3 py-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs font-mono"
                                  onClick={() => setPlotLines((prev) => prev.map((l) => l.id === line.id ? { ...l, axis: l.axis === "left" ? "right" : "left" } : l))}
                                  title={line.axis === "left" ? "Left Y axis (click to switch to right)" : "Right Y axis (click to switch to left)"}
                                >
                                  {line.axis === "left" ? "L" : "R"}
                                </Button>
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  step="any"
                                  value={line.scalar}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val)) setPlotLines((prev) => prev.map((l) => l.id === line.id ? { ...l, scalar: val } : l));
                                  }}
                                  className="h-7 w-16 text-xs font-mono px-1.5"
                                />
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
              </div>
            )}
            <DialogFooter>
              <Button size="sm" onClick={handleSaveConfig} disabled={!configDirty || saving}>
                {saving ? "Saving..." : (<><Save className="mr-1.5 h-3.5 w-3.5" />Save</>)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Plot cards */}
        <div className="space-y-4">
          {allPlotConfigs.map((cfg) => (
            <PlotCard
              key={cfg.id}
              config={cfg}
              projectId={projectId}
              versions={versions}
              onEdit={() => {
                loadConfig(cfg, versions, availableColumns);
                setShowPlotConfig(true);
              }}
              onDelete={() => handleDeleteConfig(cfg.id)}
              canDelete={allPlotConfigs.length > 1}
            />
          ))}
          {showAddPlot ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New Plot</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm">Name</Label>
                    <Input
                      placeholder="e.g. Revenue Trend"
                      value={newPlotName}
                      onChange={(e) => setNewPlotName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNewConfig()}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Type</Label>
                    <Select value={newPlotType} onValueChange={(v) => v && setNewPlotType(v)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="line">Line Chart</SelectItem>
                        <SelectItem value="diff_line">Diff Chart</SelectItem>
                        {availableTemplates.map((t) => (
                          <SelectItem key={t.id} value={`custom:${t.id}`}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleNewConfig} disabled={!newPlotName.trim() || creatingPlot}>
                    {creatingPlot ? "Creating..." : "Create"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddPlot(false); setNewPlotName(""); setNewPlotType("line"); }}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowAddPlot(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Plot
            </Button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
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
