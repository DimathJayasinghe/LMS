export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mb-4 flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}
