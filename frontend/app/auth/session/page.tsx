"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api, refreshSession } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";

/**
 * Silent re-authentication landing page. The frontend proxy sends a navigation
 * here when the access token has expired; we run one coordinated refresh and
 * return the user to the page they asked for. Only a definitive 401/403 from the
 * refresh endpoint ends the session; a 429, a 5xx or a network error may be
 * transient, so those keep the cookies and offer a retry instead.
 */
function SessionRefresh() {
  const router = useRouter();
  const search = useSearchParams();
  const next = safeNext(search.get("next"));
  const [failed, setFailed] = useState(false);

  /** Resolves true when the attempt failed transiently and the user may retry. */
  const run = useCallback(async (): Promise<boolean> => {
    const result = await refreshSession();
    if (result.ok) {
      router.replace(next);
      return false;
    }
    if (result.status === 401 || result.status === 403) {
      // Clear the dead cookies so the proxy stops redirecting here.
      await api.post("/auth/logout").catch(() => undefined);
      router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
      return false;
    }
    return true;
  }, [router, next]);

  useEffect(() => {
    // A rejected refresh must end in the retry state, never an endless spinner.
    void run()
      .catch(() => true)
      .then((retryable) => {
        if (retryable) setFailed(true);
      });
  }, [run]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {failed ? (
        <>
          <p className="text-lg font-medium">We could not reach the server.</p>
          <p className="text-sm text-muted-foreground">
            Your session is still saved. Check your connection and try again.
          </p>
          <Button
            onClick={() => {
              setFailed(false);
              void run()
                .catch(() => true)
                .then((retryable) => {
                  if (retryable) setFailed(true);
                });
            }}
          >
            Try again
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          <p className="text-lg font-medium" role="status">
            Signing you back in…
          </p>
        </>
      )}
    </main>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionRefresh />
    </Suspense>
  );
}
