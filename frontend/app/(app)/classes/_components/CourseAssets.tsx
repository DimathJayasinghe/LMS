"use client";

import { useState } from "react";
import { AlertCircle, ImageUp, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, Course, CourseAssetUploadUrlResult } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type AssetKind = "BANNER" | "BACKDROP";

const config = {
  BANNER: { label: "Class banner", path: "banner", width: 1600, height: 600 },
  BACKDROP: { label: "Class backdrop", path: "backdrop", width: 1920, height: 1080 },
} as const;

async function dimensionsOf(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  const result = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return result;
}

function safeImageName(name: string, contentType: string): string {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const base = name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "class-image";
  return `${base}.${extension}`;
}

function AssetEditor({
  kind,
  course,
  onCourse,
}: {
  kind: AssetKind;
  course: Course;
  onCourse: (course: Course) => void;
}) {
  const details = config[kind];
  const imageUrl = kind === "BANNER" ? course.bannerUrl : course.backdropUrl;
  const existingAlt = kind === "BANNER" ? course.bannerAlt : course.backdropAlt;
  const [altText, setAltText] = useState(existingAlt ?? `${course.name} ${details.path}`);
  const [busy, setBusy] = useState<"upload" | "remove" | "alt" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File): Promise<void> => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image. SVG files are not accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image exceeds the 8 MB limit.");
      return;
    }

    setBusy("upload");
    setError(null);
    try {
      const dimensions = await dimensionsOf(file);
      if (dimensions && (dimensions.width !== details.width || dimensions.height !== details.height)) {
        throw new Error(
          `${details.label} must be exactly ${details.width}×${details.height} pixels; selected image is ${dimensions.width}×${dimensions.height}.`,
        );
      }

      const presign = await api.post<ApiSuccess<CourseAssetUploadUrlResult>>(
        `/classes/${course.id}/assets/upload-url`,
        {
          kind,
          fileName: safeImageName(file.name, file.type),
          contentType: file.type,
          fileSizeBytes: file.size,
        },
      );
      const stored = await fetch(presign.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!stored.ok) throw new Error("Upload failed. Check your connection and try again.");

      const confirmed = await api.post<ApiSuccess<Course>>(
        `/classes/${course.id}/assets/confirm`,
        { kind, key: presign.data.key, altText: altText.trim() || undefined },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onCourse(confirmed.data);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Could not upload the image.",
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy("remove");
    setError(null);
    try {
      const result = await api.del<ApiSuccess<Course>>(
        `/classes/${course.id}/assets/${details.path}`,
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onCourse(result.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove the image.");
    } finally {
      setBusy(null);
    }
  };

  const saveAlt = async (): Promise<void> => {
    if (!altText.trim()) {
      setError("Image description cannot be empty.");
      return;
    }
    setBusy("alt");
    setError(null);
    try {
      const result = await api.patch<ApiSuccess<Course>>(
        `/classes/${course.id}/assets/${details.path}/alt`,
        { altText: altText.trim() },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onCourse(result.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the image description.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div>
        <h3 className="font-medium">{details.label}</h3>
        <p className="text-xs text-muted-foreground">
          Exactly {details.width}×{details.height} px · JPG, PNG, or WebP · maximum 8 MB
        </p>
      </div>

      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={altText}
          className={`w-full rounded-lg border border-border object-cover ${kind === "BANNER" ? "aspect-[8/3]" : "aspect-video"}`}
        />
      ) : (
        <div className={`grid place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground ${kind === "BANNER" ? "aspect-[8/3]" : "aspect-video"}`}>
          No {details.path} uploaded
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={`${details.path}-alt`} className="text-sm font-medium">
          Image description
        </label>
        <input
          id={`${details.path}-alt`}
          value={altText}
          maxLength={200}
          onChange={(event) => setAltText(event.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">Describe meaningful text or imagery for screen-reader users.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted ${busy ? "pointer-events-none opacity-60" : ""}`}>
          {busy === "upload" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageUp className="size-4" aria-hidden />}
          {imageUrl ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        {imageUrl ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null || !altText.trim() || altText.trim() === (existingAlt ?? "")}
              onClick={() => void saveAlt()}
            >
              {busy === "alt" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              Save description
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void remove()}>
              {busy === "remove" ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Remove
            </Button>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function CourseAssets({ initialCourse }: { initialCourse: Course }) {
  const [course, setCourse] = useState(initialCourse);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AssetEditor kind="BANNER" course={course} onCourse={setCourse} />
      <AssetEditor kind="BACKDROP" course={course} onCourse={setCourse} />
    </div>
  );
}
