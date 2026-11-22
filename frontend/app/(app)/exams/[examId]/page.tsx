import { guard401, requireUser } from "@/lib/session";
import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Clock,
  FileText,
  Hourglass,
  Info,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExamStatusBadge } from "@/components/features/ExamStatusBadge";
import { ExamSit } from "./_components/ExamSit";
import { ExamResult } from "./_components/ExamResult";
import { ExamNotice } from "./_components/ExamNotice";
import { CountdownTimer } from "./_components/CountdownTimer";
import { api } from "@/lib/api-server";
import { ApiError } from "@/lib/api";
import { examTypeLabel, formatExamWindow, getExamStatus, hallMessage, studentExamView } from "@/lib/exam";
import type { ApiList, ApiSuccess, Course, ExamDetail, MySubmission } from "@/lib/types";

const opensAtFmt = new Intl.DateTimeFormat("en-LK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Colombo",
});

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const cookie = (await cookies()).toString();
  const { examId } = await params;

  const user = await requireUser(cookie);

  const backLink = (
    <Link
      href="/exams"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All exams
    </Link>
  );

  // Fetch the exam. Non-enrolled students get 403 NOT_ENROLLED → enrollment gate.
  let exam: ExamDetail;
  try {
    exam = (await guard401(api.get<ApiSuccess<ExamDetail>>(`/exams/${examId}`, { cookie }))).data;
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) {
      if (user.role !== "STUDENT") notFound();
      // Not found and not on the exam's list look the same on purpose; either way the student's next step is the teacher.
      return (
        <div className="mx-auto max-w-3xl">
          {backLink}
          <ExamNotice
            icon={Lock}
            title="Exam not available"
            message="You are not on the list for this exam. Ask your teacher."
          />
        </div>
      );
    }
    if (e instanceof ApiError && (e.code === "NOT_ENROLLED" || e.status === 403)) {
      return (
        <div className="mx-auto max-w-3xl">
          {backLink}
          <ExamNotice
            icon={Lock}
            title="Enrollment required"
            message="Enroll in this course to view and sit its exams."
          >
            <Link href="/classes" className="text-sm font-medium text-primary hover:underline">
              Browse classes
            </Link>
          </ExamNotice>
        </div>
      );
    }
    throw e;
  }

  // Best-effort course name + the student's own submission (both non-fatal).
  const [courseName, mySub] = await Promise.all([
    (async (): Promise<string | undefined> => {
      try {
        return (await guard401(api.get<ApiSuccess<Course>>(`/classes/${exam.courseId}`, { cookie }))).data.name;
      } catch (error) {
        unstable_rethrow(error);
        return undefined;
      }
    })(),
    (async (): Promise<MySubmission | undefined> => {
      if (user.role !== "STUDENT") return undefined;
      try {
        const mine = await guard401(api.get<ApiList<MySubmission>>(
          `/submissions/mine?examId=${examId}`,
          { cookie },
        ));
        return mine.data[0];
      } catch (error) {
        unstable_rethrow(error);
        return undefined;
      }
    })(),
  ]);

  const status = getExamStatus(exam);

  let content: ReactNode;
  if (user.role !== "STUDENT") {
    content = (
      <ExamNotice
        icon={Info}
        title="Staff view"
        message="Sitting an exam is for students. Manage submissions and marking from the marking tools."
      />
    );
  } else if (exam.type === "INCLASS" && !mySub) {
    content = exam.isPublished ? (
      <ExamNotice
        icon={FileText}
        title="Absent"
        message="Results are published and no mark was entered for you, so you are recorded as absent. Contact your teacher if this is a mistake."
      />
    ) : (
      <ExamNotice
        icon={FileText}
        title="In-class exam"
        message="This exam is sat on paper in class. Your marks will appear here once staff enter them."
      />
    );
  } else {
    const view = studentExamView(exam, status, mySub);
    if (view === "result" || view === "not-received") {
      content = <ExamResult submission={mySub!} />;
    } else if (view === "hall") {
      content = <ExamNotice icon={Building2} title="Sat in the hall" message={hallMessage(exam.myAudience!)} />;
    } else if (view === "upcoming") {
      content = (
        <ExamNotice
          icon={Hourglass}
          title="Not started yet"
          message={`This exam opens ${opensAtFmt.format(new Date(exam.startTime))}.`}
        >
          <CountdownTimer target={exam.startTime} label="Time until the exam opens" className="text-lg" />
        </ExamNotice>
      );
    } else if (view === "sit") {
      content = <ExamSit exam={exam} resume={mySub} userId={user.id} />;
    } else {
      content = (
        <ExamNotice
          icon={Lock}
          title="Exam closed"
          message="The submission window has passed and no submission was received. Contact your teacher if this is unexpected."
        />
      );
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {backLink}

      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <FileText className="size-3" aria-hidden />
            {examTypeLabel(exam.type)}
          </Badge>
          <ExamStatusBadge status={status} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{exam.title}</h1>
        {courseName && <p className="mt-1 text-sm text-muted-foreground">{courseName}</p>}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          {formatExamWindow(exam.startTime, exam.endTime)}
          <span aria-hidden>·</span>
          {exam.totalMarks} marks
        </p>
      </header>

      {content}
    </div>
  );
}
