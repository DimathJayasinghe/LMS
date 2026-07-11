"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/roles";
import type { AuditLogEntry } from "@/lib/types";

interface Props {
  entries: AuditLogEntry[];
}

const dateFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function AuditLogTable({ entries }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        No audit events match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-8 px-2 py-3" />
            <th className="px-4 py-3 font-medium">When</th>
            <th className="px-4 py-3 font-medium">Actor</th>
            <th className="px-4 py-3 font-medium">Action</th>
            <th className="px-4 py-3 font-medium">Target</th>
            <th className="px-4 py-3 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => {
            const expanded = expandedId === entry.id;
            const hasDetails = Boolean(
              entry.ip || entry.userAgent || (entry.metadata && Object.keys(entry.metadata).length > 0),
            );
            return (
              <Fragment key={entry.id}>
                <tr className="bg-card align-top">
                  <td className="px-2 py-3">
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                        aria-label={expanded ? "Collapse details" : "Expand details"}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4" aria-hidden />
                        )}
                      </button>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {dateFmt.format(new Date(entry.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{entry.actor.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actor.email} · {roleLabel(entry.actorRole)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{actionLabel(entry.action)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.targetType ? (
                      <>
                        <span className="text-foreground">{entry.targetType}</span>
                        {entry.targetId && (
                          <span className="ml-1 font-mono text-xs">
                            {entry.targetId.slice(0, 8)}…
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">
                    {entry.description ?? "—"}
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/30">
                    <td />
                    <td colSpan={5} className="space-y-2 px-4 py-3 text-xs text-muted-foreground">
                      {entry.ip && (
                        <p>
                          <span className="font-medium text-foreground">IP:</span> {entry.ip}
                        </p>
                      )}
                      {entry.userAgent && (
                        <p className="break-all">
                          <span className="font-medium text-foreground">User agent:</span>{" "}
                          {entry.userAgent}
                        </p>
                      )}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <pre className="overflow-x-auto rounded-lg bg-background p-2 font-mono">
                          {JSON.stringify(entry.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
