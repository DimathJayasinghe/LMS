import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RosterList } from "@/lib/types";

const enrolledOn = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Colombo" });

const pageHref = (classId: string, page: number): string =>
  page > 1 ? `/classes/${classId}?rosterPage=${page}` : `/classes/${classId}`;

/** The students of one class for its teacher and the front desk: who, how they joined, this month's fee, recent attendance. */
export function ClassRoster({ classId, roster }: { classId: string; roster: RosterList }) {
  const { data, count, page, pageSize } = roster;
  const showFee = data.some((row) => row.feeState !== undefined);
  const sessions = data[0]?.attendedLastN.sessions ?? 0;
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <section aria-labelledby="class-roster-heading">
      <h2 id="class-roster-heading" className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <Users className="size-4" aria-hidden />
        Students ({count})
      </h2>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          {count === 0 ? (
            "No students are enrolled in this class yet."
          ) : (
            <>This page has no students. <Link href={pageHref(classId, 1)} className="underline">Back to the first page</Link>.</>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Joined as</th>
                <th className="px-4 py-3 font-medium">Enrolled</th>
                {showFee && <th className="px-4 py-3 font-medium">This month</th>}
                <th className="px-4 py-3 font-medium">{sessions > 0 ? `Last ${sessions} sessions` : "Attendance"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row) => (
                <tr key={row.studentId} className="bg-card align-middle">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">#{row.indexNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.classType === "ONLINE" ? "Online" : "In hall"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{enrolledOn(row.enrolledAt)}</td>
                  {showFee && (
                    <td className="px-4 py-3">
                      {row.feeState === "PAID" ? (
                        <Badge variant="outline">Paid</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">Not paid</Badge>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 tabular-nums text-foreground">
                    {row.attendedLastN.sessions === 0 ? (
                      <span className="text-muted-foreground">No sessions yet</span>
                    ) : (
                      `${row.attendedLastN.attended} of ${row.attendedLastN.sessions}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Roster pages" className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline"><Link href={pageHref(classId, page - 1)}>Previous</Link></Button>
          ) : <span />}
          <span>Page {page} of {pages}</span>
          {page < pages ? (
            <Button asChild size="sm" variant="outline"><Link href={pageHref(classId, page + 1)}>Next</Link></Button>
          ) : <span />}
        </nav>
      )}
    </section>
  );
}
