import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface ExamNoticeProps {
  icon: LucideIcon;
  title: string;
  message: string;
  /** Optional extra content (a countdown, a link, etc.). */
  children?: ReactNode;
}

/** A calm, centered info panel for the exam states that aren't "sit now". */
export function ExamNotice({ icon: Icon, title, message, children }: ExamNoticeProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {children}
    </div>
  );
}
