import { Clock } from "lucide-react";

/** Placeholder empty-state for authenticated routes that aren't built yet. */
export function ComingSoon({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground">
        <Clock className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">
        {label ?? "This section is coming soon"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        We&apos;re building this out. Check back shortly.
      </p>
    </div>
  );
}
