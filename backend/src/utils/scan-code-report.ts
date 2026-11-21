import path from 'node:path';
import { lstatSync, realpathSync } from 'node:fs';

// ─── Scan-code collision report ──────────────────────────────
// Read-only operator report: every code held by more than one student across both code tables
// (compared case-insensitively, like the resolver), and every institute card written in the
// reserved `LMS-<n>` card format. Run it before the unambiguous resolver is deployed.

export interface ReportRow {
  reason: 'COLLISION' | 'RESERVED_FORMAT' | 'NON_PRINTABLE_ASCII';
  code: string;
  holderCount: number | null;
  kind: 'USER_BARCODE' | 'INSTITUTE_CARD';
  instituteCode: string | null;
  userId: string;
  indexNumber: number;
  name: string;
  role: string;
  deactivated: boolean;
}

export const COLLISION_REPORT_SQL = `
WITH holders AS (
  SELECT upper(u."barcode") AS code, 'USER_BARCODE' AS kind, NULL::text AS "instituteCode",
         u."id" AS "userId", u."indexNumber", u."name", u."role"::text AS role,
         (u."deletedAt" IS NOT NULL) AS deactivated
  FROM "User" u
  WHERE u."barcode" IS NOT NULL
  UNION ALL
  SELECT upper(b."barcode"), 'INSTITUTE_CARD', i."code",
         u."id", u."indexNumber", u."name", u."role"::text,
         (u."deletedAt" IS NOT NULL)
  FROM "StudentBarcode" b
  JOIN "User" u ON u."id" = b."userId"
  JOIN "Institute" i ON i."id" = b."instituteId"
),
colliding AS (
  SELECT code, count(DISTINCT "userId")::int AS "holderCount"
  FROM holders
  GROUP BY code
  HAVING count(DISTINCT "userId") > 1
)
SELECT 'COLLISION' AS reason, h.code, c."holderCount", h.kind, h."instituteCode",
       h."userId", h."indexNumber", h."name", h.role, h.deactivated
FROM holders h
JOIN colliding c ON c.code = h.code
ORDER BY h.code, h."indexNumber"
`;

export const RESERVED_FORMAT_REPORT_SQL = `
SELECT 'RESERVED_FORMAT' AS reason, upper(b."barcode") AS code, NULL::int AS "holderCount",
       'INSTITUTE_CARD' AS kind, i."code" AS "instituteCode",
       u."id" AS "userId", u."indexNumber", u."name", u."role"::text AS role,
       (u."deletedAt" IS NOT NULL) AS deactivated
FROM "StudentBarcode" b
JOIN "User" u ON u."id" = b."userId"
JOIN "Institute" i ON i."id" = b."instituteId"
WHERE b."barcode" ~* '^LMS-[0-9]+$'
UNION ALL
SELECT 'RESERVED_FORMAT', upper(u."barcode"), NULL::int, 'USER_BARCODE', NULL::text,
       u."id", u."indexNumber", u."name", u."role"::text, (u."deletedAt" IS NOT NULL)
FROM "User" u
WHERE u."barcode" ~* '^LMS-[0-9]+$'
  AND upper(u."barcode") <> 'LMS-' || lpad(u."indexNumber"::text, greatest(6, length(u."indexNumber"::text)), '0')
ORDER BY code, "indexNumber"
`;

export const NON_ASCII_REPORT_SQL = `
SELECT 'NON_PRINTABLE_ASCII' AS reason, u."barcode" AS code, NULL::int AS "holderCount",
       'USER_BARCODE' AS kind, NULL::text AS "instituteCode",
       u."id" AS "userId", u."indexNumber", u."name", u."role"::text AS role,
       (u."deletedAt" IS NOT NULL) AS deactivated
FROM "User" u
WHERE u."barcode" COLLATE "C" ~ '[^ -~]'
UNION ALL
SELECT 'NON_PRINTABLE_ASCII', b."barcode", NULL::int, 'INSTITUTE_CARD', i."code",
       u."id", u."indexNumber", u."name", u."role"::text, (u."deletedAt" IS NOT NULL)
FROM "StudentBarcode" b
JOIN "User" u ON u."id" = b."userId"
JOIN "Institute" i ON i."id" = b."instituteId"
WHERE b."barcode" COLLATE "C" ~ '[^ -~]'
ORDER BY code, "indexNumber"
`;

const CSV_COLUMNS: (keyof ReportRow)[] = [
  'reason',
  'code',
  'holderCount',
  'kind',
  'instituteCode',
  'userId',
  'indexNumber',
  'name',
  'role',
  'deactivated',
];

const csvCell = (value: string | number | boolean | null): string => {
  if (value === null) return '';
  let text = String(value);
  // A leading formula character would run as a formula when the file is opened in a spreadsheet.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const reportToCsv = (rows: ReportRow[]): string =>
  [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))].join('\n') +
  '\n';

export interface ReportSummary {
  collidingCodes: number;
  collidingHolders: number;
  reservedFormatCards: number;
  nonPrintableCodes: number;
}

export const summarizeReport = (rows: ReportRow[]): ReportSummary => {
  const collisions = rows.filter((row) => row.reason === 'COLLISION');
  return {
    collidingCodes: new Set(collisions.map((row) => row.code)).size,
    collidingHolders: new Set(collisions.map((row) => `${row.code}\u0000${row.userId}`)).size,
    reservedFormatCards: rows.filter((row) => row.reason === 'RESERVED_FORMAT').length,
    nonPrintableCodes: rows.filter((row) => row.reason === 'NON_PRINTABLE_ASCII').length,
  };
};

/** The report names students, so it must never be written where a `git add` could pick it up. */
export const assertOutsideRepository = (outPath: string, repositoryRoots: string[]): void => {
  const output = path.resolve(outPath);
  const parent = realpathSync(path.dirname(output));
  const destination = path.join(parent, path.basename(output));
  const resolved = lstatSync(destination, { throwIfNoEntry: false }) ? realpathSync(destination) : destination;
  for (const root of repositoryRoots) {
    const relative = path.relative(realpathSync(root), resolved);
    if (relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
      throw new Error(`Refusing to write the report inside the repository (${root}). Choose an --out path outside it.`);
    }
  }
};
