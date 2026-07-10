export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 h-4 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="aspect-video w-full animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="mt-5 space-y-2">
        <div className="h-6 w-72 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-52 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
