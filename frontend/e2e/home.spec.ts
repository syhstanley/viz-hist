import { test, expect } from "@playwright/test";
import { createProject, deleteProject } from "./helpers";

const API = process.env.API_URL || "http://localhost:8001";

test.describe("Home page", () => {
  test("shows header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "viz-hist" })).toBeVisible();
  });

  test("create project navigates to project page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create New" })).toBeVisible();
    await page.getByPlaceholder("e.g. Revenue Q4 2025").fill("E2E Create Test");
    await page.getByRole("button", { name: "Create Project" }).click();

    // Should navigate to project page
    await expect(page).toHaveURL(/\/projects\/\d+/);
    const projectId = Number(page.url().match(/\/projects\/(\d+)/)![1]);
    await expect(page.getByText("E2E Create Test")).toBeVisible();

    // Go back and verify project appears in list with version count badge
    await page.goto("/");
    const card = page.locator("[data-slot=card]", { hasText: "E2E Create Test" });
    await expect(card).toBeVisible();
    await expect(card.getByText("0 versions")).toBeVisible();

    // Cleanup
    await page.request.delete(`${API}/api/projects/${projectId}`);
  });

  test("project card shows version count via API setup", async ({ page }) => {
    const name = `VersionCount E2E ${Date.now()}`;
    const pid = await createProject(page, name);
    await page.goto("/");
    const card = page.locator("[data-slot=card]", { hasText: name });
    await expect(card).toBeVisible();
    await expect(card.getByText("0 versions")).toBeVisible();
    await deleteProject(page, pid);
  });

  test("templates link navigates to admin page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Templates" }).click();
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.getByRole("heading", { name: "Chart Templates" })).toBeVisible();
  });
});
