"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getTemplates,
  saveTemplate,
  deleteTemplate,
  type TemplateFile,
} from "@/lib/api";
import {
  compileTemplate,
  runTemplate,
  initialParams,
  type TemplateVersionData,
} from "@/lib/templates";
import { parseCSV } from "@/lib/csv";
import {
  ParamControl,
  TemplateError,
  ChartErrorBoundary,
} from "@/components/TemplateParamForm";
import PlotlyChart from "@/components/PlotlyChart";
import { useDarkMode } from "@/lib/useDarkMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, Plus, Save, Trash2, Check, AlertTriangle, FileCode,
  FileSpreadsheet, Eye, X,
} from "lucide-react";
import type { PlotParams } from "react-plotly.js";

const STARTER_CODE = `// viz-hist custom chart template
// The file must evaluate to an object: ({ name, params, render })
({
  name: "My Chart",
  description: "Describe what this chart shows",

  // params generate the config UI shown on the plot card.
  // types: "string" | "number" | "boolean" | "column" | "version" | "select"
  params: [
    { key: "column", label: "Y Column", type: "column" },
  ],

  // ctx.versions: [{ id, label, columns, rows }]  — all uploaded versions
  // ctx.params:   current values of the params above
  // ctx.dark:     dark mode flag
  // Return a Plotly figure: { data: [...traces], layout: {...} }
  render(ctx) {
    const col = ctx.params.column;
    const data = ctx.versions.map((v) => ({
      type: "scatter",
      mode: "lines",
      name: v.label,
      x: v.rows.map((r, i) => r[v.columns[0]] ?? i),
      y: v.rows.map((r) => r[col]),
    }));
    return { data, layout: { title: { text: this.name } } };
  },
})
`;

