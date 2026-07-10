"use client";

import type { McqAnswers, McqQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

interface McqQuestionListProps {
  questions: McqQuestion[];
  value: McqAnswers;
  /** Toggle a single option. Multiple options may be selected per question. */
  onToggle: (questionId: string, optionId: string) => void;
  disabled?: boolean;
}

export function McqQuestionList({ questions, value, onToggle, disabled }: McqQuestionListProps) {
  const ordered = [...questions].sort((a, b) => a.order - b.order);

  return (
    <ol className="space-y-4">
      {ordered.map((q, index) => (
        <li key={q.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="font-medium text-foreground">
              <span className="text-muted-foreground">{index + 1}.</span> {q.text}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {q.marks} {q.marks === 1 ? "mark" : "marks"}
            </span>
          </div>
          <div className="space-y-2">
            {q.options.map((o) => {
              const checked = (value[q.id] ?? []).includes(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked ? "border-foreground bg-muted" : "border-border hover:bg-muted/50",
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-foreground"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(q.id, o.id)}
                  />
                  <span className="text-foreground">{o.text}</span>
                </label>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}
