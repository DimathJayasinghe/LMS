"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, CameraOff, Loader2, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCamera } from "@/components/custom/QrCamera";
import { api, ApiError } from "@/lib/api";
import { currentPaymentMonth } from "@/lib/payhere";
import { formatCurrency } from "@/lib/utils";
import type { ApiList, ApiSuccess, Enrollment, Payment, ResolvedBarcodeStudent, User } from "@/lib/types";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

type SelectedStudent = { id: string; name: string; indexNumber: number };

function monthsFrom(startMonth: string, endMonth: string): string[] {
  const [sy, sm] = startMonth.split("-").map(Number) as [number, number];
  const [ey, em] = endMonth.split("-").map(Number) as [number, number];
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function CollectPayment() {
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResponse, setSearchResponse] = useState<{ term: string; results: User[] }>({
    term: "",
    results: [],
  });
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [student, setStudent] = useState<SelectedStudent | null>(null);
  const [instituteId, setInstituteId] = useState<string | null>(null);
  const [matchedBarcode, setMatchedBarcode] = useState<string | null>(null);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollmentId, setEnrollmentId] = useState("");

  const [history, setHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [amount, setAmount] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastReceiptId, setLastReceiptId] = useState<string | null>(null);
  const [session, setSession] = useState<Payment[]>([]);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) return;

    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get<ApiList<User>>(`/users?search=${encodeURIComponent(term)}&role=STUDENT&limit=8`)
        .then((r) => {
          if (!cancelled) setSearchResponse({ term, results: r.data });
        })
        .catch(() => {
          if (!cancelled) setSearchResponse({ term, results: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchTerm]);

  const searchResults = searchResponse.term === searchTerm.trim() ? searchResponse.results : [];

  const selectStudent = (
    s: SelectedStudent,
    resolvedInstituteId: string | null,
    resolvedBarcode: string | null,
  ): void => {
    setStudent(s);
    setInstituteId(resolvedInstituteId);
    setMatchedBarcode(resolvedBarcode);
    setSearchTerm("");
    setSearchResponse({ term: "", results: [] });
    setScanError(null);
    setEnrollmentId("");
    setEnrollments([]);
    setHistory([]);
    setSubmitError(null);
    setLastReceiptId(null);

    api
      .get<ApiList<Enrollment>>(`/enrollments?userId=${s.id}&isActive=true&limit=50`)
      .then((r) => setEnrollments(r.data))
      .catch(() => setEnrollments([]));
  };

  const onDecode = (text: string): void => {
    setScanError(null);
    api
      .get<ApiSuccess<ResolvedBarcodeStudent>>(`/users/resolve-barcode?code=${encodeURIComponent(text)}`)
      .then((r) => selectStudent(r.data.user, r.data.instituteId, r.data.matchedBarcode))
      .catch((e) => setScanError(e instanceof ApiError ? e.message : "Couldn't resolve that code."));
  };

  const selectedEnrollment = useMemo(
    () => enrollments.find((e) => e.id === enrollmentId) ?? null,
    [enrollments, enrollmentId],
  );

  const outstandingMonths = useMemo(() => {
    if (!selectedEnrollment) return [];
    const paid = new Set(history.filter((p) => p.status === "SUCCESS").map((p) => p.paymentMonth));
    const start = selectedEnrollment.createdAt.slice(0, 7);
    const end = currentPaymentMonth();
    return monthsFrom(start, end).filter((m) => !paid.has(m));
  }, [selectedEnrollment, history]);

  const defaultMonth = outstandingMonths.includes(currentPaymentMonth())
    ? currentPaymentMonth()
    : (outstandingMonths[0] ?? "");
  const month = outstandingMonths.includes(selectedMonth) ? selectedMonth : defaultMonth;

  const selectEnrollment = (id: string): void => {
    setEnrollmentId(id);
    setSelectedMonth("");
    setAmount(enrollments.find((enrollment) => enrollment.id === id)?.course.monthlyFee ?? "");
    setSubmitError(null);
    setHistoryLoading(true);
    api
      .get<ApiList<Payment>>(`/payments?enrollmentId=${id}&limit=12`)
      .then((r) => setHistory(r.data))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  const selectMonth = (nextMonth: string): void => {
    setSelectedMonth(nextMonth);
    setAmount(selectedEnrollment?.course.monthlyFee ?? "");
  };

  const submit = async (): Promise<void> => {
    if (!selectedEnrollment || !month) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post<ApiSuccess<Payment>>(
        "/payments/collect-entrance",
        {
          enrollmentId: selectedEnrollment.id,
          paymentMonth: month,
          amount: Number(amount),
          ...(instituteId ? { collectedAtInstituteId: instituteId } : {}),
          ...(matchedBarcode ? { collectedViaBarcode: matchedBarcode } : {}),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setLastReceiptId(res.data.id);
      setSession((prev) => [res.data, ...prev]);
      selectEnrollment(selectedEnrollment.id);
      router.refresh();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : "Couldn't collect this payment. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const sessionTotal = session.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 print:border-none">
      <div className="print:hidden">
        <h2 className="text-sm font-semibold text-foreground">Collect payment</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Find a student by name/index or scan their barcode.
        </p>
      </div>

      <div className="print:hidden">
        {!student ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search student name or index…"
                  aria-label="Search student"
                  className={`${inputClass} w-full pl-9`}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  setCameraError(null);
                  setCameraOn((on) => !on);
                }}
                aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
              >
                {cameraOn ? (
                  <CameraOff className="size-4" aria-hidden />
                ) : (
                  <Camera className="size-4" aria-hidden />
                )}
              </Button>
            </div>

            {scanError && <p className="text-xs text-destructive">{scanError}</p>}

            {cameraOn && (
              <div>
                {cameraError ? (
                  <p className="text-sm text-destructive">{cameraError}</p>
                ) : (
                  <QrCamera
                    onDecode={onDecode}
                    onError={(m) => {
                      setCameraError(m);
                      setCameraOn(false);
                    }}
                  />
                )}
              </div>
            )}

            {searchTerm.trim().length >= 2 && searchResults.length > 0 && (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {searchResults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 bg-background p-2 text-sm">
                    <span>
                      {u.name} <span className="text-xs text-muted-foreground">#{u.indexNumber}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => selectStudent({ id: u.id, name: u.name, indexNumber: u.indexNumber }, null, null)}
                    >
                      Select
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">{student.name}</p>
                <p className="text-xs text-muted-foreground">#{student.indexNumber}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStudent(null)}>
                Change
              </Button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Enrollment</span>
              <select
                value={enrollmentId}
                onChange={(e) => selectEnrollment(e.target.value)}
                aria-label="Select enrollment"
                className={`${inputClass} w-full`}
              >
                <option value="">
                  {enrollments.length === 0 ? "No active enrollments" : "Select a course…"}
                </option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.course.name} · {e.classType}
                  </option>
                ))}
              </select>
            </label>

            {enrollmentId && (
              <div className="space-y-3">
                {historyLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                ) : outstandingMonths.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing outstanding for this enrollment.</p>
                ) : (
                  <>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Month</span>
                      <select
                        value={month}
                        onChange={(e) => selectMonth(e.target.value)}
                        aria-label="Select month to collect"
                        className={`${inputClass} w-full`}
                      >
                        {outstandingMonths.map((m) => (
                          <option key={m} value={m}>
                            {m}
                            {m === currentPaymentMonth() ? " (this month)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Amount</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-label="Amount"
                        className={`${inputClass} w-full`}
                      />
                    </label>

                    <Button onClick={submit} disabled={submitting || !amount}>
                      {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                      Collect {amount ? formatCurrency(amount) : ""}
                    </Button>

                    {submitError && <p className="text-xs text-destructive">{submitError}</p>}
                  </>
                )}

                {lastReceiptId && (
                  <Link
                    href={`/payments/${lastReceiptId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    <Receipt className="size-3.5" aria-hidden />
                    Payment collected — view receipt
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {session.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Collected this session
            </h3>
            <Badge variant="outline" className="tabular-nums">
              {formatCurrency(String(sessionTotal))}
            </Badge>
          </div>
          <ul className="space-y-1 text-sm">
            {session.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span className="text-foreground">
                  {p.enrollment.user.name} · {p.paymentMonth}
                </span>
                <Link
                  href={`/payments/${p.id}`}
                  target="_blank"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {formatCurrency(p.amount)}
                </Link>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
            Print session summary
          </Button>
        </div>
      )}
    </section>
  );
}
