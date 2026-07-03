"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getTemplate,
  getVersionData,
  updatePlotConfig,
  type PlotConfig,
  type Version,
} from "@/lib/api";
import {
  compileTemplate,
  runTemplate,
  initialParams,
  type CompiledTemplate,
  type TemplateVersionData,
} from "@/lib/templates";
import {
  ParamControl,
  TemplateError,
  ChartErrorBoundary,
} from "./TemplateParamForm";
import PlotlyChart from "./PlotlyChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings, Trash2 } from "lucide-react";
import type { PlotParams } from "react-plotly.js";

interface CustomChartCardProps {
  config: PlotConfig;
  projectId: number;
  versions: Version[];
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
  dark: boolean;
}

interface CustomMeta {
  template_id?: string;
  params?: Record<string, unknown>;
}

// ── Main card ──

export default function CustomChartCard({
  config, projectId, versions, onEdit, onDelete, canDelete, dark,
}: CustomChartCardProps) {
  const meta = (config.metadata_json || {}) as CustomMeta;
  const templateId = meta.template_id;

  const [template, setTemplate] = useState<CompiledTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [versionData, setVersionData] = useState<TemplateVersionData[]>([]);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [paramsReady, setParamsReady] = useState(false);

  // Load + compile template code
  useEffect(() => {
    let cancelled = false;
    if (!templateId) {
      setLoadError("No template selected (metadata_json.template_id is missing)");
      return;
    }
    (async () => {
      try {
        const file = await getTemplate(templateId);
        if (cancelled) return;
        const compiled = compileTemplate(file.code);
        if (compiled.ok) {
          setTemplate(compiled.template);
          setParams(initialParams(compiled.template.params, meta.params));
          setParamsReady(true);
          setLoadError(null);
        } else {
          setLoadError(compiled.error);
        }
      } catch {
        if (!cancelled) setLoadError(`Failed to load template "${templateId}" from server`);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, config.id]);

  // Load data for all versions of the project
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: TemplateVersionData[] = [];
      for (const v of versions) {
        try {
          const d = await getVersionData(projectId, v.id);
          out.push({
            id: v.id,
            label: v.label,
            columns: d.columns,
            rows: d.rows as Record<string, unknown>[],
          });
        } catch { /* skip unreadable versions */ }
      }
      if (!cancelled) setVersionData(out);
    })();
    return () => { cancelled = true; };
  }, [projectId, versions]);

  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const v of versions) for (const s of v.schema_def || []) set.add(s.name);
    return [...set];
  }, [versions]);

  const renderResult = useMemo(() => {
    if (!template || !paramsReady) return null;
    return runTemplate(template, { versions: versionData, params, dark });
  }, [template, paramsReady, versionData, params, dark]);

  const setParam = (key: string, value: unknown) => {
    const next = { ...params, [key]: value };
    setParams(next);
    // Persist fire-and-forget; UI already reflects the change
    void updatePlotConfig(projectId, config.id, {
      metadata_json: { ...meta, params: next },
    }).catch(() => { /* keep UI responsive even if persist fails */ });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{config.name}</CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {template?.name || templateId || "Custom"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={onEdit} title="Plot Settings">
              <Settings className="h-4 w-4" />
            </Button>
            {canDelete && (
              <Button variant="outline" size="icon" onClick={onDelete} title="Delete Plot" className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {template && template.params.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-3">
            {template.params.map((def) => (
              <ParamControl
                key={def.key}
                def={def}
                value={params[def.key]}
                versions={versions}
                columns={allColumns}
                onChange={(v) => setParam(def.key, v)}
              />
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loadError ? (
          <TemplateError error={loadError} />
        ) : !renderResult ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Loading template...
          </div>
        ) : !renderResult.ok ? (
          <TemplateError error={renderResult.error} />
        ) : (
          <ChartErrorBoundary resetKey={JSON.stringify(params) + versionData.length}>
            <PlotlyChart
              data={renderResult.figure.data as PlotParams["data"]}
              layout={{
                autosize: true,
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                font: { color: dark ? "#d4d4d8" : "#374151" },
                ...(renderResult.figure.layout || {}),
              } as PlotParams["layout"]}
              useResizeHandler
              style={{ width: "100%", height: "400px" }}
              config={{ displaylogo: false }}
            />
          </ChartErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
