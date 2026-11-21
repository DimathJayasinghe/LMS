import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readSeedCredentials, seedOwner } from './owner-lib';

const main = async (): Promise<void> => {
  const { email, password } = readSeedCredentials(process.env);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const result = await seedOwner(db, email, password);
    if (result === 'created') console.log('Owner account created.');
    else if (result === 'exists') console.log('Owner already exists; seed skipped. Use owner:reset-password for recovery.');
    else console.warn('Seed skipped: configured email already belongs to an account.');
  } finally {
    await db.$disconnect();
    await pool.end();
  }
};
main().catch((error: Error) => { console.error('Seed failed:', error.message); process.exitCode = 1; });
