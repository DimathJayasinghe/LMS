import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ExamStatus } from "@/lib/exam";

/**
 * Status tint for an exam window, following the app status palette (Doc 01 §2.3):
 * open = emerald, upcoming = amber, closed = neutral. The base Badge has no
 * status variants, so we tint an `outline` badge with token-friendly classes.
 */
const STYLES: Record<ExamStatus, { label: string; className: string }> = {
  upcoming: {
    label: "Upcoming",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  active: {
    label: "Open now",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  ended: {
    label: "Closed",
    className: "bg-muted text-muted-foreground",
  },
};

interface ExamStatusBadgeProps {
  status: ExamStatus;
  className?: string;
}

export function ExamStatusBadge({ status, className }: ExamStatusBadgeProps) {
  const style = STYLES[status];
  return (
    <Badge variant="outline" className={cn("border-transparent", style.className, className)}>
      {style.label}
    </Badge>
  );
}
