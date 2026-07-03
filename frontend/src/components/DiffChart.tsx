"use client";

import React from "react";
import Plot from "./PlotlyChart";
import { useDarkMode } from "@/lib/useDarkMode";

function getChartTheme(dark: boolean) {
  return {
    font: {
      family: "Geist, system-ui, -apple-system, sans-serif",
      size: 13,
      color: dark ? "#e5e7eb" : "#374151",
    } as Partial<Plotly.Font>,
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    gridcolor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
    linecolor: dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)",
  };
}

type DiffDisplayMode = "overlay" | "absolute" | "percentage";

interface DiffChartProps {
  baseData: Record<string, number | string>[];
  compareData: Record<string, number | string>[];
  diffData: Record<string, number | string>[];
  diffPctData: Record<string, number | string>[];
  timeColumn: string;
  valueColumns: string[];
  selectedYColumn?: string;
  displayMode: DiffDisplayMode;
}

export type { DiffDisplayMode };

export default function DiffChart({
  baseData,
  compareData,
  diffData,
  diffPctData,
  timeColumn,
  valueColumns,
  selectedYColumn,
  displayMode,
}: DiffChartProps) {
  const dark = useDarkMode();
  const theme = getChartTheme(dark);

  if (baseData.length === 0 || compareData.length === 0 || valueColumns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select base and compare versions to view the diff.
      </div>
    );
  }

  const col = selectedYColumn && valueColumns.includes(selectedYColumn)
    ? selectedYColumn
    : valueColumns[0];

  const baseX = baseData.map((r) => r[timeColumn]);
  const baseY = baseData.map((r) => Number(r[col]));
  const compareX = compareData.map((r) => r[timeColumn]);
  const compareY = compareData.map((r) => Number(r[col]));

  let traces: Plotly.Data[];
  let yAxisTitle: string;

  if (displayMode === "overlay") {
    traces = [
      {
        x: baseX, y: baseY, type: "scatter", mode: "lines",
        name: "Base", line: { color: "#3b82f6", width: 2 },
      },
      {
        x: compareX, y: compareY, type: "scatter", mode: "lines",
        name: "Compare", line: { color: "#ef4444", width: 2 },
      },
      {
        x: [...baseX, ...[...compareX].reverse()],
        y: [...baseY, ...[...compareY].reverse()],
        type: "scatter", fill: "toself",
        fillcolor: "rgba(251, 191, 36, 0.2)",
        line: { color: "transparent" },
        name: "Diff Area", hoverinfo: "skip", showlegend: true,
      },
    ];
    yAxisTitle = col;
  } else if (displayMode === "absolute") {
    const diffX = diffData.map((r) => r[timeColumn]);
    const diffY = diffData.map((r) => Number(r[col]));
    const colors = diffY.map((v) => (v >= 0 ? "#10b981" : "#ef4444"));
    traces = [
      { x: diffX, y: diffY, type: "bar", name: "Diff (absolute)", marker: { color: colors } },
      {
        x: diffX, y: Array(diffX.length).fill(0), type: "scatter", mode: "lines",
        name: "Zero", line: { color: "#9ca3af", width: 1, dash: "dash" },
        showlegend: false, hoverinfo: "skip",
      },
    ];
    yAxisTitle = `${col} (compare - base)`;
  } else {
    const pctX = diffPctData.map((r) => r[timeColumn]);
    const pctY = diffPctData.map((r) => {
      const v = Number(r[col]);
      if (!isFinite(v)) return v > 0 ? 999 : -999;
      return v;
    });
    const colors = pctY.map((v) => (v >= 0 ? "#10b981" : "#ef4444"));
    traces = [
      {
        x: pctX, y: pctY, type: "bar", name: "Diff (%)",
        marker: { color: colors },
        hovertemplate: "%{x}<br>%{y:.2f}%<extra></extra>",
      },
      {
        x: pctX, y: Array(pctX.length).fill(0), type: "scatter", mode: "lines",
        name: "Zero", line: { color: "#9ca3af", width: 1, dash: "dash" },
        showlegend: false, hoverinfo: "skip",
      },
    ];
    yAxisTitle = `${col} (% change)`;
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-2">
        Showing diff for column: <span className="font-semibold">{col}</span>
        {valueColumns.length > 1 && ` (${valueColumns.length - 1} more columns available)`}
      </p>
      <Plot
        data={traces}
        layout={{
          font: theme.font,
          paper_bgcolor: theme.paper_bgcolor,
          plot_bgcolor: theme.plot_bgcolor,
          autosize: true,
          height: 500,
          margin: { t: 30, r: 30, b: 60, l: 60 },
          xaxis: { title: { text: timeColumn }, automargin: true, gridcolor: theme.gridcolor, linecolor: theme.linecolor },
          yaxis: {
            title: { text: yAxisTitle }, automargin: true,
            gridcolor: theme.gridcolor, linecolor: theme.linecolor,
            ...(displayMode === "percentage" ? { ticksuffix: "%" } : {}),
          },
          hovermode: "x unified",
          legend: { orientation: "h", y: -0.2, font: { color: theme.font.color } },
          dragmode: "zoom",
          bargap: 0.1,
        }}
        config={{ responsive: true, displayModeBar: true, scrollZoom: true }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
