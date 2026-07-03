import { test, expect } from "@playwright/test";
import { createProject, deleteProject } from "./helpers";

test.describe("Home page", () => {
  test("shows header", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("viz-hist")).toBeVisible();
  });

  test("create project navigates to project page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    await page.getByPlaceholder("e.g. Revenue Q4 2025").fill("E2E Create Test");
    await page.getByRole("button", { name: "Create" }).click();

    // Should navigate to project page
    await expect(page).toHaveURL(/\/projects\/\d+/);
    await expect(page.getByText("E2E Create Test")).toBeVisible();

    // Go back and verify project appears in list
    await page.goto("/");
    const card = page.locator("[data-slot=card]", { hasText: "E2E Create Test" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/\d+ versions?/)).toBeVisible();

    // Cleanup via API
    const href = await card.getAttribute("data-project-id").catch(() => null);
    // Fallback: delete via UI
    await card.hover();
    page.on("dialog", (d) => d.accept());
    await card.locator("button").last().click();
    await expect(card).not.toBeVisible({ timeout: 5000 });
  });

  test("project card shows version count via API setup", async ({ page }) => {
    const pid = await createProject(page, "VersionCount E2E");
    await page.goto("/");
    const card = page.locator("[data-slot=card]", { hasText: "VersionCount E2E" });
    await expect(card).toBeVisible();
    await expect(card.getByText("0 versions")).toBeVisible();
    await deleteProject(page, pid);
  });
});
