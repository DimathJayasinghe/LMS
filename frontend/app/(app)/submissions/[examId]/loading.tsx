export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mb-5 h-14 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
