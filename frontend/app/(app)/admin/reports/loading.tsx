export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>

      <div className="space-y-4">
        <div className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
          <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
