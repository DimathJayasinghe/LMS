import Link from "next/link";
import { loadPanel } from "@/lib/console";
import { plural } from "@/lib/console-format";
import type { ConsoleSetup, ConsoleSetupList } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

function ClassList({ title, list, detail }: { title: string; list: ConsoleSetupList; detail: (teacherName: string, year: number) => string }) {
  if (list.count === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <ul className="divide-y divide-border">
        {list.rows.map((row) => (
          <li key={row.courseId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
            <span className="text-foreground">{row.name}</span>
            <span className="text-xs text-muted-foreground">{detail(row.teacherName, row.year)}</span>
          </li>
        ))}
      </ul>
      {list.count > list.rows.length && <p className="mt-1 text-xs text-muted-foreground">and {list.count - list.rows.length} more</p>}
    </div>
  );
}

export async function SetupPanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleSetup>("/console/setup", cookie);
  if (!result.ok) return <PanelShell title="Setup problems" failed />;
  const { orphanedClasses, oldBatches, studentsWithoutPhone } = result.data;
  const clear = orphanedClasses.count + oldBatches.count + studentsWithoutPhone === 0;

  return (
    <PanelShell title="Setup problems">
      <StatRow>
        <Stat label="Classes without a teacher" value={String(orphanedClasses.count)} tone={orphanedClasses.count > 0 ? "alert" : undefined} />
        <Stat label="Batches to end" value={String(oldBatches.count)} />
        <Stat label="Students without a phone" value={String(studentsWithoutPhone)} />
      </StatRow>
      {clear && <p className="text-sm text-muted-foreground">Nothing needs fixing.</p>}
      <ClassList title="Teacher left, class still active" list={orphanedClasses} detail={(teacher) => `Teacher: ${teacher}`} />
      {orphanedClasses.count > 0 && (
        <p className="mt-2 text-sm">
          <Link href="/admin/users" className="font-medium underline underline-offset-2">Hand these classes to a working teacher</Link>
        </p>
      )}
      <ClassList title="From an earlier year, still active" list={oldBatches} detail={(_teacher, year) => String(year)} />
      {studentsWithoutPhone > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{plural(studentsWithoutPhone, "active student")} cannot be sent an SMS because there is no phone number on file.</p>
      )}
    </PanelShell>
  );
}
