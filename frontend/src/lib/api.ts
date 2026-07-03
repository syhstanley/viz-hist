import axios from "axios";

const client = axios.create({
  baseURL: "/api",
});

// ── Types ──

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
}

export interface FolderTree extends Folder {
  children: FolderTree[];
  projects: Project[];
}

export interface Project {
  id: number;
  name: string;
  folder_id: number | null;
  created_at: string;
  updated_at: string;
  version_count: number;
}

export interface SchemaField {
  name: string;
  dtype: string;
}

export interface Version {
  id: number;
  project_id: number;
  label: string;
  file_path: string;
  original_filename: string;
  schema_def: SchemaField[] | null;
  row_count: number | null;
  file_size: number | null;
  created_at: string;
}

export interface ProjectDetail extends Project {
  versions: Version[];
  plot_configs: PlotConfig[];
  default_plot_config: PlotConfig | null;
}

export interface PlotLine {
  id: number;
  plot_config_id: number;
  version_id: number | null;
  y_column: string;
  color: string;
  enabled: boolean;
  sort_order: number;
  axis: string;
  scalar: number;
}

export interface PlotConfig {
  id: number;
  project_id: number;
  name: string;
  chart_type: string;
  x_column: string | null;
  color_column: string | null;
  tooltip_columns: string[] | null;
  metadata_json: Record<string, unknown> | null;
  is_default: boolean;
  lines: PlotLine[];
  created_at: string;
  updated_at: string;
}

export interface PlotLineCreate {
  version_id: number;
  y_column: string;
  color?: string;
  enabled?: boolean;
  sort_order?: number;
  axis?: string;
  scalar?: number;
}

export interface PlotConfigCreate {
  name?: string;
  chart_type?: string;
  x_column?: string;
  color_column?: string;
  tooltip_columns?: string[];
  metadata_json?: Record<string, unknown>;
  lines?: PlotLineCreate[];
}

export interface PlotConfigUpdate {
  name?: string;
  chart_type?: string;
  x_column?: string;
  color_column?: string;
  tooltip_columns?: string[];
  metadata_json?: Record<string, unknown>;
  lines?: PlotLineCreate[];
}

export interface VersionData {
  columns: string[];
  rows: Record<string, number | string>[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface DiffResult {
  index_column: string;
  columns: string[];
  base: Record<string, number | string>[];
  compare: Record<string, number | string>[];
  diff: Record<string, number | string>[];
  diff_pct: Record<string, number | string>[];
}

// ── Folders ──

export async function getFolders(): Promise<Folder[]> {
  const res = await client.get<Folder[]>("/folders");
  return res.data;
}

export async function getFolderTree(): Promise<FolderTree[]> {
  const res = await client.get<FolderTree[]>("/folders/tree");
  return res.data;
}

export async function createFolder(
  name: string,
  parentId?: number | null
): Promise<Folder> {
  const res = await client.post<Folder>("/folders", {
    name,
    parent_id: parentId ?? null,
  });
  return res.data;
}

export async function updateFolder(
  folderId: number,
  data: { name?: string; parent_id?: number | null }
): Promise<Folder> {
  const res = await client.patch<Folder>(`/folders/${folderId}`, data);
  return res.data;
}

export async function deleteFolder(folderId: number): Promise<void> {
  await client.delete(`/folders/${folderId}`);
}

// ── Projects ──

export async function getProjects(): Promise<Project[]> {
  const res = await client.get<Project[]>("/projects");
  return res.data;
}

export async function createProject(
  name: string,
  folderId?: number | null
): Promise<Project> {
  const res = await client.post<Project>("/projects", {
    name,
    folder_id: folderId ?? null,
  });
  return res.data;
}

export async function getProject(id: number): Promise<ProjectDetail> {
  const res = await client.get<ProjectDetail>(`/projects/${id}`);
  return res.data;
}

export async function updateProject(
  id: number,
  data: { name?: string; folder_id?: number | null }
): Promise<Project> {
  const res = await client.patch<Project>(`/projects/${id}`, data);
  return res.data;
}

export async function deleteProject(id: number): Promise<void> {
  await client.delete(`/projects/${id}`);
}

// ── Versions ──

export async function getVersions(projectId: number): Promise<Version[]> {
  const res = await client.get<Version[]>(`/projects/${projectId}/versions`);
  return res.data;
}

export async function uploadCSV(
  projectId: number,
  file: File,
  label: string
): Promise<{ version: Version; schema_fields: SchemaField[]; rows: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("label", label);
  const res = await client.post(
    `/projects/${projectId}/upload`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function updateVersionLabel(
  projectId: number,
  versionId: number,
  label: string
): Promise<Version> {
  const res = await client.patch<Version>(
    `/projects/${projectId}/versions/${versionId}`,
    { label }
  );
  return res.data;
}

export async function deleteVersion(
  projectId: number,
  versionId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/versions/${versionId}`);
}

export async function getVersionData(
  projectId: number,
  versionId: number
): Promise<VersionData> {
  const res = await client.get<VersionData>(
    `/projects/${projectId}/versions/${versionId}/data`
  );
  return res.data;
}

// ── Plot Configs ──

export async function getPlotConfigs(projectId: number): Promise<PlotConfig[]> {
  const res = await client.get<PlotConfig[]>(`/projects/${projectId}/plots`);
  return res.data;
}

export async function createPlotConfig(
  projectId: number,
  config: PlotConfigCreate
): Promise<PlotConfig> {
  const res = await client.post<PlotConfig>(
    `/projects/${projectId}/plots`,
    config
  );
  return res.data;
}

export async function updatePlotConfig(
  projectId: number,
  configId: number,
  config: PlotConfigUpdate
): Promise<PlotConfig> {
  const res = await client.put<PlotConfig>(
    `/projects/${projectId}/plots/${configId}`,
    config
  );
  return res.data;
}

export async function deletePlotConfig(
  projectId: number,
  configId: number
): Promise<void> {
  await client.delete(`/projects/${projectId}/plots/${configId}`);
}

// ── Diff ──

export async function getDiff(
  projectId: number,
  baseId: number,
  compareId: number
): Promise<DiffResult> {
  const res = await client.get<DiffResult>(
    `/projects/${projectId}/diff`,
    { params: { base_id: baseId, compare_id: compareId } }
  );
  return res.data;
}
