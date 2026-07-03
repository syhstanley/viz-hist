/**
 * Copy-pasteable prompt for an AI assistant to write a viz-hist chart
 * template. Shown on the /templates admin page.
 */
export const AI_TEMPLATE_PROMPT = `You are writing a custom chart template for "viz-hist", a tool that visualizes multiple uploaded CSV versions of the same dataset.

OUTPUT FORMAT
Reply with a single JavaScript expression (no imports, no markdown fence needed) of exactly this shape:

({
  name: "Human readable chart name",
  description: "One-line description",
  params: [
    // Each param becomes a UI control on the chart card.
    // type is one of:
    //   "string"  -> text input
    //   "number"  -> numeric input
    //   "boolean" -> checkbox
    //   "column"  -> dropdown of CSV column names
    //   "version" -> dropdown of uploaded versions (value = version id, number)
    //   "select"  -> dropdown of fixed choices, requires options: [...]
    { key: "column", label: "Y Column", type: "column" },
    { key: "window", label: "Window", type: "number", default: 7 },
  ],
  render(ctx) {
    // ctx.versions: Array<{ id: number, label: string, columns: string[],
    //                       rows: Array<Record<string, number|string|null>> }>
    //   -> one entry per uploaded CSV version, rows are parsed records
    // ctx.params: current values of the params declared above
    // ctx.dark: boolean, true when dark mode is active
    //
    // Return a Plotly figure: { data: [...traces], layout: {...} }
    return { data: [], layout: {} };
  },
})

HARD RULES
- The expression must evaluate in a browser with plain ES2020: no import/require, no network calls, no async, no DOM access.
- render() must be pure and fast; it re-runs on every param change.
- Cell values can be null (missing data) — filter or handle them, never assume numbers.
- Do not hardcode column names unless the user tells you to; prefer a "column" param.
- Layout: do not set paper_bgcolor/plot_bgcolor/font color (the app injects theme-aware defaults); do set axis titles and a meaningful title.
- Use ctx.dark only if you need extra theme-specific colors.
- Keep trace count reasonable (<50) for performance.

WHAT I WANT
Describe the chart here, and paste a few sample CSV rows (with header) so the AI knows the columns:
<describe your chart + paste sample data>`;
