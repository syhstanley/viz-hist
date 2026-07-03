import { test, expect, type Page } from "@playwright/test";

const API = process.env.API_URL || "http://localhost:8001";

const TEMPLATE_ID = `e2e-tpl-${Date.now()}`;

const VALID_TEMPLATE = `({
  name: "E2E Scatter",
  params: [
    { key: "column", label: "Y Column", type: "column" },
  ],
  render(ctx) {
    const col = ctx.params.column;
    const data = ctx.versions.map((v) => ({
      type: "scatter",
      mode: "lines",
      name: v.label,
      x: v.rows.map((r, i) => i),
      y: v.rows.map((r) => r[col]),
    }));
    return { data, layout: {} };
  },
})`;

async function deleteTemplateViaApi(page: Page, id: string) {
  await page.request.delete(`${API}/api/templates/${id}`).catch(() => {});
}

test.describe("templates admin page", () => {
  test.afterEach(async ({ page }) => {
    await deleteTemplateViaApi(page, TEMPLATE_ID);
  });

  test("create, edit, preview with sample CSV, and save a template", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "Chart Templates" })).toBeVisible();

    // AI prompt section is present with a copy button
    await expect(page.getByText("Generate a template with AI")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();

    // Create a new template -> editor overlay opens
    await page.getByRole("button", { name: "New Template" }).click();
    await page.getByPlaceholder("template-id").fill(TEMPLATE_ID);
    await page.getByPlaceholder("template-id").press("Enter");
    await expect(page.getByText(`${TEMPLATE_ID}.js`, { exact: true })).toBeVisible();

    // Starter code should compile
    await expect(page.getByText("Valid")).toBeVisible();

    // Paste our own code
    await page.locator("textarea").fill(VALID_TEMPLATE);
    await expect(page.getByText("Valid")).toBeVisible();

    // Preview asks for sample CSVs first
    await expect(page.getByText(/Add one or more sample CSV files/)).toBeVisible();

    // Add a sample CSV (client-side only)
    await page.locator("#sample-csv-upload").setInputFiles({
      name: "sample-a.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("time,value\n0,10\n1,20\n2,15\n"),
    });
    await expect(page.getByText("sample-a")).toBeVisible();
    await expect(page.getByText("(3 rows)")).toBeVisible();

    // Param form generated from template params
    await expect(page.getByText("Y Column", { exact: true })).toBeVisible();

    // Pick the column param -> plotly chart appears
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "value" }).click();
    await expect(page.locator(".js-plotly-plot")).toBeVisible({ timeout: 15000 });

    // Save persists to the backend
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`Template "${TEMPLATE_ID}" saved`)).toBeVisible();
    const resp = await page.request.get(`${API}/api/templates/${TEMPLATE_ID}`);
    expect(resp.ok()).toBeTruthy();
    expect((await resp.json()).code).toContain("E2E Scatter");
  });

  test("broken template code shows error instead of crashing the page", async ({ page }) => {
    await page.goto("/templates");

    await page.getByRole("button", { name: "New Template" }).click();
    await page.getByPlaceholder("template-id").fill(TEMPLATE_ID);
    await page.getByPlaceholder("template-id").press("Enter");
    await expect(page.getByText(`${TEMPLATE_ID}.js`, { exact: true })).toBeVisible();

    // Syntax error -> Invalid badge + error shown, page still alive
    await page.locator("textarea").fill("({ name: 'broken', render() { return }} ) }}}");
    await expect(page.getByText("Invalid")).toBeVisible();
    await expect(page.getByText(/Compile error/).first()).toBeVisible();

    // Runtime error -> preview shows render error, page still alive
    await page.locator("textarea").fill(`({ render() { throw new Error("boom-e2e"); } })`);
    await expect(page.getByText("Valid")).toBeVisible();
    await page.locator("#sample-csv-upload").setInputFiles({
      name: "s.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("a\n1\n"),
    });
    await expect(page.getByText(/boom-e2e/).first()).toBeVisible();

    // The editor overlay is still alive and functional
    await expect(page.getByText(`${TEMPLATE_ID}.js`, { exact: true })).toBeVisible();

    // Close the overlay (accept the unsaved-changes confirm) -> page intact
    page.on("dialog", (d) => d.accept());
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Chart Templates" })).toBeVisible();
  });
});
