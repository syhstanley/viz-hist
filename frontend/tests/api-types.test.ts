import { describe, it, expect } from "vitest";
import type {
  Project,
  PlotLine,
  PlotLineCreate,
  PlotConfig,
  Version,
} from "@/lib/api";

/**
 * Type-level tests — ensures API interfaces have the expected shape.
 * These catch regressions when backend schema changes aren't reflected in frontend types.
 */
describe("API type contracts", () => {
  it("Project has version_count", () => {
    const p: Project = {
      id: 1,
      name: "Test",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      version_count: 5,
    };
    expect(p.version_count).toBe(5);
  });

  it("PlotLine has axis and scalar", () => {
    const line: PlotLine = {
      id: 1,
      plot_config_id: 1,
      version_id: 1,
      y_column: "value",
      color: "#ff0000",
      enabled: true,
      sort_order: 0,
      axis: "right",
      scalar: 0.5,
    };
    expect(line.axis).toBe("right");
    expect(line.scalar).toBe(0.5);
  });

  it("PlotLineCreate axis and scalar are optional", () => {
    const create: PlotLineCreate = {
      version_id: 1,
      y_column: "value",
    };
    expect(create.axis).toBeUndefined();
    expect(create.scalar).toBeUndefined();

    const createFull: PlotLineCreate = {
      version_id: 1,
      y_column: "value",
      axis: "left",
      scalar: 2.0,
    };
    expect(createFull.axis).toBe("left");
    expect(createFull.scalar).toBe(2.0);
  });

  it("PlotConfig contains lines array", () => {
    const config: PlotConfig = {
      id: 1,
      project_id: 1,
      name: "Default",
      x_column: "time",
      color_column: null,
      tooltip_columns: ["value"],
      is_default: true,
      lines: [],
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    expect(config.lines).toEqual([]);
  });

  it("Version has schema_def, row_count, file_size", () => {
    const v: Version = {
      id: 1,
      project_id: 1,
      label: "v1",
      file_path: "/tmp/test.csv",
      original_filename: "test.csv",
      schema_def: [{ name: "time", dtype: "int" }],
      row_count: 100,
      file_size: 2048,
      created_at: "2026-01-01",
    };
    expect(v.row_count).toBe(100);
    expect(v.schema_def![0].name).toBe("time");
  });
});
