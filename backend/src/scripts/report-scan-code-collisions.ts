export {};

/**
 * Read-only report of scan codes that would become ambiguous: a code held by more than one student
 * (across the LMS card and every institute card), and institute cards written in the reserved
 * `LMS-<n>` card format. Run it against production BEFORE deploying the unambiguous scan resolver and
 * have the front desk resolve every listed row first.
 *
 *   npm run scan-codes:report -- --out /somewhere/outside/the/repo/scan-code-report.csv
 *
 * Without --out it prints counts only. The CSV names students, so it is never written inside the
 * repository and must not be committed.
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import {
  COLLISION_REPORT_SQL,
  RESERVED_FORMAT_REPORT_SQL,
  NON_ASCII_REPORT_SQL,
  assertOutsideRepository,
  reportToCsv,
  summarizeReport,
  type ReportRow,
} from '@/utils/scan-code-report';

const parseOutPath = (argv: string[]): string | null => {
  const index = argv.indexOf('--out');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--out needs a file path.');
  return value;
};

const repositoryRoots = (): string[] => {
  const roots = [path.resolve(__dirname, '../..')];
  try {
    roots.push(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch {
    // Not inside a git checkout (for example a container): the backend directory is the only root.
  }
  return roots;
};

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const outPath = parseOutPath(process.argv.slice(2));
  if (outPath) assertOutsideRepository(outPath, repositoryRoots());

  const pool = new Pool({ connectionString });
  let rows: ReportRow[];
  try {
    const [collisions, reserved, nonAscii] = await Promise.all([
      pool.query<ReportRow>(COLLISION_REPORT_SQL),
      pool.query<ReportRow>(RESERVED_FORMAT_REPORT_SQL),
      pool.query<ReportRow>(NON_ASCII_REPORT_SQL),
    ]);
    rows = [...collisions.rows, ...reserved.rows, ...nonAscii.rows];
  } finally {
    await pool.end();
  }

  const summary = summarizeReport(rows);
  console.log(`Codes held by more than one student: ${summary.collidingCodes} (${summary.collidingHolders} holders)`);
  console.log(`Codes in the reserved LMS-<n> format: ${summary.reservedFormatCards}`);
  console.log(`Codes outside printable ASCII: ${summary.nonPrintableCodes}`);

  if (outPath) {
    writeFileSync(outPath, reportToCsv(rows), { mode: 0o600 });
    console.log(`Wrote ${rows.length} row(s) to ${path.resolve(outPath)}`);
  } else if (rows.length > 0) {
    console.log('Re-run with --out <path outside the repository> to write the rows.');
  }

  if (rows.length > 0) process.exit(2);
};

main().catch((err) => {
  console.error('Scan-code report failed to run:', err);
  process.exit(1);
});
