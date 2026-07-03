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
  axis?: "left" | "right";
  scalar?: number;
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
  dataLen: number,
  allPlottedYCols: string[] = [],
  scalar: number = 1.0
): { hovertemplate: string; customdata?: (string | number)[][] } {
  const parts: string[] = [];
  const hasScale = scalar !== 1.0;

  // If no tooltip columns selected, disable tooltip entirely
  if (tooltipColumns.length === 0) {
    return { hovertemplate: "<extra></extra>" };
  }

  // Extra columns: anything in tooltipColumns that isn't x, own y, or another plotted y column
  const excludeSet = new Set([xColumn, yCol, ...allPlottedYCols]);
  const extraCols = tooltipColumns.filter((c) => !excludeSet.has(c));

  // customdata layout: [originalY (if scaled), ...extraCols]
  const customdata: (string | number)[][] = [];
  const customOffset = hasScale ? 1 : 0; // slot 0 = original Y when scaled

  for (let i = 0; i < dataLen; i++) {
    const row = dataRow(i);
    const cd: (string | number)[] = [];
    if (hasScale) cd.push(Number(row[yCol]));
    cd.push(...extraCols.map((c) => row[c] as string | number));
    customdata.push(cd);
  }

  // Show original value first, then scaled value
  if (hasScale) {
    parts.push(`<b>${yCol}</b>: %{customdata[0]} (×${scalar} = %{y})`);
  } else {
    parts.push(`<b>${yCol}</b>: %{y}`);
  }

  // Show x column if it's in tooltipColumns
  if (tooltipColumns.includes(xColumn)) {
    parts.push(`${xColumn}: %{x}`);
  }

  if (extraCols.length > 0) {
    const extraLines = extraCols
      .map((c, i) => `${c}: %{customdata[${i + customOffset}]}`)
      .join("<br>");
    parts.push(extraLines);
  }

  return {
    hovertemplate: parts.join("<br>") + "<extra></extra>",
    customdata: customdata.length > 0 ? customdata : undefined,
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

    const hasRightAxis = lines.some((l) => l.axis === "right");
    const allPlottedYCols = [...new Set(lines.map((l) => l.yColumn))];

    const traces: Plotly.Data[] = lines.map((line) => {
      const s = line.scalar ?? 1.0;
      const isRight = line.axis === "right";
      const x = line.data.map((r) => r[xColumn]);
      const y = line.data.map((r) => Number(r[line.yColumn]) * s);
      const hover = buildHoverTemplate(
        xColumn,
        line.yColumn,
        tooltipColumns,
        (i) => line.data[i],
        line.data.length,
        allPlottedYCols,
        s
      );
      const scaleSuffix = s !== 1.0 ? ` ×${s}` : "";
      return {
        x,
        y,
        type: "scatter" as const,
        mode: "lines+markers" as const,
        name: line.label + scaleSuffix,
        marker: { color: line.color, size: 4 },
        line: { width: 2 },
        yaxis: isRight ? "y2" : "y",
        ...hover,
      };
    });

    const leftCols = [...new Set(lines.filter((l) => l.axis !== "right").map((l) => l.yColumn))];
    const rightCols = [...new Set(lines.filter((l) => l.axis === "right").map((l) => l.yColumn))];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layout: any = {
      font: CHART_FONT,
      autosize: true,
      height: 500,
      margin: { t: 30, r: hasRightAxis ? 80 : 30, b: 60, l: 60 },
      xaxis: { title: { text: xColumn }, automargin: true },
      yaxis: { title: { text: leftCols.join(", ") }, automargin: true },
      hovermode: tooltipColumns.length === 0 ? false : "x unified",
      legend: { orientation: "h", y: -0.2 },
      dragmode: "zoom",
    };

    if (hasRightAxis) {
      layout.yaxis2 = {
        title: { text: rightCols.join(", ") },
        overlaying: "y",
        side: "right",
        automargin: true,
      };
    }

    return (
      <Plot
        data={traces}
        layout={layout}
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
