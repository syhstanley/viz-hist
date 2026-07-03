"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getProjects, createProject, deleteProject, updateProject,
  getFolderTree, getFolders, createFolder, deleteFolder, updateFolder,
  type Project, type Folder, type FolderTree,
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
  Moon, Sun, ChevronRight, ChevronDown, FolderPlus, FileText, MoveRight, MoreHorizontal, FileCode,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function HomePage() {
  const router = useRouter();
  const [folderTree, setFolderTree] = useState<FolderTree[]>([]);
  const [rootProjects, setRootProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMode, setCreateMode] = useState<"project" | "folder">("project");
  const [createFolderId, setCreateFolderId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Move dialog
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ type: "folder" | "project"; id: number; name: string } | null>(null);
  const [moveDestination, setMoveDestination] = useState<string>("__root__");
  const [allFolders, setAllFolders] = useState<Folder[]>([]);

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
      const [tree, projects, folders] = await Promise.all([getFolderTree(), getProjects(), getFolders()]);
      setFolderTree(tree);
      setAllFolders(folders);
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

  const openCreateDialog = (mode: "project" | "folder", folderId: number | null = null) => {
    setCreateMode(mode);
    setCreateFolderId(folderId);
    setNewName("");
    setShowCreateDialog(true);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      setCreating(true);
      if (createMode === "project") {
        const project = await createProject(newName.trim(), createFolderId);
        setShowCreateDialog(false);
        setNewName("");
        router.push(`/projects/${project.id}`);
        return;
      } else {
        await createFolder(newName.trim(), createFolderId);
      }
      setShowCreateDialog(false);
      setNewName("");
      fetchData();
    } catch {
      setError(`Failed to create ${createMode}.`);
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

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation();
    if (!confirm("Delete this folder? Projects inside will be moved to root.")) return;
    try {
      await deleteFolder(folderId);
      fetchData();
    } catch { setError("Failed to delete folder."); }
  };

  const openMoveDialog = (type: "folder" | "project", id: number, name: string) => {
    setMoveTarget({ type, id, name });
    setMoveDestination("__root__");
    setShowMoveDialog(true);
  };

  const handleMove = async () => {
    if (!moveTarget) return;
    const destId = moveDestination === "__root__" ? null : Number(moveDestination);
    try {
      if (moveTarget.type === "folder") {
        await updateFolder(moveTarget.id, { parent_id: destId });
      } else {
        await updateProject(moveTarget.id, { folder_id: destId });
      }
      setShowMoveDialog(false);
      setMoveTarget(null);
      fetchData();
    } catch { setError("Failed to move item."); }
  };

  const ProjectCard = ({ project }: { project: Project }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    return (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md relative"
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
          <div className="relative">
            <Button
              variant="ghost" size="icon"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground h-7 w-7"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
                <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md" onClick={(e) => e.stopPropagation()}>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); openMoveDialog("project", project.id, project.name); }}>
                    <MoveRight className="h-3.5 w-3.5" /> Move
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted text-destructive" onClick={(e) => { setMenuOpen(false); handleDelete(e as unknown as React.MouseEvent, project.id); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
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
  };

  const FolderNode = ({ folder, depth = 0 }: { folder: FolderTree; depth?: number }) => {
    const [expanded, setExpanded] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
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
          <div className="relative">
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 transition-opacity text-muted-foreground"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute left-0 top-7 z-50 min-w-[160px] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); openCreateDialog("project", folder.id); }}>
                    <Plus className="h-3.5 w-3.5" /> New Project
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); openCreateDialog("folder", folder.id); }}>
                    <FolderPlus className="h-3.5 w-3.5" /> New Subfolder
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted" onClick={() => { setMenuOpen(false); openMoveDialog("folder", folder.id, folder.name); }}>
                    <MoveRight className="h-3.5 w-3.5" /> Move
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-muted text-destructive" onClick={(e) => { setMenuOpen(false); handleDeleteFolder(e as unknown as React.MouseEvent, folder.id); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
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
            <Link href="/templates">
              <Button variant="outline">
                <FileCode className="mr-2 h-4 w-4" />
                Templates
              </Button>
            </Link>
            <Button variant="outline" size="icon" onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button onClick={() => openCreateDialog("project")}>
              <Plus className="mr-2 h-4 w-4" />
              New
            </Button>
          </div>
        </div>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={createMode === "project" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCreateMode("project")}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Project
                </Button>
                <Button
                  variant={createMode === "folder" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCreateMode("folder")}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Folder
                </Button>
              </div>
              <Input
                placeholder={createMode === "project" ? "e.g. Revenue Q4 2025" : "Folder name"}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button className="w-full" onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? "Creating..." : `Create ${createMode === "project" ? "Project" : "Folder"}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Move Dialog */}
        <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Move {moveTarget?.type === "folder" ? "Folder" : "Project"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Move <span className="font-medium text-foreground">{moveTarget?.name}</span> to:
              </p>
              <Select value={moveDestination} onValueChange={(v) => setMoveDestination(v ?? "__root__")}>
                <SelectTrigger>
                  <SelectValue>
                    {moveDestination === "__root__"
                      ? "/ (Root)"
                      : allFolders.find((f) => f.id.toString() === moveDestination)?.name ?? moveDestination}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">/ (Root)</SelectItem>
                  {allFolders
                    .filter((f) => !(moveTarget?.type === "folder" && f.id === moveTarget.id))
                    .map((f) => (
                      <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button className="w-full" onClick={handleMove}>
                Move
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
              <Button onClick={() => openCreateDialog("project")}>
                <Plus className="mr-2 h-4 w-4" />
                New
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
