"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BuilderOption {
  text: string;
  correct: boolean;
}
export interface BuilderQuestion {
  text: string;
  marks: string;
  options: BuilderOption[];
}

export const emptyQuestion = (): BuilderQuestion => ({
  text: "",
  marks: "1",
  options: [
    { text: "", correct: false },
    { text: "", correct: false },
  ],
});

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

interface Props {
  questions: BuilderQuestion[];
  onChange: (q: BuilderQuestion[]) => void;
  disabled?: boolean;
}

export function McqBuilder({ questions, onChange, disabled }: Props) {
  const patch = (i: number, next: Partial<BuilderQuestion>): void =>
    onChange(questions.map((q, idx) => (idx === i ? { ...q, ...next } : q)));

  const patchOption = (qi: number, oi: number, next: Partial<BuilderOption>): void =>
    patch(qi, {
      options: questions[qi].options.map((o, idx) => (idx === oi ? { ...o, ...next } : o)),
    });

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Question {qi + 1}</span>
            {questions.length > 1 && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground"
                disabled={disabled}
                onClick={() => onChange(questions.filter((_, idx) => idx !== qi))}
                aria-label={`Remove question ${qi + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          <textarea
            value={q.text}
            onChange={(e) => patch(qi, { text: e.target.value })}
            placeholder="Question text"
            rows={2}
            disabled={disabled}
            className={`${field} resize-y`}
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Marks
            <input
              type="number"
              min={1}
              value={q.marks}
              onChange={(e) => patch(qi, { marks: e.target.value })}
              disabled={disabled}
              className={`${field} w-20`}
            />
          </label>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tick the correct answer(s). At least two options.
            </p>
            {q.options.map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={o.correct}
                  onChange={(e) => patchOption(qi, oi, { correct: e.target.checked })}
                  disabled={disabled}
                  aria-label={`Mark option ${oi + 1} correct`}
                  className="size-4 accent-foreground"
                />
                <input
                  value={o.text}
                  onChange={(e) => patchOption(qi, oi, { text: e.target.value })}
                  placeholder={`Option ${oi + 1}`}
                  disabled={disabled}
                  className={field}
                />
                {q.options.length > 2 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    disabled={disabled}
                    onClick={() => patch(qi, { options: q.options.filter((_, idx) => idx !== oi) })}
                    aria-label={`Remove option ${oi + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => patch(qi, { options: [...q.options, { text: "", correct: false }] })}
            >
              <Plus aria-hidden />
              Add option
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange([...questions, emptyQuestion()])}
      >
        <Plus aria-hidden />
        Add question
      </Button>
    </div>
  );
}
