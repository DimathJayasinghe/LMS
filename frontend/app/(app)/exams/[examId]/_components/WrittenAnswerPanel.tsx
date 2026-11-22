"use client";

import { FileText, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WrittenChannel, WrittenPart } from "@/lib/exam-draft";

export type { WrittenChannel, WrittenPart };

interface WrittenAnswerPanelProps {
  allowTyped: boolean;
  allowPdf: boolean;
  /** Presigned link to the question paper, if this exam has one. */
  paperPdfUrl: string | null;
  channel: WrittenChannel;
  onChannelChange: (channel: WrittenChannel) => void;
  parts: WrittenPart[];
  onPartChange: (key: string, text: string) => void;
  onAddPart: () => void;
  onRemovePart: (key: string) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

export function WrittenAnswerPanel(props: WrittenAnswerPanelProps) {
  const { allowTyped, allowPdf, paperPdfUrl, channel, onChannelChange, disabled } = props;
  const bothChannels = allowTyped && allowPdf;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Written answers
        </h3>
        {paperPdfUrl && (
          <a
            href={paperPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <FileText className="size-4" aria-hidden />
            Question paper
          </a>
        )}
      </div>

      {bothChannels && (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Answer method">
          {(["typed", "pdf"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={channel === c}
              disabled={disabled}
              onClick={() => onChannelChange(c)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                channel === c
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c === "typed" ? "Type answers" : "Upload PDF"}
            </button>
          ))}
        </div>
      )}

      {channel === "typed" && allowTyped ? (
        <TypedParts {...props} />
      ) : (
        <PdfUpload file={props.file} onFileChange={props.onFileChange} disabled={disabled} />
      )}
    </section>
  );
}

function TypedParts({
  parts,
  onPartChange,
  onAddPart,
  onRemovePart,
  disabled,
}: WrittenAnswerPanelProps) {
  return (
    <div className="space-y-3">
      {parts.map((part, index) => (
        <div key={part.key}>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor={`answer-${part.key}`} className="text-sm font-medium text-foreground">
              Answer {index + 1}
            </label>
            {parts.length > 1 && (
              <button
                type="button"
                onClick={() => onRemovePart(part.key)}
                disabled={disabled}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                aria-label={`Remove answer ${index + 1}`}
              >
                <X className="size-3.5" aria-hidden />
                Remove
              </button>
            )}
          </div>
          <textarea
            id={`answer-${part.key}`}
            value={part.text}
            disabled={disabled}
            onChange={(e) => onPartChange(part.key, e.target.value)}
            rows={4}
            placeholder="Type your answer…"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={onAddPart} disabled={disabled}>
        <Plus aria-hidden />
        Add answer
      </Button>
    </div>
  );
}

function PdfUpload({
  file,
  onFileChange,
  disabled,
}: Pick<WrittenAnswerPanelProps, "file" | "onFileChange" | "disabled">) {
  return (
    <div className="space-y-2">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Upload className="size-5" aria-hidden />
        {file ? (
          <span className="font-medium text-foreground">{file.name}</span>
        ) : (
          <span>Choose a PDF answer file (max 50 MB)</span>
        )}
        <input
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <p className="text-xs text-muted-foreground">
          {(file.size / (1024 * 1024)).toFixed(1)} MB selected
        </p>
      )}
    </div>
  );
}
