"use client";

import React from "react";
import Plot from "./PlotlyChart";

export interface Dataset {
  label: string;
  data: Record<string, number | string>[];
  color: string;
}

// A single trace line with explicit control
export interface TraceLine {
  label: string;         // legend name
  data: Record<string, number | string>[];
  yColumn: string;
  color: string;
}

interface ChartOverlayProps {
  // Legacy mode: datasets × yColumns cross-product
  datasets?: Dataset[];
  yColumns?: string[];
  colorColumn?: string;
  // New mode: explicit lines (takes priority)
  lines?: TraceLine[];
  // Shared
  xColumn: string;
  tooltipColumns: string[];
}

const DEFAULT_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

const CHART_FONT: Partial<Plotly.Font> = {
  family: "Geist, system-ui, -apple-system, sans-serif",
  size: 13,
  color: "#374151",
};

function buildHoverTemplate(
  xColumn: string,
  yCol: string,
  tooltipColumns: string[],
  dataRow: (idx: number) => Record<string, number | string>,
  dataLen: number
): { hovertemplate: string; customdata?: (string | number)[][] } {
  const parts: string[] = [];

  // If no tooltip columns selected, disable tooltip entirely
  if (tooltipColumns.length === 0) {
    return { hovertemplate: "<extra></extra>" };
  }

  // Show y value only if it's in tooltipColumns
  if (tooltipColumns.includes(yCol)) {
    parts.push(`<b>${yCol}</b>: %{y}`);
  }

  // Show x column only if it's in tooltipColumns
  if (tooltipColumns.includes(xColumn)) {
    parts.push(`${xColumn}: %{x}`);
  }

  // Extra columns: anything in tooltipColumns that isn't x or y
  const extraCols = tooltipColumns.filter((c) => c !== xColumn && c !== yCol);

  if (extraCols.length === 0) {
    return { hovertemplate: parts.join("<br>") + "<extra></extra>" };
  }

  const customdata: (string | number)[][] = [];
  for (let i = 0; i < dataLen; i++) {
    const row = dataRow(i);
    customdata.push(extraCols.map((c) => row[c] as string | number));
  }

  const extraLines = extraCols
    .map((c, i) => `${c}: %{customdata[${i}]}`)
    .join("<br>");

  parts.push(extraLines);

  return {
    hovertemplate: parts.join("<br>") + "<extra></extra>",
    customdata,
  };
}

export default function ChartOverlay({
  datasets,
  xColumn,
  yColumns,
  colorColumn,
  tooltipColumns,
  lines,
}: ChartOverlayProps) {
  // Use lines mode if provided
  if (lines) {
    if (lines.length === 0 || !xColumn) {
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Select versions and configure X / Y columns to display the chart.
        </div>
      );
    }

    const traces: Plotly.Data[] = lines.map((line) => {
      const x = line.data.map((r) => r[xColumn]);
      const y = line.data.map((r) => Number(r[line.yColumn]));
      const hover = buildHoverTemplate(
        xColumn,
        line.yColumn,
        tooltipColumns,
        (i) => line.data[i],
        line.data.length
      );
      return {
        x,
        y,
        type: "scatter" as const,
        mode: "lines+markers" as const,
        name: line.label,
        marker: { color: line.color, size: 4 },
        line: { width: 2 },
        ...hover,
      };
    });

    const allYCols = [...new Set(lines.map((l) => l.yColumn))];

    return (
      <Plot
        data={traces}
        layout={{
          font: CHART_FONT,
          autosize: true,
          height: 500,
          margin: { t: 30, r: 30, b: 60, l: 60 },
          xaxis: { title: { text: xColumn }, automargin: true },
          yaxis: { title: { text: allYCols.join(", ") }, automargin: true },
          hovermode: tooltipColumns.length === 0 ? false : "x unified",
          legend: { orientation: "h", y: -0.2 },
          dragmode: "zoom",
        }}
        config={{
          responsive: true,
          displayModeBar: true,
          scrollZoom: true,
          modeBarButtonsToAdd: ["toggleSpikelines"],
        }}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    );
  }

  // Legacy datasets × yColumns mode
  if (!datasets || datasets.length === 0 || !xColumn || !yColumns || yColumns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Select versions and configure X / Y columns to display the chart.
      </div>
    );
  }

  const traces: Plotly.Data[] = [];
  let colorIdx = 0;

  datasets.forEach((ds) => {
    if (colorColumn) {
      const groups = new Map<string, Record<string, number | string>[]>();
      ds.data.forEach((row) => {
        const key = String(row[colorColumn] ?? "");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
      });

      for (const [groupVal, rows] of groups) {
        const x = rows.map((r) => r[xColumn]);
        yColumns.forEach((yCol) => {
          const y = rows.map((r) => Number(r[yCol]));
          const hover = buildHoverTemplate(xColumn, yCol, tooltipColumns, (i) => rows[i], rows.length);
          traces.push({
            x, y,
            type: "scatter",
            mode: "lines+markers",
            name: `${yCol} | ${colorColumn}=${groupVal} (${ds.label})`,
            marker: { color: DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length], size: 4 },
            line: { width: 2 },
            ...hover,
          });
          colorIdx++;
        });
      }
    } else {
      const x = ds.data.map((r) => r[xColumn]);
      yColumns.forEach((yCol) => {
        const y = ds.data.map((r) => Number(r[yCol]));
        const hover = buildHoverTemplate(xColumn, yCol, tooltipColumns, (i) => ds.data[i], ds.data.length);
        traces.push({
          x, y,
          type: "scatter",
          mode: "lines+markers",
          name: `${yCol} (${ds.label})`,
          marker: { color: ds.color || DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length], size: 4 },
          line: { width: 2 },
          ...hover,
        });
        colorIdx++;
      });
    }
  });

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true,
        height: 500,
        margin: { t: 30, r: 30, b: 60, l: 60 },
        xaxis: { title: { text: xColumn }, automargin: true },
        yaxis: { title: { text: yColumns.join(", ") }, automargin: true },
        hovermode: tooltipColumns.length === 0 ? false : "x unified",
        legend: { orientation: "h", y: -0.2 },
        dragmode: "zoom",
      }}
      config={{
        responsive: true,
        displayModeBar: true,
        scrollZoom: true,
        modeBarButtonsToAdd: ["toggleSpikelines"],
      }}
      useResizeHandler
      style={{ width: "100%", height: "100%" }}
    />
  );
}
