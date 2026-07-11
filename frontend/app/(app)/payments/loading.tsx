export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none" />
    </div>
  );
}
