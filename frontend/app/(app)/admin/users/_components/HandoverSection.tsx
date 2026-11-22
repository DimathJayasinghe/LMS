import { dayName, type HandoverBlock, type HandoverCourse } from "@/lib/handover";
import { plural } from "@/lib/console-format";
import type { AcademicStaff } from "@/lib/types";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function courseDetail(course: HandoverCourse): string {
  const parts = [course.subjectName];
  if (course.upcomingSessions > 0) parts.push(`${plural(course.upcomingSessions, "session")} coming up`);
  if (course.openExams > 0) parts.push(`${plural(course.openExams, "exam")} waiting for results`);
  if (!course.isActive) parts.push("ended");
  return parts.join(" · ");
}

interface Props {
  block: HandoverBlock;
  /** The classes the first refusal listed; kept when a later refusal is only about timetable clashes. */
  courses: HandoverCourse[];
  teachers: AcademicStaff[] | null;
  receiverId: string;
  onReceiver: (id: string) => void;
  leaverId: string;
}

/** What must be handed over before the change can go through, and who takes it. */
export function HandoverSection({ block, courses, teachers, receiverId, onReceiver, leaverId }: Props) {
  if (block.kind === "marking") {
    return (
      <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-foreground">This marker still has marking to do.</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          {block.allocations.map((item) => <li key={item.examId}>{item.examTitle} ({item.courseName})</li>)}
        </ul>
        <p className="text-muted-foreground">Release or reassign this marking first, then try again.</p>
      </div>
    );
  }

  const receivers = (teachers ?? []).filter((teacher) => teacher.id !== leaverId);
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <p className="font-medium text-foreground">Classes to hand over</p>
      <ul className="divide-y divide-border">
        {courses.map((course) => (
          <li key={course.id} className="py-1.5">
            <span className="text-foreground">{course.name} {course.year}</span>
            <span className="block text-xs text-muted-foreground">{courseDetail(course)}</span>
          </li>
        ))}
      </ul>
      {block.kind === "clash" && (
        <div role="alert" className="space-y-1 text-destructive">
          <p className="font-medium">That teacher already teaches at these times. Choose another teacher.</p>
          <ul className="list-disc pl-5 text-xs">
            {block.conflicts.map((clash, index) => (
              <li key={index}>{clash.courseName}, {dayName(clash.dayOfWeek)} {clash.startTime}, overlaps {clash.clashesWith.courseName} at {clash.clashesWith.startTime}</li>
            ))}
          </ul>
        </div>
      )}
      <label className="block">New teacher for all of these classes
        <select value={receiverId} onChange={(event) => onReceiver(event.target.value)} required className={field}>
          <option value="" disabled>Select a teacher</option>
          {receivers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Their sessions, exams and marking move with the classes, and the old teacher loses access straight away.</p>
    </div>
  );
}
