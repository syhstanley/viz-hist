/**
 * Custom chart template runtime.
 *
 * A template is a user-written JS file that evaluates to an object:
 *
 *   ({
 *     name: "My Chart",
 *     description: "optional",
 *     params: [
 *       { key: "column", label: "Y Column", type: "column", default: "" },
 *       { key: "window", label: "Window",   type: "number", default: 7 },
 *     ],
 *     render(ctx) {
 *       // ctx.versions: [{ id, label, columns, rows }]
 *       // ctx.params:   values for the params declared above
 *       // ctx.dark:     current dark-mode flag
 *       return { data: [...plotly traces], layout: {...} };
 *     },
 *   })
 *
 * User code is ONLY executed here, always inside try/catch, and the chart
 * itself renders behind a React error boundary — a broken template shows an
 * error card instead of crashing the app.
 */

export type ParamType = "string" | "number" | "boolean" | "column" | "version" | "select";

export interface TemplateParamDef {
  key: string;
  label?: string;
  type?: ParamType;
  default?: unknown;
  options?: (string | number)[]; // for type "select"
}

export interface TemplateVersionData {
  id: number;
  label: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface TemplateContext {
  versions: TemplateVersionData[];
  params: Record<string, unknown>;
  dark: boolean;
}

export interface PlotlyFigure {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
}

export interface CompiledTemplate {
  name: string;
  description?: string;
  params: TemplateParamDef[];
  render: (ctx: TemplateContext) => PlotlyFigure;
}

export type CompileResult =
  | { ok: true; template: CompiledTemplate }
  | { ok: false; error: string };

export type RenderResult =
  | { ok: true; figure: PlotlyFigure }
  | { ok: false; error: string };

/** Evaluate template source code. Never throws. */
export function compileTemplate(code: string): CompileResult {
  let value: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    value = new Function(`"use strict";\nreturn (\n${code}\n);`)();
  } catch (e) {
    return { ok: false, error: `Compile error: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (value === null || typeof value !== "object") {
    return { ok: false, error: "Template must evaluate to an object — wrap it in ({ ... })" };
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.render !== "function") {
    return { ok: false, error: "Template must define a render(ctx) function" };
  }
  const params: TemplateParamDef[] = [];
  if (obj.params !== undefined) {
    if (!Array.isArray(obj.params)) {
      return { ok: false, error: "Template 'params' must be an array" };
    }
    for (const p of obj.params) {
      if (!p || typeof p !== "object" || typeof (p as TemplateParamDef).key !== "string") {
        return { ok: false, error: "Each param must be an object with a string 'key'" };
      }
      params.push(p as TemplateParamDef);
    }
  }
  return {
    ok: true,
    template: {
      name: typeof obj.name === "string" && obj.name ? obj.name : "Unnamed Template",
      description: typeof obj.description === "string" ? obj.description : undefined,
      params,
      render: obj.render as CompiledTemplate["render"],
    },
  };
}

/** Run a compiled template's render(). Never throws. */
export function runTemplate(template: CompiledTemplate, ctx: TemplateContext): RenderResult {
  let figure: unknown;
  try {
    figure = template.render(ctx);
  } catch (e) {
    return { ok: false, error: `Render error: ${e instanceof Error ? e.stack || e.message : String(e)}` };
  }
  if (figure === null || typeof figure !== "object" || !Array.isArray((figure as PlotlyFigure).data)) {
    return { ok: false, error: "render(ctx) must return { data: [...traces], layout?: {...} }" };
  }
  return { ok: true, figure: figure as PlotlyFigure };
}

/** Initial param values: declared defaults overlaid with saved values. */
export function initialParams(
  defs: TemplateParamDef[],
  saved: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    out[d.key] = saved && d.key in saved ? saved[d.key] : d.default;
  }
  return out;
}
