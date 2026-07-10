export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
