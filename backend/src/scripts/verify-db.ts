/**
 * Database Connection Verification Script
 * Verifies that the Neon PostgreSQL connection is working correctly.
 * Run: npx tsx src/scripts/verify-db.ts
 */
import { prisma } from '../config/database';
import { logger } from '../config/logger';

async function verifyConnection(): Promise<void> {
  try {
    logger.info('🔄 Attempting to connect to Neon PostgreSQL...');

    // Test 1: Raw query to verify basic connectivity
    const result = await prisma.$queryRaw<Array<{ connected: number }>>`SELECT 1 as connected`;
    logger.info({ result }, '✅ Test 1 PASSED — Basic connectivity');

    // Test 2: Check database version
    const version = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    logger.info({ version: version[0]?.version }, '✅ Test 2 PASSED — Database version');

    // Test 3: Check current database name
    const dbName = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    logger.info({ database: dbName[0]?.current_database }, '✅ Test 3 PASSED — Database name');

    // Test 4: List all tables (verify schema migration)
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    logger.info({ tables: tables.map((t) => t.tablename), count: tables.length }, '✅ Test 4 PASSED — Tables found');

    // Test 5: Verify Prisma models can query (empty result is fine)
    const userCount = await prisma.user.count();
    logger.info({ userCount }, '✅ Test 5 PASSED — Prisma User model query');

    logger.info('🎉 All database connection tests passed! Neon PostgreSQL is ready.');
  } catch (error) {
    logger.error({ err: error }, '❌ Database connection verification FAILED');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyConnection();
