import { test, expect } from "@playwright/test";
import { createProject, uploadCSV, deleteProject, CSV_V1, CSV_V2 } from "./helpers";

const API = process.env.API_URL || "http://localhost:8001";

test.describe("Project page", () => {
  let projectId: number;

  test.beforeEach(async ({ page }) => {
    projectId = await createProject(page, "E2E Project");
    await uploadCSV(page, projectId, "v1", CSV_V1, "base.csv");
    await uploadCSV(page, projectId, "v2", CSV_V2, "compare.csv");
    // Create a default plot config with lines so chart renders
    await page.request.post(`${API}/api/projects/${projectId}/plots`, {
      data: {
        name: "Default",
        x_column: "time",
        lines: [
          { version_id: 1, y_column: "value", color: "#3b82f6" },
        ],
      },
    });
  });

  test.afterEach(async ({ page }) => {
    await deleteProject(page, projectId);
  });

  test("loads project and shows chart", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText("E2E Project")).toBeVisible();
    await expect(page.getByText("Chart Overlay")).toBeVisible();
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
    await page.getByRole("button", { name: "Plot Settings" }).click();
    await expect(page.getByRole("heading", { name: "Plot Settings" })).toBeVisible();
    await expect(page.getByText("X Axis")).toBeVisible();
    await expect(page.getByText("Lines")).toBeVisible();
  });

  test("plot settings save shows toast and closes dialog", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).click();
    await expect(page.getByRole("heading", { name: "Plot Settings" })).toBeVisible();

    // Toggle a tooltip checkbox to make config dirty
    const timeLabel = page.locator("label").filter({ hasText: /^time$/ });
    await timeLabel.click();

    // Save
    await page.getByRole("button", { name: "Save" }).click();

    // Toast
    await expect(page.getByText("Plot config saved")).toBeVisible({ timeout: 5000 });
    // Dialog closed
    await expect(page.getByRole("heading", { name: "Plot Settings" })).not.toBeVisible();
  });

  test("diff toggle shows controls", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);

    // Toggle diff mode
    await page.getByRole("switch", { name: "Diff" }).click();
    await expect(page.getByText("Diff Chart")).toBeVisible();
    await expect(page.getByText("Base Version", { exact: true })).toBeVisible();

    // Toggle back
    await page.getByRole("switch", { name: "Diff" }).click();
    await expect(page.getByText("Chart Overlay")).toBeVisible();
  });

  test("diff loads chart after selecting versions", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("switch", { name: "Diff" }).click();

    // Select versions via combobox
    const comboboxes = page.locator("[role=combobox]");
    await comboboxes.first().click();
    await page.getByRole("option", { name: "v1" }).click();
    await comboboxes.nth(1).click();
    await page.getByRole("option", { name: "v2" }).click();

    // Wait for plotly chart
    await expect(page.locator(".js-plotly-plot")).toBeVisible({ timeout: 10000 });
  });

  test("dual axis toggle in plot settings", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).click();

    // Find axis toggle button (shows "L") by its title attribute
    const leftButton = page.locator("button[title*='Left Y axis']").first();
    await expect(leftButton).toBeVisible();
    await expect(leftButton).toHaveText("L");
    await leftButton.click();
    // After click, title changes to "Right Y axis" and text to "R"
    const rightButton = page.locator("button[title*='Right Y axis']").first();
    await expect(rightButton).toBeVisible();
    await expect(rightButton).toHaveText("R");
  });

  test("scale input accepts float values", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: "Plot Settings" }).click();

    const scaleInput = page.getByRole("spinbutton").first();
    await expect(scaleInput).toBeVisible();
    await expect(scaleInput).toHaveValue("1");
    await scaleInput.fill("0.5");
    await expect(scaleInput).toHaveValue("0.5");
  });
});
