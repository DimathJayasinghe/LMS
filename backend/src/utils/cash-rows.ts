import { Prisma } from '@prisma/client';

/** One collector's cash for one Colombo day at one branch, as the payments say right now. */
export interface CashDay {
  day: string;
  collectorId: string;
  collectorName: string;
  instituteId: string | null;
  instituteName: string | null;
  amount: string;
  paymentCount: number;
}

/** A stored close, with the names the screen needs. */
export interface TallyRecord {
  id: string;
  day: string;
  collectorId: string;
  collector: { name: string };
  instituteId: string | null;
  institute: { name: string } | null;
  countedAmount: Prisma.Decimal;
  systemAmount: Prisma.Decimal;
  variance: Prisma.Decimal;
  paymentCount: number;
  note: string | null;
  updatedAt: Date;
  reconciledAt: Date | null;
  reconciledBy: { name: string } | null;
}

export interface CashTallyView {
  id: string;
  countedAmount: string;
  systemAmount: string;
  variance: string;
  paymentCount: number;
  note: string | null;
  closedAt: Date;
  flagged: boolean;
  staleSinceClose: boolean;
  reconciledAt: Date | null;
  reconciledByName: string | null;
}

export interface CashRow extends CashDay {
  tally: CashTallyView | null;
}

const key = (collectorId: string, day: string, instituteId: string | null): string => `${collectorId}|${day}|${instituteId ?? ''}`;

/** A difference beyond the owner's threshold, in either direction; zero threshold means any difference. */
export const isFlagged = (variance: Prisma.Decimal.Value, threshold: Prisma.Decimal.Value): boolean =>
  new Prisma.Decimal(variance).abs().greaterThan(threshold);

const view = (t: TallyRecord, live: CashDay | undefined, threshold: Prisma.Decimal.Value): CashTallyView => ({
  id: t.id,
  countedAmount: t.countedAmount.toFixed(2),
  systemAmount: t.systemAmount.toFixed(2),
  variance: t.variance.toFixed(2),
  paymentCount: t.paymentCount,
  note: t.note,
  closedAt: t.updatedAt,
  flagged: isFlagged(t.variance, threshold),
  staleSinceClose: !live || !new Prisma.Decimal(live.amount).equals(t.systemAmount) || live.paymentCount !== t.paymentCount,
  reconciledAt: t.reconciledAt,
  reconciledByName: t.reconciledBy?.name ?? null,
});

const byNameThenBranch = (a: CashRow, b: CashRow): number =>
  b.day.localeCompare(a.day) || a.collectorName.localeCompare(b.collectorName) ||
  (a.instituteName === null ? 1 : 0) - (b.instituteName === null ? 1 : 0) || (a.instituteName ?? '').localeCompare(b.instituteName ?? '');

/**
 * Joins live cash by (collector, day, branch) to the stored closes. A close whose cash has since gone away still shows,
 * as a zero row, so a refund or override after the count cannot hide a counted day.
 */
export const buildCashRows = (days: CashDay[], tallies: TallyRecord[], flagThreshold: Prisma.Decimal.Value): CashRow[] => {
  const liveByKey = new Map(days.map((d) => [key(d.collectorId, d.day, d.instituteId), d]));
  const rows: CashRow[] = days.map((d) => ({ ...d, tally: null }));
  const byKey = new Map(rows.map((r) => [key(r.collectorId, r.day, r.instituteId), r]));

  for (const t of tallies) {
    const k = key(t.collectorId, t.day, t.instituteId);
    let row = byKey.get(k);
    if (!row) {
      row = { day: t.day, collectorId: t.collectorId, collectorName: t.collector.name, instituteId: t.instituteId, instituteName: t.institute?.name ?? null, amount: '0.00', paymentCount: 0, tally: null };
      rows.push(row);
      byKey.set(k, row);
    }
    row.tally = view(t, liveByKey.get(k), flagThreshold);
  }
  return rows.sort(byNameThenBranch);
};
