import { loadPanel } from "@/lib/console";
import { monthLabel } from "@/lib/reports";
import { formatCurrency } from "@/lib/utils";
import type { ConsoleOwing } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

export async function OwingPanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleOwing>("/console/owing", cookie);
  if (!result.ok) return <PanelShell title="Who owes" failed />;
  const { month, students, amount, courses, otherCourses } = result.data;

  return (
    <PanelShell title="Who owes" href={`/payments/owing?month=${month}`} linkLabel="See the full list">
      <p className="mb-3 text-xs text-muted-foreground">{monthLabel(month)}</p>
      <StatRow>
        <Stat label="Students owing" value={String(students)} tone={students > 0 ? "alert" : undefined} />
        <Stat label="Amount owed" value={formatCurrency(amount)} />
      </StatRow>

      {courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody owes a fee for {monthLabel(month)}.</p>
      ) : (
        <>
          <h3 className="text-sm font-medium text-foreground">Classes owed the most</h3>
          <ul className="divide-y divide-border">
            {courses.map((course) => (
              <li key={course.courseId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">{course.name}<span className="ml-2 text-xs text-muted-foreground">{course.count} {course.count === 1 ? "student" : "students"}</span></span>
                <span className="tabular-nums text-foreground">{formatCurrency(course.expected)}</span>
              </li>
            ))}
          </ul>
          {otherCourses > 0 && <p className="mt-2 text-xs text-muted-foreground">and {otherCourses} more {otherCourses === 1 ? "class" : "classes"}</p>}
        </>
      )}
    </PanelShell>
  );
}
