"use client";

/**
 * Recharts views for the financial report. Built to the `dataviz` skill:
 *  - Every mark is `--foreground` (theme-aware, always high-contrast) — the
 *    design system's `--chart-*` grays don't invert, so they'd fail contrast
 *    at the ramp ends in one mode.
 *  - Trend + per-course are single-series magnitude → one hue, no legend.
 *  - Per-method is lightness-encoded via `fillOpacity` keyed to method
 *    identity (see METHOD_OPACITY), with a legend + values so identity is
 *    never carried by shade alone.
 *  - Recessive grid/axes; thin marks; 4px rounded data-ends; hover tooltips.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FinancialReport } from "@/lib/types";
import {
  METHOD_LABELS,
  METHOD_OPACITY,
  METHOD_ORDER,
  compactLkr,
  formatLkr,
  monthLabel,
  pct,
  shortMonth,
} from "@/lib/reports";

const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

/** Shared tooltip shell — popover tokens, never a series color on text. */
function TooltipShell({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-6 text-muted-foreground">
          <span>{k}</span>
          <span className="font-medium text-foreground">{v}</span>
        </p>
      ))}
    </div>
  );
}

// ── Revenue trend (12 months) ────────────────────────────────────────────────

export function RevenueTrendChart({ trend }: { trend: FinancialReport["trend"] }) {
  const data = trend.map((t) => ({ ...t, value: Number(t.collected) }));
  const hasAny = data.some((d) => d.value > 0);
  if (!hasAny) return <EmptyState label="No revenue recorded in this window." />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tickFormatter={shortMonth}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => compactLkr(v)}
          tickLine={false}
          axisLine={false}
          width={44}
          tick={AXIS_TICK}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <TooltipShell
                title={monthLabel(d.month)}
                rows={[
                  ["Collected", formatLkr(d.collected)],
                  ["Payments", String(d.paidCount)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="value" fill="var(--foreground)" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Per-course breakdown (horizontal) ────────────────────────────────────────

export function CourseBreakdownChart({ byCourse }: { byCourse: FinancialReport["byCourse"] }) {
  if (byCourse.length === 0) return <EmptyState label="No course revenue this month." />;
  const data = byCourse.map((c) => ({ ...c, value: Number(c.collected) }));
  const height = Math.max(180, data.length * 44 + 24);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
        barCategoryGap="24%"
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => compactLkr(v)}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tickLine={false}
          axisLine={false}
          tick={AXIS_TICK}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <TooltipShell
                title={`${d.name} · ${d.year}`}
                rows={[
                  ["Collected", formatLkr(d.collected)],
                  ["Payments", String(d.paidCount)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="value" fill="var(--foreground)" radius={[0, 4, 4, 0]} maxBarSize={28}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => compactLkr(Number(v))}
            className="fill-foreground"
            fontSize={12}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Per-method donut ─────────────────────────────────────────────────────────

export function MethodDonut({ byMethod }: { byMethod: FinancialReport["byMethod"] }) {
  if (byMethod.length === 0) return <EmptyState label="No payments to break down this month." />;

  // Render in fixed identity order so shade tracks the method, not its rank.
  const ordered = METHOD_ORDER.map((m) => byMethod.find((b) => b.method === m)).filter(
    (b): b is FinancialReport["byMethod"][number] => Boolean(b),
  );
  const data = ordered.map((b) => ({ ...b, value: Number(b.collected) }));
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-[200px] w-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="method"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.method} fill="var(--foreground)" fillOpacity={METHOD_OPACITY[d.method]} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof data)[number];
                return (
                  <TooltipShell
                    title={METHOD_LABELS[d.method]}
                    rows={[
                      ["Collected", formatLkr(d.collected)],
                      ["Share", `${pct(d.value, total)}%`],
                      ["Payments", String(d.paidCount)],
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-base font-semibold text-foreground">{formatLkr(total)}</span>
        </div>
      </div>

      {/* Legend — identity by label + value, not shade alone. */}
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.method} className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-sm bg-foreground"
              style={{ opacity: METHOD_OPACITY[d.method] }}
            />
            <span className="flex-1 text-foreground">{METHOD_LABELS[d.method]}</span>
            <span className="tabular-nums text-muted-foreground">{pct(d.value, total)}%</span>
            <span className="w-24 text-right font-medium tabular-nums text-foreground">
              {formatLkr(d.collected)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
