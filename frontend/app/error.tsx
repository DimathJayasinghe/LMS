"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold">Unable to load this page</h1>
      <p className="my-4 text-muted-foreground">Please try again in a moment.</p>
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={retry}>Try again</button>
    </main>
  );
}
