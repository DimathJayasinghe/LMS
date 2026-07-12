export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 h-4 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-8 w-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border bg-muted/40 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
