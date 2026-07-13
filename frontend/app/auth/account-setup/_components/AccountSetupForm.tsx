"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { MAX_NIC_IMAGE_BYTES, safeImageName } from "@/lib/setup";
import type { ApiSuccess, Institute, NicUploadUrlResult, StudentBarcode } from "@/lib/types";

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type Side = "FRONT" | "BACK";

interface AccountSetupFormProps {
  institutes: Institute[];
  initialBarcodes: StudentBarcode[];
  initialSetupCompleted: boolean;
  initialNicFrontUploaded: boolean;
  initialNicBackUploaded: boolean;
}

function NicPhotoField({
  side,
  uploaded,
  uploading,
  previewUrl,
  onSelect,
}: {
  side: Side;
  uploaded: boolean;
  uploading: boolean;
  previewUrl: string | null;
  onSelect: (file: File) => void;
}) {
  const label = side === "FRONT" ? "NIC — front" : "NIC — back";
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex items-center gap-3">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="size-12 shrink-0 rounded-md border border-border object-cover"
          />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelect(file);
            e.target.value = "";
          }}
          className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground`}
        />
        {uploading ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        ) : uploaded ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {uploaded ? "Uploaded — choose a file again to replace it." : "JPG or PNG, up to 10 MB."}
      </p>
    </div>
  );
}

export function AccountSetupForm({
  institutes,
  initialBarcodes,
  initialSetupCompleted,
  initialNicFrontUploaded,
  initialNicBackUploaded,
}: AccountSetupFormProps) {
  const router = useRouter();
  const [nicFrontUploaded, setNicFrontUploaded] = useState(initialNicFrontUploaded);
  const [nicBackUploaded, setNicBackUploaded] = useState(initialNicBackUploaded);
  const [setupCompleted, setSetupCompleted] = useState(initialSetupCompleted);
  const [uploadingSide, setUploadingSide] = useState<Side | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Local object-URL previews of the just-uploaded photos (revoked on replace/unmount).
  const [previews, setPreviews] = useState<{ FRONT: string | null; BACK: string | null }>({
    FRONT: null,
    BACK: null,
  });
  useEffect(() => {
    return () => {
      Object.values(previews).forEach((url) => url && URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [barcodes, setBarcodes] = useState(initialBarcodes);
  const availableInstitutes = institutes.filter(
    (i) => !barcodes.some((b) => b.instituteId === i.id),
  );
  const [instituteId, setInstituteId] = useState(availableInstitutes[0]?.id ?? "");
  const [barcodeValue, setBarcodeValue] = useState("");
  const [barcodeSubmitting, setBarcodeSubmitting] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const uploadNicPhoto = async (side: Side, file: File): Promise<void> => {
    if (file.size > MAX_NIC_IMAGE_BYTES) {
      setUploadError("Photo exceeds the 10 MB limit.");
      return;
    }
    const contentType = file.type === "image/png" ? "image/png" : "image/jpeg";

    setUploadingSide(side);
    setUploadError(null);
    try {
      const res = await api.post<ApiSuccess<NicUploadUrlResult>>("/users/me/nic/upload-url", {
        side,
        fileName: safeImageName(file.name),
        contentType,
        fileSizeBytes: file.size,
      });
      const put = await fetch(res.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed. Please check your connection and try again.");

      // Confirm the photo actually reached storage before marking it done — a
      // blocked/failed PUT must not leave a "uploaded" state that isn't real.
      const confirmed = await api.post<ApiSuccess<{ setupCompleted: boolean }>>(
        "/users/me/nic/confirm",
        { side, key: res.data.key },
      );

      const objectUrl = URL.createObjectURL(file);
      setPreviews((prev) => {
        if (prev[side]) URL.revokeObjectURL(prev[side]!);
        return { ...prev, [side]: objectUrl };
      });
      if (side === "FRONT") setNicFrontUploaded(true);
      else setNicBackUploaded(true);
      setSetupCompleted(confirmed.data.setupCompleted);
    } catch (e) {
      setUploadError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Upload failed. Try again.",
      );
    } finally {
      setUploadingSide(null);
    }
  };

  const addBarcode = async (): Promise<void> => {
    if (!instituteId) {
      setBarcodeError("Choose an institute.");
      return;
    }
    if (!barcodeValue.trim()) {
      setBarcodeError("Enter the barcode printed on your institute card.");
      return;
    }
    setBarcodeSubmitting(true);
    setBarcodeError(null);
    try {
      const res = await api.post<ApiSuccess<StudentBarcode>>("/users/me/institute-barcodes", {
        instituteId,
        barcode: barcodeValue.trim(),
      });
      setBarcodes((prev) => [...prev, res.data]);
      setBarcodeValue("");
      const next = availableInstitutes.find((i) => i.id !== instituteId);
      setInstituteId(next?.id ?? "");
    } catch (e) {
      setBarcodeError(e instanceof ApiError ? e.message : "Could not register this barcode.");
    } finally {
      setBarcodeSubmitting(false);
    }
  };

  const removeBarcode = async (id: string): Promise<void> => {
    try {
      await api.del(`/users/me/institute-barcodes/${id}`);
      setBarcodes((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setBarcodeError(e instanceof ApiError ? e.message : "Could not remove this barcode.");
    }
  };

  return (
    <div className="space-y-8">
      {setupCompleted && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Setup complete — you&apos;re all set.
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            NIC verification
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Required. Upload both sides of your National Identity Card.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NicPhotoField
            side="FRONT"
            uploaded={nicFrontUploaded}
            uploading={uploadingSide === "FRONT"}
            previewUrl={previews.FRONT}
            onSelect={(file) => void uploadNicPhoto("FRONT", file)}
          />
          <NicPhotoField
            side="BACK"
            uploaded={nicBackUploaded}
            uploading={uploadingSide === "BACK"}
            previewUrl={previews.BACK}
            onSelect={(file) => void uploadNicPhoto("BACK", file)}
          />
        </div>

        {uploadError && (
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {uploadError}
          </p>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Institute barcodes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional — only if you attend physical classes at one of our institutes. Enter the
            barcode printed on the card each institute already gave you.
          </p>
        </div>

        {barcodes.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {barcodes.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{b.institute.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{b.barcode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeBarcode(b.id)}
                  aria-label={`Remove barcode for ${b.institute.name}`}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        {availableInstitutes.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1 space-y-1.5">
              <label htmlFor="institute" className="text-sm font-medium text-foreground">
                Institute
              </label>
              <select
                id="institute"
                value={instituteId}
                onChange={(e) => setInstituteId(e.target.value)}
                className={field}
              >
                {availableInstitutes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-40 flex-1 space-y-1.5">
              <label htmlFor="barcode" className="text-sm font-medium text-foreground">
                Barcode
              </label>
              <input
                id="barcode"
                value={barcodeValue}
                onChange={(e) => setBarcodeValue(e.target.value)}
                placeholder="e.g. NUG-4821"
                className={field}
              />
            </div>
            <Button onClick={() => void addBarcode()} disabled={barcodeSubmitting} variant="outline">
              {barcodeSubmitting && <Loader2 className="animate-spin" aria-hidden />}
              Add
            </Button>
          </div>
        ) : institutes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No institutes are configured yet.</p>
        ) : null}

        {barcodeError && (
          <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {barcodeError}
          </p>
        )}
      </section>

      {setupCompleted && (
        <Button
          onClick={() => router.push("/dashboard")}
          size="lg"
          className="w-full sm:w-auto"
        >
          Continue to dashboard
          <ArrowRight aria-hidden />
        </Button>
      )}
    </div>
  );
}
