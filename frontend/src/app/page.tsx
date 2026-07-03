"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getProjects, createProject, deleteProject,
  getFolderTree, createFolder, deleteFolder,
  type Project, type FolderTree,
} from "@/lib/api";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Calendar, FolderOpen, Database,
  Moon, Sun, ChevronRight, ChevronDown, FolderPlus,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [folderTree, setFolderTree] = useState<FolderTree[]>([]);
  const [rootProjects, setRootProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createFolderId, setCreateFolderId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<number | null>(null);

  // Dark mode
  const [dark, setDark] = useState(false);
  const darkInit = useRef(false);
  useEffect(() => {
    if (darkInit.current) return;
    darkInit.current = true;
    const stored = localStorage.getItem("viz-hist-dark");
    if (stored === "true" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
       
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);
  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("viz-hist-dark", String(next));
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [tree, projects] = await Promise.all([getFolderTree(), getProjects()]);
      setFolderTree(tree);
      // Root projects = projects not in any folder
      setRootProjects(projects.filter((p) => p.folder_id === null));
      setError(null);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
     
    void fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      setCreating(true);
      const project = await createProject(newName.trim(), createFolderId);
      setNewName("");
      setShowCreate(false);
      setCreateFolderId(null);
      router.push(`/projects/${project.id}`);
    } catch {
      setError("Failed to create project.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    try {
      await deleteProject(id);
      fetchData();
    } catch {
      setError("Failed to delete project.");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName.trim(), newFolderParentId);
      setNewFolderName("");
      setShowNewFolder(false);
      setNewFolderParentId(null);
      fetchData();
    } catch { setError("Failed to create folder."); }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation();
    if (!confirm("Delete this folder? Projects inside will be moved to root.")) return;
    try {
      await deleteFolder(folderId);
      fetchData();
    } catch { setError("Failed to delete folder."); }
  };

  const ProjectCard = ({ project }: { project: Project }) => (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/projects/${project.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{project.name}</CardTitle>
            <CardDescription>
              Created {format(new Date(project.created_at), "MMM d, yyyy HH:mm")}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={(e) => handleDelete(e, project.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Badge variant="outline" className="text-muted-foreground">
          <Database className="mr-1 h-3 w-3" />
          {project.version_count} version{project.version_count !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="outline" className="text-muted-foreground">
          <Calendar className="mr-1 h-3 w-3" />
          {format(new Date(project.created_at), "MMM d, yyyy")}
        </Badge>
      </CardContent>
    </Card>
  );

  const FolderNode = ({ folder, depth = 0 }: { folder: FolderTree; depth?: number }) => {
    const [expanded, setExpanded] = useState(true);
    const hasContent = folder.children.length > 0 || folder.projects.length > 0;

    return (
      <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
        <div className="flex items-center gap-1.5 py-1.5 group/folder">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-muted rounded text-muted-foreground"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{folder.name}</span>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 transition-opacity text-muted-foreground"
            onClick={() => { setCreateFolderId(folder.id); setShowCreate(true); }}
            title="New project in this folder"
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 transition-opacity text-muted-foreground"
            onClick={() => { setNewFolderParentId(folder.id); setShowNewFolder(true); }}
            title="New subfolder"
          >
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={(e) => handleDeleteFolder(e, folder.id)}
            title="Delete folder"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        {expanded && hasContent && (
          <div className="ml-3 border-l border-border pl-2">
            {folder.children.map((child) => (
              <FolderNode key={child.id} folder={child} depth={depth + 1} />
            ))}
            {folder.projects.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-2">
                {folder.projects.map((p) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">viz-hist</h1>
            <p className="text-muted-foreground mt-1">
              Visualize and compare historical data
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setNewFolderParentId(null); setShowNewFolder(true); }}>
              <FolderPlus className="mr-1.5 h-4 w-4" />
              New Folder
            </Button>
            <Button onClick={() => { setCreateFolderId(null); setShowCreate(!showCreate); }}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </div>
        </div>

        {/* New folder inline */}
        {showNewFolder && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {newFolderParentId ? "New Subfolder" : "New Folder"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                  autoFocus
                  className="flex-1"
                />
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                  Create
                </Button>
                <Button variant="outline" onClick={() => { setShowNewFolder(false); setNewFolderName(""); setNewFolderParentId(null); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create project inline card */}
        {showCreate && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Create New Project</CardTitle>
              <CardDescription>
                {createFolderId
                  ? "Project will be created inside the selected folder."
                  : "Give your project a name. You can upload CSV data and configure charts on the next page."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. Revenue Q4 2025"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                  className="flex-1"
                />
                <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                  {creating ? "Creating..." : "Create"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreate(false);
                    setNewName("");
                    setCreateFolderId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : folderTree.length === 0 && rootProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-lg mb-2">No projects yet</p>
              <p className="text-muted-foreground/70 text-sm mb-6">
                Create your first project to get started
              </p>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Folder tree */}
            {folderTree.length > 0 && (
              <div className="space-y-1">
                {folderTree.map((folder) => (
                  <FolderNode key={folder.id} folder={folder} />
                ))}
              </div>
            )}

            {/* Root projects (not in any folder) */}
            {rootProjects.length > 0 && (
              <div>
                {folderTree.length > 0 && (
                  <p className="text-sm text-muted-foreground mb-3 font-medium">Uncategorized</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rootProjects.map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
