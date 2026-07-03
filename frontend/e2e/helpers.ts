import { type Page, expect } from "@playwright/test";

const API = process.env.API_URL || "http://localhost:8001";

/**
 * Create a project via API and return its id.
 */
export async function createProject(page: Page, name: string): Promise<number> {
  const resp = await page.request.post(`${API}/api/projects`, {
    data: { name },
  });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data.id;
}

/**
 * Upload a CSV to a project via API and return version id.
 */
export async function uploadCSV(
  page: Page,
  projectId: number,
  label: string,
  csvContent: string,
  filename = "test.csv"
): Promise<number> {
  const resp = await page.request.post(
    `${API}/api/projects/${projectId}/upload`,
    {
      multipart: {
        file: { name: filename, mimeType: "text/csv", buffer: Buffer.from(csvContent) },
        label,
      },
    }
  );
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  return data.version.id;
}

/**
 * Delete a project via API.
 */
export async function deleteProject(page: Page, projectId: number) {
  await page.request.delete(`${API}/api/projects/${projectId}`);
}

export const CSV_V1 = "time,value,value2\n0,10,100.5\n1,20,200.3\n2,30,300.1\n";
export const CSV_V2 = "time,value,value2\n0,15,150.0\n1,25,250.0\n2,35,350.0\n";
