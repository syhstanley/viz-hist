import { describe, it, expect } from "vitest";
import type {
  Project,
  PlotLine,
  PlotLineCreate,
  PlotConfig,
  Version,
  Folder,
  FolderTree,
} from "@/lib/api";

/**
 * Type-level tests — ensures API interfaces have the expected shape.
 * These catch regressions when backend schema changes aren't reflected in frontend types.
 */
describe("API type contracts", () => {
  it("Project has version_count and folder_id", () => {
    const p: Project = {
      id: 1,
      name: "Test",
      folder_id: 2,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      version_count: 5,
    };
    expect(p.version_count).toBe(5);
    expect(p.folder_id).toBe(2);
  });

  it("Project folder_id can be null", () => {
    const p: Project = {
      id: 1,
      name: "Root Project",
      folder_id: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      version_count: 0,
    };
    expect(p.folder_id).toBeNull();
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

  it("PlotConfig has chart_type and metadata_json", () => {
    const config: PlotConfig = {
      id: 1,
      project_id: 1,
      name: "Default",
      chart_type: "line",
      x_column: "time",
      color_column: null,
      tooltip_columns: ["value"],
      metadata_json: null,
      is_default: true,
      lines: [],
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    expect(config.chart_type).toBe("line");
    expect(config.metadata_json).toBeNull();
  });

  it("PlotConfig diff_line with metadata", () => {
    const config: PlotConfig = {
      id: 2,
      project_id: 1,
      name: "Diff",
      chart_type: "diff_line",
      x_column: null,
      color_column: null,
      tooltip_columns: null,
      metadata_json: { base_version_id: 1, compare_version_id: 2, display_mode: "overlay" },
      is_default: false,
      lines: [],
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    expect(config.chart_type).toBe("diff_line");
    expect(config.metadata_json?.base_version_id).toBe(1);
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

  it("Folder has parent_id", () => {
    const f: Folder = {
      id: 1,
      name: "Root",
      parent_id: null,
      created_at: "2026-01-01",
    };
    expect(f.parent_id).toBeNull();
  });

  it("FolderTree has children and projects", () => {
    const tree: FolderTree = {
      id: 1,
      name: "Root",
      parent_id: null,
      created_at: "2026-01-01",
      children: [
        {
          id: 2,
          name: "Child",
          parent_id: 1,
          created_at: "2026-01-01",
          children: [],
          projects: [],
        },
      ],
      projects: [
        {
          id: 1,
          name: "Project",
          folder_id: 1,
          created_at: "2026-01-01",
          updated_at: "2026-01-01",
          version_count: 3,
        },
      ],
    };
    expect(tree.children).toHaveLength(1);
    expect(tree.projects).toHaveLength(1);
    expect(tree.children[0].parent_id).toBe(1);
  });
});
