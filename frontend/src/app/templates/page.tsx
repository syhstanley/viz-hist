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
import { AI_TEMPLATE_PROMPT } from "@/lib/templatePrompt";
import {
  ParamControl,
  TemplateError,
  ChartErrorBoundary,
} from "@/components/TemplateParamForm";
import PlotlyChart from "@/components/PlotlyChart";
import { useDarkMode } from "@/lib/useDarkMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Save, Trash2, Check, AlertTriangle, FileCode,
  FileSpreadsheet, Eye, X, Pencil, Copy, Bot, ChevronDown, ChevronRight,
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
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
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

  const openEditor = (t: TemplateFile) => {
    setSelectedId(t.id);
    setCode(t.code);
    setDirty(false);
    setSamples([]);
    setPreviewParams({});
  };

  const closeEditor = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelectedId(null);
    setCode("");
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
      const created = await saveTemplate(id, STARTER_CODE);
      setNewId("");
      setCreating(false);
      await refresh();
      openEditor(created);
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

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_TEMPLATE_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy — select the text manually.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
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

        {/* ── AI prompt: hand this to your assistant to generate a template ── */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <button
                className="flex items-center gap-2 text-left"
                onClick={() => setShowPrompt((v) => !v)}
              >
                {showPrompt
                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Bot className="h-4 w-4" />
                <CardTitle className="text-base">Generate a template with AI</CardTitle>
              </button>
              <Button size="sm" variant="outline" onClick={handleCopyPrompt}>
                {copied ? (
                  <><Check className="mr-1.5 h-3.5 w-3.5" />Copied</>
                ) : (
                  <><Copy className="mr-1.5 h-3.5 w-3.5" />Copy prompt</>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Copy this prompt into ChatGPT / Claude / any assistant, describe the chart you want and
              paste a few sample CSV rows — it returns code you can paste straight into a new template.
            </p>
          </CardHeader>
          {showPrompt && (
            <CardContent>
              <pre className="rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-96 overflow-auto">
                {AI_TEMPLATE_PROMPT}
              </pre>
            </CardContent>
          )}
        </Card>

        {/* ── Template management ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Templates</CardTitle>
              {!creating && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New Template
                </Button>
              )}
            </div>
            {creating && (
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="template-id"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewId(""); }
                  }}
                  className="h-9 max-w-xs font-mono"
                  autoFocus
                />
                <Button size="sm" className="h-9" onClick={handleCreate} disabled={!newId.trim()}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Create
                </Button>
                <Button size="sm" variant="outline" className="h-9" onClick={() => { setCreating(false); setNewId(""); }}>
                  Cancel
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No templates yet. Create one, or ask your AI with the prompt above.
              </p>
            ) : (
              <div className="rounded-md border divide-y">
                {templates.map((t) => {
                  const compiled = compileTemplate(t.code);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-accent/50 cursor-pointer"
                      onClick={() => openEditor(t)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-mono text-sm">{t.id}</span>
                        {compiled.ok ? (
                          <span className="text-sm text-muted-foreground truncate">
                            {compiled.template.name}
                            {compiled.template.description ? ` — ${compiled.template.description}` : ""}
                          </span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Invalid
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); openEditor(t); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Editor + Preview overlay ── */}
      <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent
          className="sm:max-w-[96vw] 2xl:max-w-[1600px] max-h-[94vh] overflow-y-auto"
          showCloseButton
        >
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div className="flex items-center gap-2">
                <DialogTitle className="font-mono text-base">
                  {selectedId ? `${selectedId}.js` : ""}
                </DialogTitle>
                {compileStatus.ok ? (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="mr-1 h-3 w-3" />
                    Valid
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Invalid
                  </Badge>
                )}
              </div>
              <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                {saving ? "Saving..." : (<><Save className="mr-1.5 h-3.5 w-3.5" />Save</>)}
              </Button>
            </div>
            {!compileStatus.ok && (
              <p className="text-xs text-destructive font-mono">{compileStatus.error}</p>
            )}
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor */}
            <div className="space-y-2">
              <textarea
                value={code}
                onChange={(e) => { setCode(e.target.value); setDirty(true); }}
                spellCheck={false}
                className="w-full h-[70vh] rounded-md border bg-muted/30 p-3 font-mono text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Saved to <code>templates/{selectedId}.js</code>. Remember to commit to git.
                Saving with errors is allowed — the affected chart shows the error instead of crashing.
              </p>
            </div>

            {/* Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" />
                  Preview
                </span>
                <div>
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
                <div className="flex flex-wrap gap-1.5">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <div className="rounded-md border p-2 min-h-[300px]">
                {!compileStatus.ok ? (
                  <TemplateError error={compileStatus.error} />
                ) : samples.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
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
                      style={{ width: "100%", height: "55vh" }}
                      config={{ displaylogo: false }}
                    />
                  </ChartErrorBoundary>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 shadow-lg dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <Check className="h-4 w-4 shrink-0" />
          {toast}
        </div>
      )}
    </main>
  );
}
