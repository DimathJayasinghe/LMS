import { loadPanel } from "@/lib/console";
import { consoleDay, plural } from "@/lib/console-format";
import type { ConsoleMarking, ConsoleMarkingExam } from "@/lib/types";
import { PanelShell, Stat, StatRow } from "./PanelShell";

function ExamLine({ exam }: { exam: ConsoleMarkingExam }) {
  const notes = [
    `ended ${consoleDay(exam.endedAt)}`,
    `${exam.submitted} submitted`,
    exam.incomplete > 0 ? `${plural(exam.incomplete, "upload")} unfinished` : null,
    exam.hall > 0 ? `${exam.hall} entered from the hall` : null,
  ].filter(Boolean);
  return (
    <li className="py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-foreground">{exam.title}<span className="text-muted-foreground"> · {exam.courseName}</span></span>
        <span className="tabular-nums text-foreground">
          <span className={exam.ungraded > 0 ? "text-destructive" : undefined}>{exam.ungraded} to mark</span>
          <span className="ml-2 text-xs text-muted-foreground">{exam.graded} marked</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{notes.join(" · ")}</p>
    </li>
  );
}

export async function MarkingPanel({ cookie }: { cookie: string }) {
  const result = await loadPanel<ConsoleMarking>("/console/marking", cookie);
  if (!result.ok) return <PanelShell title="Marking" failed />;
  const { lookbackDays, total, exams } = result.data;
  const toMark = exams.reduce((sum, exam) => sum + exam.ungraded, 0);
  const partial = total > exams.length;

  return (
    <PanelShell title="Marking" href="/exams" linkLabel="Open exams">
      <p className="mb-3 text-xs text-muted-foreground">Exams that ended in the last {plural(lookbackDays, "day")} and are not published</p>
      <StatRow>
        <Stat label="Exams waiting" value={String(total)} />
        <Stat label="Papers to mark" value={`${toMark}${partial ? "+" : ""}`} tone={toMark > 0 ? "alert" : undefined} />
      </StatRow>
      {exams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exam is waiting for marks or publishing.</p>
      ) : (
        <ul className="divide-y divide-border">{exams.map((exam) => <ExamLine key={exam.examId} exam={exam} />)}</ul>
      )}
      {partial && <p className="mt-2 text-xs text-muted-foreground">Showing the newest {exams.length} of {total}.</p>}
    </PanelShell>
  );
}