export default function TemplatesPage() {
  const dark = useDarkMode();
  const [templates, setTemplates] = useState<TemplateFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newId, setNewId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const refresh = useCallback(async () => {
    try {
      setTemplates(await getTemplates());
    } catch {
      setError("Failed to load templates.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const select = (t: TemplateFile) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelectedId(t.id);
    setCode(t.code);
    setDirty(false);
  };

  // Live validation — compile on every edit so authors see errors immediately
  const compileStatus = useMemo(() => compileTemplate(code), [code]);

  // ── Preview: sample CSVs + params → live render of the current code ──
  const [samples, setSamples] = useState<TemplateVersionData[]>([]);
  const [previewParams, setPreviewParams] = useState<Record<string, unknown>>({});
  const sampleIdRef = useRef(1);

  const handleAddSamples = async (files: FileList | null) => {
    if (!files) return;
    const added: TemplateVersionData[] = [];
    for (const f of Array.from(files)) {
      try {
        const parsed = parseCSV(await f.text());
        if (parsed.columns.length === 0) continue;
        added.push({
          id: sampleIdRef.current++,
          label: f.name.replace(/\.csv$/i, ""),
          columns: parsed.columns,
          rows: parsed.rows,
        });
      } catch { /* skip unreadable files */ }
    }
    setSamples((prev) => [...prev, ...added]);
  };

  const removeSample = (id: number) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  };

  const sampleColumns = useMemo(() => {
    const set = new Set<string>();
    for (const s of samples) for (const c of s.columns) set.add(c);
    return [...set];
  }, [samples]);

  // Fill defaults for newly declared params, keep values the user already set
  useEffect(() => {
    if (!compileStatus.ok) return;
    setPreviewParams((prev) => initialParams(compileStatus.template.params, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compileStatus.ok ? compileStatus.template.params : null]);

  const previewResult = useMemo(() => {
    if (!compileStatus.ok || samples.length === 0) return null;
    return runTemplate(compileStatus.template, {
      versions: samples,
      params: previewParams,
      dark,
    });
  }, [compileStatus, samples, previewParams, dark]);

  const handleSave = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      await saveTemplate(selectedId, code);
      setDirty(false);
      showToast(`Template "${selectedId}" saved`);
      void refresh();
    } catch {
      setError("Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const id = newId.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) {
      setError("Template id must be letters, digits, '-' or '_' (max 64 chars).");
      return;
    }
    if (templates.some((t) => t.id === id)) {
      setError(`Template "${id}" already exists.`);
      return;
    }
    try {
      await saveTemplate(id, STARTER_CODE);
      setNewId("");
      setCreating(false);
      await refresh();
      setSelectedId(id);
      setCode(STARTER_CODE);
      setDirty(false);
      showToast(`Template "${id}" created`);
    } catch {
      setError("Failed to create template.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete template "${id}"? Plots using it will show an error until reassigned.`)) return;
    try {
      await deleteTemplate(id);
      if (selectedId === id) {
        setSelectedId(null);
        setCode("");
        setDirty(false);
      }
      void refresh();
      showToast(`Template "${id}" deleted`);
    } catch {
      setError("Failed to delete template.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to projects
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Chart Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Templates are JS files stored in the repo&apos;s <code>templates/</code> directory —
            commit them to git to keep history. A broken template only breaks its own chart, never the site.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 hover:underline">Dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* Template list */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Templates</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {creating && (
                <div className="flex gap-1.5 pb-2">
                  <Input
                    placeholder="template-id"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                      if (e.key === "Escape") { setCreating(false); setNewId(""); }
                    }}
                    className="h-8 text-sm font-mono"
                    autoFocus
                  />
                  <Button size="sm" className="h-8" onClick={handleCreate} disabled={!newId.trim()}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {templates.length === 0 && !creating ? (
                <p className="text-sm text-muted-foreground py-2">
                  No templates yet. Create one to get started.
                </p>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer text-sm ${
                      selectedId === t.id ? "bg-accent" : "hover:bg-accent/50"
                    }`}
                    onClick={() => select(t)}
                  >
                    <span className="flex items-center gap-1.5 font-mono">
                      <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                      {t.id}
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor + Preview */}
          <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-mono">
                    {selectedId ? `${selectedId}.js` : "Select a template"}
                  </CardTitle>
                  {selectedId && (
                    compileStatus.ok ? (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="mr-1 h-3 w-3" />
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Invalid
                      </Badge>
                    )
                  )}
                </div>
                {selectedId && (
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                    {saving ? "Saving..." : (<><Save className="mr-1.5 h-3.5 w-3.5" />Save</>)}
                  </Button>
                )}
              </div>
              {selectedId && !compileStatus.ok && (
                <p className="text-xs text-destructive font-mono pt-1">{compileStatus.error}</p>
              )}
            </CardHeader>
            <CardContent>
              {selectedId ? (
                <div className="space-y-2">
                  <Label className="sr-only">Template code</Label>
                  <textarea
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setDirty(true); }}
                    spellCheck={false}
                    className="w-full h-[560px] rounded-md border bg-muted/30 p-3 font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">
                    Saved files live in <code>templates/{selectedId}.js</code>. Remember to commit to git.
                    Saving with errors is allowed — the affected chart shows the error instead of crashing.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Select a template on the left, or create a new one.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Live Preview ── */}
          {selectedId && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Input
                      id="sample-csv-upload"
                      type="file"
                      accept=".csv"
                      multiple
                      onChange={(e) => {
                        void handleAddSamples(e.target.files);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => document.getElementById("sample-csv-upload")?.click()}
                    >
                      <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                      Add sample CSV
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sample CSVs live only in this page — nothing is uploaded. Each file acts as one
                  version passed to <code>render(ctx)</code>, using the unsaved code in the editor.
                </p>
                {samples.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {samples.map((s) => (
                      <Badge key={s.id} variant="secondary" className="gap-1 font-mono text-xs">
                        {s.label}
                        <span className="text-muted-foreground">({s.rows.length} rows)</span>
                        <button
                          onClick={() => removeSample(s.id)}
                          className="ml-0.5 hover:text-destructive"
                          title="Remove sample"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                {compileStatus.ok && compileStatus.template.params.length > 0 && samples.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                    {compileStatus.template.params.map((def) => (
                      <ParamControl
                        key={def.key}
                        def={def}
                        value={previewParams[def.key]}
                        versions={samples}
                        columns={sampleColumns}
                        onChange={(v) => setPreviewParams((prev) => ({ ...prev, [def.key]: v }))}
                      />
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {!compileStatus.ok ? (
                  <TemplateError error={compileStatus.error} />
                ) : samples.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                    Add one or more sample CSV files to preview this template.
                  </div>
                ) : !previewResult ? null : !previewResult.ok ? (
                  <TemplateError error={previewResult.error} />
                ) : (
                  <ChartErrorBoundary
                    resetKey={code + JSON.stringify(previewParams) + samples.length}
                  >
                    <PlotlyChart
                      data={previewResult.figure.data as PlotParams["data"]}
                      layout={{
                        autosize: true,
                        paper_bgcolor: "rgba(0,0,0,0)",
                        plot_bgcolor: "rgba(0,0,0,0)",
                        font: { color: dark ? "#d4d4d8" : "#374151" },
                        ...(previewResult.figure.layout || {}),
                      } as PlotParams["layout"]}
                      useResizeHandler
                      style={{ width: "100%", height: "400px" }}
                      config={{ displaylogo: false }}
                    />
                  </ChartErrorBoundary>
                )}
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </main>
  );
}
