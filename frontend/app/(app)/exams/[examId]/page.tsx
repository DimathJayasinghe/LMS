import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
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
import { api, ApiError } from "@/lib/api";
import { examTypeLabel, formatExamWindow, getExamStatus } from "@/lib/exam";
import type { ApiList, ApiSuccess, Course, ExamDetail, MySubmission, User } from "@/lib/types";

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

  let user: User;
  try {
    user = (await api.get<ApiSuccess<User>>("/auth/me", { cookie })).data;
  } catch {
    redirect("/auth/login");
  }

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
    exam = (await api.get<ApiSuccess<ExamDetail>>(`/exams/${examId}`, { cookie })).data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
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
        return (await api.get<ApiSuccess<Course>>(`/classes/${exam.courseId}`, { cookie })).data.name;
      } catch {
        return undefined;
      }
    })(),
    (async (): Promise<MySubmission | undefined> => {
      if (user.role !== "STUDENT") return undefined;
      try {
        const mine = await api.get<ApiList<MySubmission>>(
          `/submissions/mine?examId=${examId}`,
          { cookie },
        );
        return mine.data[0];
      } catch {
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
    content = (
      <ExamNotice
        icon={FileText}
        title="In-class exam"
        message="This exam is sat on paper in class. Your marks will appear here once staff enter them."
      />
    );
  } else if (mySub) {
    content = <ExamResult submission={mySub} />;
  } else if (status === "upcoming") {
    content = (
      <ExamNotice
        icon={Hourglass}
        title="Not started yet"
        message={`This exam opens ${opensAtFmt.format(new Date(exam.startTime))}.`}
      >
        <CountdownTimer target={exam.startTime} className="text-lg" />
      </ExamNotice>
    );
  } else if (status === "active") {
    content = <ExamSit exam={exam} />;
  } else {
    content = (
      <ExamNotice
        icon={Lock}
        title="Exam closed"
        message="The submission window has passed and no submission was received. Contact your teacher if this is unexpected."
      />
    );
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
