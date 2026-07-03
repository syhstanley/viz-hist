import { test, expect } from "@playwright/test";
import { createProject, uploadCSV, deleteProject, CSV_V1, CSV_V2 } from "./helpers";

const API = process.env.API_URL || "http://localhost:8001";

test.describe("Project page", () => {
  let projectId: number;
  let v1Id: number;
  let v2Id: number;

  test.beforeEach(async ({ page }) => {
    projectId = await createProject(page, "E2E Project");
    v1Id = await uploadCSV(page, projectId, "v1", CSV_V1, "base.csv");
    v2Id = await uploadCSV(page, projectId, "v2", CSV_V2, "compare.csv");
    // Create a default line plot with one line so a chart renders
    const resp = await page.request.post(`${API}/api/projects/${projectId}/plots`, {
      data: {
        name: "Default",
        chart_type: "line",
        x_column: "time",
        lines: [{ version_id: v1Id, y_column: "value", color: "#3b82f6" }],
      },
    });
    expect(resp.ok()).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    await deleteProject(page, projectId);
  });

  test("loads project and shows line chart card", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: "E2E Project" })).toBeVisible();
    await expect(page.getByText("Default", { exact: true })).toBeVisible();
    await expect(page.locator(".js-plotly-plot")).toBeVisible({ timeout: 15000 });
  });

  test("project settings dialog opens and shows versions", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Project Settings" }).click();
    await expect(page.getByRole("heading", { name: "Project Settings" })).toBeVisible();
    await expect(page.getByText("base.csv")).toBeVisible();
    await expect(page.getByText("compare.csv")).toBeVisible();
  });

  test("plot settings dialog opens and shows config", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).first().click();
    // Dialog title is the plot config's name
    await expect(page.getByRole("heading", { name: "Default" })).toBeVisible();
    await expect(page.getByText("X Axis")).toBeVisible();
    await expect(page.getByText("Lines", { exact: true })).toBeVisible();
  });

  test("plot settings save shows toast and closes dialog", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).first().click();
    await expect(page.getByRole("heading", { name: "Default" })).toBeVisible();

    // Toggle a tooltip checkbox to make the config dirty
    const timeLabel = page.locator("label").filter({ hasText: /^time$/ });
    await timeLabel.click();

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Plot config saved")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Default" })).not.toBeVisible();
  });

  test("diff chart card shows base/compare selectors and renders", async ({ page }) => {
    // Create a diff plot via API
    const resp = await page.request.post(`${API}/api/projects/${projectId}/plots`, {
      data: { name: "My Diff", chart_type: "diff_line", lines: [] },
    });
    expect(resp.ok()).toBeTruthy();

    await page.goto(`/projects/${projectId}`);
    const diffCard = page.locator("[data-slot=card]", { hasText: "My Diff" });
    await expect(diffCard.getByText("Base Version", { exact: true })).toBeVisible();
    await expect(diffCard.getByText("Compare Version", { exact: true })).toBeVisible();

    // Select versions -> chart renders
    const comboboxes = diffCard.locator("[role=combobox]");
    await comboboxes.first().click();
    await page.getByRole("option", { name: "v1" }).click();
    await comboboxes.nth(1).click();
    await page.getByRole("option", { name: "v2" }).click();
    await expect(diffCard.locator(".js-plotly-plot")).toBeVisible({ timeout: 15000 });
  });

  test("custom template plot renders with params UI", async ({ page }) => {
    const templateId = `e2e-proj-tpl-${Date.now()}`;
    const put = await page.request.put(`${API}/api/templates/${templateId}`, {
      data: {
        code: `({
          name: "E2E Custom",
          params: [{ key: "column", label: "Pick Column", type: "column", default: "value" }],
          render(ctx) {
            const col = ctx.params.column;
            return {
              data: ctx.versions.map((v) => ({
                type: "scatter", mode: "lines", name: v.label,
                x: v.rows.map((r, i) => i),
                y: v.rows.map((r) => r[col]),
              })),
            };
          },
        })`,
      },
    });
    expect(put.ok()).toBeTruthy();

    const resp = await page.request.post(`${API}/api/projects/${projectId}/plots`, {
      data: {
        name: "Custom Plot",
        chart_type: "custom",
        metadata_json: { template_id: templateId, params: {} },
        lines: [],
      },
    });
    expect(resp.ok()).toBeTruthy();

    await page.goto(`/projects/${projectId}`);
    const card = page.locator("[data-slot=card]", { hasText: "Custom Plot" });
    await expect(card.getByText("Pick Column")).toBeVisible();
    await expect(card.locator(".js-plotly-plot")).toBeVisible({ timeout: 15000 });

    await page.request.delete(`${API}/api/templates/${templateId}`);
  });

  test("broken custom template shows error card, other plots unaffected", async ({ page }) => {
    const templateId = `e2e-broken-tpl-${Date.now()}`;
    await page.request.put(`${API}/api/templates/${templateId}`, {
      data: { code: `({ render() { throw new Error("e2e-render-crash"); } })` },
    });
    await page.request.post(`${API}/api/projects/${projectId}/plots`, {
      data: {
        name: "Broken Plot",
        chart_type: "custom",
        metadata_json: { template_id: templateId, params: {} },
        lines: [],
      },
    });

    await page.goto(`/projects/${projectId}`);
    // Broken card shows the error...
    const broken = page.locator("[data-slot=card]", { hasText: "Broken Plot" });
    await expect(broken.getByText("Template error")).toBeVisible();
    await expect(broken.getByText(/e2e-render-crash/)).toBeVisible();
    // ...while the healthy line chart still renders
    const healthy = page.locator("[data-slot=card]", { hasText: "Default" });
    await expect(healthy.locator(".js-plotly-plot")).toBeVisible({ timeout: 15000 });

    await page.request.delete(`${API}/api/templates/${templateId}`);
  });

  test("dual axis toggle in plot settings", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).first().click();

    const leftButton = page.locator("button[title*='Left Y axis']").first();
    await expect(leftButton).toBeVisible();
    await expect(leftButton).toHaveText("L");
    await leftButton.click();
    const rightButton = page.locator("button[title*='Right Y axis']").first();
    await expect(rightButton).toBeVisible();
    await expect(rightButton).toHaveText("R");
  });

  test("scale input accepts float values", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).first().click();

    const scaleInput = page.getByRole("spinbutton").first();
    await expect(scaleInput).toBeVisible();
    await expect(scaleInput).toHaveValue("1");
    await scaleInput.fill("0.5");
    await expect(scaleInput).toHaveValue("0.5");
  });
});
