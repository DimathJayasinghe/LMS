"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Trash2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ApiSuccess, AvatarUploadUrlResult, User } from "@/lib/types";

/** Shared with the backend's AVATAR_IMAGE_MAX_SIZE_BYTES (5 MB). */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Shared with the backend's AVATAR_IMAGE_CONTENT_TYPES. */
const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Coerce a chosen filename into the backend's `^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$` shape. */
function safeAvatarName(name: string): string {
  const match = name.match(/\.(jpe?g|png|webp)$/i);
  const ext = match ? match[0].toLowerCase() : ".jpg";
  const base =
    name.replace(/\.(jpe?g|png|webp)$/i, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "avatar";
  return `${base}${ext}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + last).toUpperCase() || "?";
}

export function AvatarUpload({ user }: { user: User }) {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke the local object-URL preview on unmount / replace.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const upload = async (file: File): Promise<void> => {
    if (!AVATAR_CONTENT_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image exceeds the 5 MB limit.");
      return;
    }

    setBusy("upload");
    setError(null);
    try {
      const res = await api.post<ApiSuccess<AvatarUploadUrlResult>>(
        "/users/me/avatar/upload-url",
        {
          fileName: safeAvatarName(file.name),
          contentType: file.type,
          fileSizeBytes: file.size,
        },
      );
      const put = await fetch(res.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed. Please check your connection and try again.");

      // Confirm the image actually reached storage before persisting it.
      await api.post<ApiSuccess<{ profileImage: string }>>("/users/me/avatar/confirm", {
        key: res.data.key,
      });

      const objectUrl = URL.createObjectURL(file);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      router.refresh(); // so the TopBar avatar picks up the new image
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const remove = async (): Promise<void> => {
    setBusy("remove");
    setError(null);
    try {
      await api.del("/users/me/avatar");
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove the photo.");
    } finally {
      setBusy(null);
    }
  };

  const src = preview ?? user.profileImage ?? undefined;
  const hasImage = Boolean(src);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Profile photo
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown across the app. JPG, PNG, or WebP, up to 5 MB.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Avatar size="lg" className="size-16">
          {src ? <AvatarImage src={src} alt={user.name} /> : null}
          <AvatarFallback className="text-base font-medium">{initials(user.name)}</AvatarFallback>
        </Avatar>

        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {busy === "upload" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {hasImage ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy !== null}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </label>

          {hasImage && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void remove()}
              disabled={busy !== null}
            >
              {busy === "remove" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              Remove
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}
