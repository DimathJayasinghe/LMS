import { afterEach, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('dotenv/config', () => ({}));
vi.mock('pg', () => ({
  Pool: class {
    async query(): Promise<{ rows: never[] }> { return { rows: [] }; }
    async end(): Promise<void> { return; }
  },
}));

const originalArgv = process.argv;
const directory = mkdtempSync(path.join(os.tmpdir(), 'scan-report-'));
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

it('restricts an existing report file to its owner', async () => {
  const output = path.join(directory, 'report.csv');
  writeFileSync(output, 'old report');
  chmodSync(output, 0o644);
  process.argv = ['node', 'report', '--out', output];
  vi.stubEnv('DATABASE_URL', 'postgres://test');
  await import('./report-scan-code-collisions');
  await vi.waitFor(() => expect(statSync(output).mode & 0o777).toBe(0o600));
});
