"use client";

import React, { useEffect, useState, useMemo } from "react";
import { getVersionData, type PlotConfig, type Version, type VersionData } from "@/lib/api";
import { useDarkMode } from "@/lib/useDarkMode";
import ChartOverlay, { type TraceLine } from "./ChartOverlay";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [versionDataMap, setVersionDataMap] = useState<Map<number, Record<string, number | string>[]>>(new Map());
  const dark = useDarkMode();

  const enabledLines = useMemo(() => config.lines.filter((l) => l.enabled), [config.lines]);

  // Load version data for enabled lines
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
          <CardTitle className="text-lg">{config.name}</CardTitle>
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
        <ChartOverlay
          lines={chartLines}
          xColumn={config.x_column || ""}
          tooltipColumns={tooltipColumns}
          dark={dark}
        />
      </CardContent>
    </Card>
  );
}
