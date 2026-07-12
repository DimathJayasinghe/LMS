/** Shared with the backend's NIC_IMAGE_MAX_SIZE_BYTES (10 MB). */
export const MAX_NIC_IMAGE_BYTES = 10 * 1024 * 1024;

/** Coerce a chosen filename into the backend's `^[A-Za-z0-9._-]+\.(jpg|jpeg|png)$` shape. */
export function safeImageName(name: string): string {
  const match = name.match(/\.(jpe?g|png)$/i);
  const ext = match ? match[0].toLowerCase() : ".jpg";
  const base = name.replace(/\.(jpe?g|png)$/i, "").replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  return `${base}${ext}`;
}
