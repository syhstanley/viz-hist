import { describe, it, expect } from "vitest";
import { buildHoverTemplate } from "@/components/ChartOverlay";

const ROWS = [
  { time: 0, value: 10, value2: 100, category: "A" },
  { time: 1, value: 20, value2: 200, category: "B" },
  { time: 2, value: 30, value2: 300, category: "A" },
];

const dataRow = (i: number) => ROWS[i] as Record<string, number | string>;

describe("buildHoverTemplate", () => {
  it("disables tooltip when tooltipColumns is empty", () => {
    const result = buildHoverTemplate("time", "value", [], dataRow, 3);
    expect(result.hovertemplate).toBe("<extra></extra>");
    expect(result.customdata).toBeUndefined();
  });

  it("always shows own Y column value with %{y}", () => {
    const result = buildHoverTemplate("time", "value", ["value"], dataRow, 3);
    expect(result.hovertemplate).toContain("<b>value</b>: %{y}");
  });

  it("shows X column when included in tooltipColumns", () => {
    const result = buildHoverTemplate("time", "value", ["value", "time"], dataRow, 3);
    expect(result.hovertemplate).toContain("time: %{x}");
  });

  it("does not show X column when not in tooltipColumns", () => {
    const result = buildHoverTemplate("time", "value", ["value"], dataRow, 3);
    expect(result.hovertemplate).not.toContain("time: %{x}");
  });

  it("excludes other plotted Y columns from extra columns", () => {
    // value2 is another plotted column — should NOT appear as extra
    const result = buildHoverTemplate(
      "time", "value", ["value", "value2", "category"], dataRow, 3,
      ["value", "value2"] // allPlottedYCols
    );
    expect(result.hovertemplate).toContain("<b>value</b>: %{y}");
    expect(result.hovertemplate).toContain("category:");
    expect(result.hovertemplate).not.toContain("value2:");
  });

  it("includes non-plotted columns as extra with customdata", () => {
    const result = buildHoverTemplate(
      "time", "value", ["value", "category"], dataRow, 3, ["value"]
    );
    expect(result.hovertemplate).toContain("category: %{customdata[0]}");
    expect(result.customdata).toHaveLength(3);
    expect(result.customdata![0]).toEqual(["A"]);
    expect(result.customdata![1]).toEqual(["B"]);
  });

  it("shows original and scaled value when scalar != 1", () => {
    const result = buildHoverTemplate(
      "time", "value", ["value"], dataRow, 3, ["value"], 0.5
    );
    expect(result.hovertemplate).toContain("<b>value</b>: %{customdata[0]} (×0.5 = %{y})");
    // customdata[0] should be original values
    expect(result.customdata![0][0]).toBe(10);
    expect(result.customdata![1][0]).toBe(20);
  });

  it("does not show scale notation when scalar is 1", () => {
    const result = buildHoverTemplate(
      "time", "value", ["value"], dataRow, 3, ["value"], 1.0
    );
    expect(result.hovertemplate).toContain("<b>value</b>: %{y}");
    expect(result.hovertemplate).not.toContain("×");
  });

  it("combines scaled value + extra columns correctly", () => {
    const result = buildHoverTemplate(
      "time", "value", ["value", "category"], dataRow, 3,
      ["value"], 2.0
    );
    // customdata[0] = original Y, customdata[1] = category
    expect(result.hovertemplate).toContain("<b>value</b>: %{customdata[0]} (×2 = %{y})");
    expect(result.hovertemplate).toContain("category: %{customdata[1]}");
    expect(result.customdata![0]).toEqual([10, "A"]);
    expect(result.customdata![2]).toEqual([30, "A"]);
  });

  it("ends template with <extra></extra> to hide trace box", () => {
    const result = buildHoverTemplate("time", "value", ["value"], dataRow, 3);
    expect(result.hovertemplate).toMatch(/<extra><\/extra>$/);
  });
});
