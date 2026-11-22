import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

interface PanelShellProps {
  title: string;
  /** Where the full list for this panel lives. */
  href?: string;
  linkLabel?: string;
  children?: ReactNode;
  /** The panel could not be read; the rest of the console is unaffected. */
  failed?: boolean;
}

export function PanelShell({ title, href, linkLabel, children, failed }: PanelShellProps) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-base font-semibold text-foreground">{title}</h2>
        {href && !failed && (
          <Link href={href} className="text-sm text-muted-foreground underline-offset-2 hover:underline">{linkLabel ?? "See all"}</Link>
        )}
      </div>
      {failed ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          This panel could not be loaded. Reload the page to try again.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

export function PanelSkeleton({ title }: { title: string }) {
  return (
    <section aria-busy="true" aria-label={`${title}, loading`} className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mb-3 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
    </section>
  );
}

/** Figures wrap onto a second row when the card is narrow, so an amount never breaks across lines. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-3">{children}</div>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 whitespace-nowrap text-lg font-semibold tabular-nums ${tone === "alert" ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
