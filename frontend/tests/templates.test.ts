import { describe, expect, it } from "vitest";
import {
  compileTemplate,
  runTemplate,
  initialParams,
  type CompiledTemplate,
} from "@/lib/templates";

const VALID = `({
  name: "Test Chart",
  params: [{ key: "col", label: "Column", type: "column", default: "a" }],
  render(ctx) {
    return { data: [{ type: "scatter", y: ctx.versions.map(() => 1) }] };
  },
})`;

describe("compileTemplate", () => {
  it("compiles a valid template", () => {
    const r = compileTemplate(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.template.name).toBe("Test Chart");
      expect(r.template.params).toHaveLength(1);
    }
  });

  it("returns error on syntax error instead of throwing", () => {
    const r = compileTemplate("({ name: 'x', render() { return }} )}}}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Compile error/);
  });

  it("rejects non-object results", () => {
    expect(compileTemplate("42").ok).toBe(false);
    expect(compileTemplate("null").ok).toBe(false);
  });

  it("rejects missing render function", () => {
    const r = compileTemplate("({ name: 'x' })");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/render/);
  });

  it("rejects malformed params", () => {
    expect(compileTemplate("({ render() {}, params: 'no' })").ok).toBe(false);
    expect(compileTemplate("({ render() {}, params: [{}] })").ok).toBe(false);
  });

  it("defaults name when missing", () => {
    const r = compileTemplate("({ render() { return { data: [] }; } })");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.template.name).toBe("Unnamed Template");
  });
});

describe("runTemplate", () => {
  const ctx = { versions: [], params: {}, dark: false };

  const compiled = (code: string): CompiledTemplate => {
    const r = compileTemplate(code);
    if (!r.ok) throw new Error(r.error);
    return r.template;
  };

  it("returns figure for valid render", () => {
    const r = runTemplate(compiled(VALID), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Array.isArray(r.figure.data)).toBe(true);
  });

  it("catches exceptions thrown by user code", () => {
    const t = compiled(`({ render() { throw new Error("boom"); } })`);
    const r = runTemplate(t, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boom/);
  });

  it("rejects renders that return a bad shape", () => {
    const t = compiled(`({ render() { return { nope: true }; } })`);
    const r = runTemplate(t, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must return/);
  });

  it("infinite-safe: undefined return handled", () => {
    const t = compiled(`({ render() {} })`);
    expect(runTemplate(t, ctx).ok).toBe(false);
  });
});

describe("initialParams", () => {
  it("uses defaults then overlays saved values", () => {
    const defs = [
      { key: "a", default: 1 },
      { key: "b", default: "x" },
    ];
    expect(initialParams(defs, undefined)).toEqual({ a: 1, b: "x" });
    expect(initialParams(defs, { b: "saved" })).toEqual({ a: 1, b: "saved" });
  });
});
