export {};

/**
 * Seeds a SUPER_ADMIN from LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD.
 * Idempotent (upsert). Reads DATABASE_URL from the environment.
 * Run: DATABASE_URL=... npx tsx src/scripts/seed-admin.ts
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const main = async (): Promise<void> => {
  const email = (process.env.LMS_ADMIN_EMAIL ?? 'admin@lms.test').toLowerCase();
  const password = process.env.LMS_ADMIN_PASSWORD ?? 'Admin@12345';
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: 'SUPER_ADMIN', password: hash, setupCompleted: true, deletedAt: null },
      create: {
        email,
        name: 'Super Admin',
        password: hash,
        role: 'SUPER_ADMIN',
        setupCompleted: true,
      },
      select: { id: true, email: true, role: true },
    });
    console.log('Seeded admin:', user.email, user.role);
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
