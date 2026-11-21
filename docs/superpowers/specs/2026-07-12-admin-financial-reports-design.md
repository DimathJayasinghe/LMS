# Admin Financial Reports — Design

_Date: 2026-07-12 · Branch: `feature/admin-financial-reports` (off `dev`)_

## 1. Goal

Give the institute owner a **financial reports** page — revenue trend, per-course and per-method
breakdowns, and outstanding fees — filling the last Phase-7 admin gap. **SUPER_ADMIN-only.** One new
tested backend aggregate endpoint + a new `/admin/reports` page with responsive, theme-aware charts.

## 2. Backend

### Endpoint — `GET /payments/reports?month=YYYY-MM`
- **Role:** SUPER_ADMIN. **Query:** `month` (optional, `YYYY-MM`, default current). Route registered
  **before** `/:id` (like `/summary`). Zod `reportsQuerySchema`.
- **Service** `getFinancialReport(month)` (payment.service) runs these in parallel and returns:

```ts
interface FinancialReport {
  month: string;                                        // the selected month
  trend: { month: string; collected: string; paidCount: number }[];   // 12 months ending at `month`
  byCourse: { courseId: string; name: string; year: number | null; collected: string; paidCount: number }[];
  byMethod: { method: PaymentMethod; collected: string; paidCount: number }[];
  outstanding: { count: number; expected: string };     // active enrollments unpaid this month
}
```

- **trend** — the 12 `YYYY-MM` labels ending at `month`; group SUCCESS payments by `paymentMonth`
  over that window (`groupBy({ by: ['paymentMonth'], where: { status: SUCCESS, paymentMonth: { in } },
  _sum: { amount }, _count })`), then map onto the label list, **zero-filling** empty months.
- **byCourse** — `$queryRaw`: `SELECT c.id, c.name, c.year, SUM(p.amount) total, COUNT(*) cnt
  FROM "Payment" p JOIN "Enrollment" e ON e.id=p."enrollmentId" JOIN "Course" c ON c.id=e."courseId"
  WHERE p.status='SUCCESS' AND p."paymentMonth"=$1 GROUP BY c.id, c.name, c.year ORDER BY total DESC`.
  (Prisma `groupBy` can't group by a relation field; raw is the clean path.)
- **byMethod** — `groupBy({ by: ['method'], where: { status: SUCCESS, paymentMonth }, _sum, _count })`.
- **outstanding** — `$queryRaw`: active enrollments with **no** SUCCESS payment that month +
  `SUM(course.monthlyFee)`:
  `SELECT COUNT(*) cnt, COALESCE(SUM(c."monthlyFee"),0) expected FROM "Enrollment" e
   JOIN "Course" c ON c.id=e."courseId" WHERE e."isActive"=true AND NOT EXISTS
   (SELECT 1 FROM "Payment" p WHERE p."enrollmentId"=e.id AND p."paymentMonth"=$1 AND p.status='SUCCESS')`.
- Decimals → `.toFixed(2)` strings; raw numeric results coerced safely.

### Controller/route
`getFinancialReport` controller → `{ status:'success', data }`. Route SUPER_ADMIN-gated.

### Vitest (`payment.reports.service.test.ts`)
Mock `@/config/database` (`payment.groupBy`, `payment.aggregate` if used, `$queryRaw`). Assert:
trend is 12 entries with correct labels + zero-fill for missing months; byCourse/byMethod mapped +
formatted; outstanding coerced. Per §3.4.

## 3. Frontend

```
app/(app)/admin/reports/
  page.tsx       server: SUPER_ADMIN gate + GET /payments/reports?month → render
  loading.tsx    skeleton (stat tiles + chart blocks)
  _components/
    FinancialReport.tsx   client: month picker + stat tiles + charts
lib/types.ts     add FinancialReport types
lib/nav.ts       add "Reports" (SUPER_ADMIN) under Administration
```

- **Server `page.tsx`** — `/auth/me` → non-SUPER_ADMIN `redirect("/dashboard")`; read `searchParams.month`
  (validate `YYYY-MM`, default current); `GET /payments/reports?month=` (forward cookies); pass to client.
- **`FinancialReport`** (client): month `<input type="month">` → `router.push('?month=')`; **stat tiles**
  (collected this month, outstanding count + Rs, paid count); **Revenue trend** (Recharts bar or area,
  12 months); **By course** (Recharts horizontal bar, top N + "others"); **By method** (Recharts donut,
  ONLINE/ENTRANCE/BULK/MANUAL). Empty/zero states when there's no data.
- **Charts** follow the **dataviz** skill (read before writing chart code): brand-neutral accessible
  categorical palette, `ResponsiveContainer` for fluid width, light+dark via CSS variables/theme,
  tooltips + axis labels, `Rs` formatting, `motion-reduce` friendly. Mobile-first: charts stack, scroll
  inside their own container if needed, no horizontal page scroll.
- **Dependency:** `recharts` (React-19 peer resolved by the repo `.npmrc` `legacy-peer-deps=true`;
  the Dockerfile already copies `.npmrc`).

## 4. Testing

- **Backend Vitest** — `getFinancialReport` aggregation (trend labels + zero-fill, byCourse/byMethod
  mapping, outstanding coercion) with mocked prisma incl. `$queryRaw`.
- **Frontend Vitest** — pure helpers only: the 12-month label builder + zero-fill merge, and `Rs`
  formatting. (Recharts SVG/ResponsiveContainer isn't meaningfully unit-testable in jsdom.)
- **System** — backend + frontend `tsc`/build/lint green; frontend Docker image builds (recharts).
- **Live smoke** (headless on the stack, real payment data): SUPER_ADMIN opens `/admin/reports` →
  stat tiles + all three charts render with data; month picker switches month; ADMIN is bounced.

## 5. Definition of done

- `GET /payments/reports` shipped + Vitest; `/admin/reports` renders trend + per-course + per-method +
  outstanding, responsive & theme-aware; SUPER_ADMIN gate (ADMIN bounced); nav item added.
- Full gate green (backend+frontend unit, builds/lint, live smoke).
- Docs: `payments.endpoints.md` (the reports endpoint), progress tracker (financial reports → done),
  frontend roadmap.
