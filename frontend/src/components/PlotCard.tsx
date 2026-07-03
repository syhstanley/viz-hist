"use client";

import React, { useEffect, useState, useMemo } from "react";
import { getVersionData, getDiff, type PlotConfig, type Version, type VersionData, type DiffResult } from "@/lib/api";
import { useDarkMode } from "@/lib/useDarkMode";
import ChartOverlay, { type TraceLine } from "./ChartOverlay";
import DiffChart, { type DiffDisplayMode } from "./DiffChart";
import CustomChartCard from "./CustomChartCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Settings, Trash2 } from "lucide-react";

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

interface PlotCardProps {
  config: PlotConfig;
  projectId: number;
  versions: Version[];
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

export default function PlotCard({ config, projectId, versions, onEdit, onDelete, canDelete }: PlotCardProps) {
  const dark = useDarkMode();

  if (config.chart_type === "custom") {
    return (
      <CustomChartCard
        config={config} projectId={projectId} versions={versions}
        onEdit={onEdit} onDelete={onDelete} canDelete={canDelete} dark={dark}
      />
    );
  }

  if (config.chart_type === "diff_line") {
    return (
      <DiffLinePlotCard
        config={config} projectId={projectId} versions={versions}
        onEdit={onEdit} onDelete={onDelete} canDelete={canDelete} dark={dark}
      />
    );
  }

  return (
    <LinePlotCard
      config={config} projectId={projectId} versions={versions}
      onEdit={onEdit} onDelete={onDelete} canDelete={canDelete} dark={dark}
    />
  );
}

// ── Line Chart Card ──

function LinePlotCard({ config, projectId, versions, onEdit, onDelete, canDelete, dark }: PlotCardProps & { dark: boolean }) {
  const [versionDataMap, setVersionDataMap] = useState<Map<number, Record<string, number | string>[]>>(new Map());
  const enabledLines = useMemo(() => config.lines.filter((l) => l.enabled), [config.lines]);

  useEffect(() => {
    const versionIds = new Set(enabledLines.map((l) => l.version_id).filter((id): id is number => id !== null));
    if (versionIds.size === 0) {
      const id = requestAnimationFrame(() => setVersionDataMap(new Map()));
      return () => cancelAnimationFrame(id);
    }
    const load = async () => {
      const newMap = new Map<number, Record<string, number | string>[]>();
      for (const vId of versionIds) {
        try {
          const vData: VersionData = await getVersionData(projectId, vId);
          newMap.set(vId, vData.rows);
        } catch { /* skip */ }
      }
      setVersionDataMap(newMap);
    };
    void load();
  }, [enabledLines, projectId]);

  const chartLines: TraceLine[] = useMemo(() => {
    return enabledLines
      .filter((l) => l.version_id !== null && versionDataMap.has(l.version_id))
      .map((l, idx) => {
        const ver = versions.find((v) => v.id === l.version_id);
        return {
          label: `${l.y_column} (${ver?.label || `v${l.version_id}`})`,
          data: versionDataMap.get(l.version_id!)!,
          yColumn: l.y_column,
          color: l.color || COLORS[idx % COLORS.length],
          axis: (l.axis === "right" ? "right" : "left") as "left" | "right",
          scalar: l.scalar ?? 1.0,
        };
      });
  }, [enabledLines, versionDataMap, versions]);

  const tooltipColumns = config.tooltip_columns ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{config.name}</CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">Line</Badge>
          </div>
          <div className="flex items-center gap-2">
            {enabledLines.length > 0 && (
              <Badge variant="secondary">
                {enabledLines.length} line{enabledLines.length !== 1 ? "s" : ""}
              </Badge>
            )}
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
      </CardHeader>
      <CardContent>
        <ChartOverlay lines={chartLines} xColumn={config.x_column || ""} tooltipColumns={tooltipColumns} dark={dark} />
      </CardContent>
    </Card>
  );
}

// ── Diff Line Chart Card ──

function DiffLinePlotCard({ config, projectId, versions, onEdit, onDelete, canDelete }: PlotCardProps & { dark: boolean }) {
  const meta = (config.metadata_json || {}) as {
    base_version_id?: number;
    compare_version_id?: number;
    display_mode?: DiffDisplayMode;
    y_column?: string;
  };

  const [baseVersionId, setBaseVersionId] = useState<number | null>(meta.base_version_id ?? null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(meta.compare_version_id ?? null);
  const [displayMode, setDisplayMode] = useState<DiffDisplayMode>(meta.display_mode ?? "overlay");
  const [diffYColumn, setDiffYColumn] = useState<string>(meta.y_column ?? "");
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  useEffect(() => {
    if (baseVersionId === null || compareVersionId === null) {
      const id = requestAnimationFrame(() => setDiffResult(null));
      return () => cancelAnimationFrame(id);
    }
    const load = async () => {
      try {
        const result = await getDiff(projectId, baseVersionId, compareVersionId);
        setDiffResult(result);
        if (!diffYColumn && result.columns.length > 0) setDiffYColumn(result.columns[0]);
      } catch { /* skip */ }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseVersionId, compareVersionId, projectId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{config.name}</CardTitle>
            <Badge variant="outline" className="text-xs text-muted-foreground">Diff</Badge>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Base Version</Label>
            <Select value={baseVersionId?.toString() ?? undefined} onValueChange={(v) => setBaseVersionId(v ? Number(v) : null)}>
              <SelectTrigger><SelectValue placeholder="Select...">{baseVersionId != null ? versions.find((v) => v.id === baseVersionId)?.label : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (<SelectItem key={v.id} value={v.id.toString()}>{v.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Compare Version</Label>
            <Select value={compareVersionId?.toString() ?? undefined} onValueChange={(v) => setCompareVersionId(v ? Number(v) : null)}>
              <SelectTrigger><SelectValue placeholder="Select...">{compareVersionId != null ? versions.find((v) => v.id === compareVersionId)?.label : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                {versions.map((v) => (<SelectItem key={v.id} value={v.id.toString()}>{v.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Display</Label>
            <div className="flex gap-1">
              {([["overlay", "Overlay"], ["absolute", "Abs Diff"], ["percentage", "% Diff"]] as const).map(([mode, modeLabel]) => (
                <Button key={mode} size="sm" variant={displayMode === mode ? "default" : "outline"} className="flex-1 text-xs" onClick={() => setDisplayMode(mode as DiffDisplayMode)}>
                  {modeLabel}
                </Button>
              ))}
            </div>
          </div>
          {diffResult && diffResult.columns.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Column</Label>
              <Select value={diffYColumn} onValueChange={(v) => v && setDiffYColumn(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {diffResult.columns.map((col) => (<SelectItem key={col} value={col}>{col}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {diffResult ? (
          <DiffChart
            baseData={diffResult.base}
            compareData={diffResult.compare}
            diffData={diffResult.diff}
            diffPctData={diffResult.diff_pct}
            timeColumn={diffResult.index_column}
            valueColumns={diffResult.columns}
            selectedYColumn={diffYColumn}
            displayMode={displayMode}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Select base and compare versions to view the diff.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
