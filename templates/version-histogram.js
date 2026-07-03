// viz-hist custom chart template — example
// Overlaid histogram of one column across all uploaded versions.
({
  name: "Version Histogram",
  description: "Distribution of a column, overlaid across versions",

  params: [
    { key: "column", label: "Column", type: "column" },
    { key: "bins", label: "Bins", type: "number", default: 30 },
    { key: "normalize", label: "Normalize", type: "boolean", default: false },
  ],

  render(ctx) {
    const { column, bins, normalize } = ctx.params;
    const data = ctx.versions.map((v) => ({
      type: "histogram",
      name: v.label,
      x: v.rows.map((r) => r[column]).filter((x) => x !== null && x !== undefined),
      nbinsx: bins || 30,
      opacity: 0.6,
      ...(normalize ? { histnorm: "probability" } : {}),
    }));
    return {
      data,
      layout: {
        barmode: "overlay",
        title: { text: column ? `Distribution of ${column}` : "Pick a column" },
        xaxis: { title: { text: column || "" } },
        yaxis: { title: { text: normalize ? "probability" : "count" } },
      },
    };
  },
})
