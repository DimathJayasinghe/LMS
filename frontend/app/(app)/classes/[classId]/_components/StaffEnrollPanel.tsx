"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { StaffEnrollDialog, type EnrollCourse, type EnrollStudent } from "@/components/custom/StaffEnrollDialog";
import { useStudentLookup } from "@/lib/student-lookup";
import { formatCurrency } from "@/lib/utils";

/** Front desk and owner: find an existing student and enrol them in this class. */
export function StaffEnrollPanel({ course }: { course: EnrollCourse }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [student, setStudent] = useState<EnrollStudent | null>(null);
  const [enrolledName, setEnrolledName] = useState<string | null>(null);
  const results = useStudentLookup(term);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-lg font-semibold text-foreground">
        {formatCurrency(course.monthlyFee)}
        <span className="text-sm font-normal text-muted-foreground"> / month</span>
      </p>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Enrol a student</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search student name or index…"
            aria-label="Search student"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {term.trim().length >= 2 && results.length > 0 && (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setStudent({ id: r.id, name: r.name, indexNumber: r.indexNumber })}
                  className="flex w-full items-center justify-between gap-2 bg-background p-2 text-left text-sm hover:bg-muted"
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">#{r.indexNumber}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {enrolledName && <p className="mt-3 text-sm text-foreground">{enrolledName} is enrolled.</p>}

      {student && (
        <StaffEnrollDialog
          open
          onOpenChange={(open) => {
            if (!open) setStudent(null);
          }}
          student={student}
          course={course}
          onEnrolled={() => {
            setEnrolledName(student.name);
            setTerm("");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
