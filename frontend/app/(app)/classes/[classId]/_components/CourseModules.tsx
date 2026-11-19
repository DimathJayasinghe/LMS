"use client";

import { useState } from "react";
import { BookOpen, Download, File, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type {
  ApiSuccess,
  CourseMaterial,
  CourseMaterialUploadUrlResult,
  CourseModule,
} from "@/lib/types";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : error instanceof Error ? error.message : fallback;
}

function fileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MaterialRow({
  classId,
  moduleId,
  material,
  canManage,
  onRemoved,
}: {
  classId: string;
  moduleId: string;
  material: CourseMaterial;
  canManage: boolean;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.get<ApiSuccess<{ url: string; fileName: string }>>(
        `/classes/${classId}/modules/${moduleId}/materials/${material.id}/download`,
      );
      const anchor = document.createElement("a");
      anchor.href = result.data.url;
      anchor.download = result.data.fileName;
      anchor.rel = "noopener noreferrer";
      anchor.click();
    } catch (caught) {
      setError(errorMessage(caught, "Could not prepare the download."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.del(
        `/classes/${classId}/modules/${moduleId}/materials/${material.id}`,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onRemoved();
    } catch (caught) {
      setError(errorMessage(caught, "Could not remove the material."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
      <File className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{material.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {material.fileName}{material.sizeBytes ? ` · ${fileSize(material.sizeBytes)}` : ""}
        </p>
        {material.description && <p className="mt-1 text-xs text-muted-foreground">{material.description}</p>}
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy || !material.downloadable} onClick={() => void download()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
        Download
      </Button>
      {canManage && (
        <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Remove ${material.title}`} onClick={() => void remove()}>
          <Trash2 className="text-destructive" aria-hidden />
        </Button>
      )}
    </li>
  );
}

function ModuleCard({
  classId,
  module,
  canManage,
  onChanged,
  onRemoved,
}: {
  classId: string;
  module: CourseModule;
  canManage: boolean;
  onChanged: (module: CourseModule) => void;
  onRemoved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (): Promise<void> => {
    setBusy("status");
    setError(null);
    try {
      const status = module.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      const result = await api.patch<ApiSuccess<CourseModule>>(
        `/classes/${classId}/modules/${module.id}`,
        { status },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onChanged(result.data);
    } catch (caught) {
      setError(errorMessage(caught, "Could not change module visibility."));
    } finally {
      setBusy(null);
    }
  };

  const upload = async (): Promise<void> => {
    if (!file || !title.trim()) {
      setError("Choose a file and enter a material title.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Choose a PDF, JPG, PNG, or WebP file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The file exceeds the 25 MB limit.");
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const presign = await api.post<ApiSuccess<CourseMaterialUploadUrlResult>>(
        `/classes/${classId}/modules/${module.id}/materials/upload-url`,
        { fileName: file.name, contentType: file.type, fileSizeBytes: file.size },
      );
      const stored = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!stored.ok) throw new Error("Upload failed. Check your connection and try again.");
      const confirmed = await api.post<ApiSuccess<CourseMaterial>>(
        `/classes/${classId}/modules/${module.id}/materials/confirm`,
        { key: presign.data.key, title: title.trim(), fileName: file.name },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onChanged({ ...module, materials: [...module.materials, confirmed.data] });
      setTitle("");
      setFile(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not upload the material."));
    } finally {
      setBusy(null);
    }
  };

  const removeModule = async (): Promise<void> => {
    setBusy("remove");
    setError(null);
    try {
      await api.del(`/classes/${classId}/modules/${module.id}`, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      onRemoved();
    } catch (caught) {
      setError(errorMessage(caught, "Could not remove the module."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{module.title}</h3>
            {canManage && <Badge variant="outline">{module.status === "PUBLISHED" ? "Published" : "Draft"}</Badge>}
          </div>
          {module.description && <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void changeStatus()}>
              {module.status === "PUBLISHED" ? "Move to draft" : "Publish"}
            </Button>
            <Button type="button" size="icon" variant="ghost" disabled={busy !== null} aria-label={`Remove module ${module.title}`} onClick={() => void removeModule()}>
              <Trash2 className="text-destructive" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {module.materials.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No materials in this module yet.</p>
      ) : (
        <ul className="space-y-2">
          {module.materials.map((material) => (
            <MaterialRow
              key={material.id}
              classId={classId}
              moduleId={module.id}
              material={material}
              canManage={canManage}
              onRemoved={() => onChanged({ ...module, materials: module.materials.filter((item) => item.id !== material.id) })}
            />
          ))}
        </ul>
      )}

      {canManage && (
        <div className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <input aria-label={`Material title for ${module.title}`} value={title} maxLength={200} placeholder="Material title" onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input aria-label={`File for ${module.title}`} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <Button type="button" disabled={busy !== null} onClick={() => void upload()}>
            {busy === "upload" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} Upload
          </Button>
          <p className="text-xs text-muted-foreground sm:col-span-3">Private PDF/JPG/PNG/WebP · maximum 25 MB and 25 megapixels for images. Students must be enrolled and paid for the current month to download.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </article>
  );
}

export function CourseModules({
  classId,
  initialModules,
  canManage,
}: {
  classId: string;
  initialModules: CourseModule[];
  canManage: boolean;
}) {
  const [modules, setModules] = useState(initialModules);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createModule = async (): Promise<void> => {
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<ApiSuccess<CourseModule>>(
        `/classes/${classId}/modules`,
        { title: title.trim() },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setModules((current) => [...current, result.data]);
      setTitle("");
    } catch (caught) {
      setError(errorMessage(caught, "Could not create the module."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <BookOpen className="size-4" aria-hidden /> Learning materials
        </h2>
      </div>
      {canManage && (
        <div className="mb-3 flex gap-2 rounded-xl border border-border bg-muted/30 p-3">
          <input aria-label="New module title" value={title} maxLength={200} placeholder="New module title" onChange={(event) => setTitle(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <Button type="button" disabled={busy || !title.trim()} onClick={() => void createModule()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} Add module
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          {canManage ? "Create the first module to organize downloadable lesson files." : "No learning materials have been published yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              classId={classId}
              module={module}
              canManage={canManage}
              onChanged={(updated) => setModules((current) => current.map((item) => item.id === updated.id ? updated : item))}
              onRemoved={() => setModules((current) => current.filter((item) => item.id !== module.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
