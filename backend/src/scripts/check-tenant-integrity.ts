export {};

/**
 * Fails (exit 1) if any child row's organizationId differs from its parent's, and also reports rows with no
 * organization. Run after migrations in CI and by operators:
 *   DATABASE_URL=... npx tsx src/scripts/check-tenant-integrity.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { buildIntegrityChecks, tenantOwnedModels } from '@/utils/tenant-integrity';

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
  const pool = new Pool({ connectionString });
  let failures = 0;

  try {
    for (const model of tenantOwnedModels(schema)) {
      const { rows } = await pool.query(`SELECT count(*)::int AS missing FROM "${model}" WHERE "organizationId" IS NULL`);
      if (rows[0].missing > 0) {
        failures += 1;
        console.error(`FAIL ${model}: ${rows[0].missing} row(s) without an organization`);
      }
    }
    for (const check of buildIntegrityChecks(schema)) {
      const { rows } = await pool.query(check.sql);
      if (rows[0].violations > 0) {
        failures += 1;
        console.error(`FAIL ${check.name}: ${rows[0].violations} cross-organization row(s)`);
      }
    }
  } finally {
    await pool.end();
  }

  if (failures > 0) process.exit(1);
  console.log('Tenant integrity check passed.');
};

main().catch((err) => {
  console.error('Tenant integrity check failed to run:', err);
  process.exit(1);
});
