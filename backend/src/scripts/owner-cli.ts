import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { addOwner, resetOwnerPassword } from './owner-lib';

const promptPassword = (): Promise<string> => new Promise((resolve, reject) => {
  if (!process.stdin.isTTY) return reject(new Error('An interactive terminal is required.'));
  process.stdout.write('Password: ');
  let password = '';
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const onData = (buffer: Buffer): void => {
    for (const char of buffer.toString('utf8')) {
      if (char === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
      if (char === '\r' || char === '\n') { cleanup(); resolve(password); return; }
      if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
      else if (char >= ' ') password += char;
    }
  };
  const cleanup = (): void => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
  process.stdin.on('data', onData);
});

export const runOwnerCli = async (mode: 'add' | 'reset'): Promise<void> => {
  const args = process.argv.slice(2);
  const emailIndex = args.indexOf('--email');
  const email = emailIndex >= 0 ? args[emailIndex + 1]?.trim().toLowerCase() : undefined;
  const allowed = mode === 'reset' ? ['--generate', '--reactivate'] : ['--generate'];
  const other = args.filter((_, index) => index !== emailIndex && index !== emailIndex + 1);
  if (!email || email.startsWith('--') || other.some((arg) => !allowed.includes(arg)) || new Set(other).size !== other.length) throw new Error('Use --email <address> [--generate]' + (mode === 'reset' ? ' [--reactivate]' : ''));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const generated = args.includes('--generate');
  const password = generated ? randomBytes(24).toString('base64url') : await promptPassword();
  if (password.length < 8 || Buffer.byteLength(password) > 72) throw new Error('Password must be at least 8 characters and at most 72 bytes.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    if (mode === 'add') await addOwner(db, email, password);
    else await resetOwnerPassword(db, email, password, args.includes('--reactivate'));
    console.log('Owner account updated.');
    if (generated) console.log(`Generated password: ${password}`);
  } finally {
    await db.$disconnect();
    await pool.end();
  }
};
