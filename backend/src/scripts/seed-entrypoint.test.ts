import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
const runEntrypoint = (seedExit: number) => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-entrypoint-'));
  dirs.push(dir);
  for (const [name, body] of Object.entries({
    npx: 'exit 0',
    node: `exit ${seedExit}`,
    npm: 'echo BACKEND_STARTED',
  })) {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  }
  return spawnSync('sh', [resolve('docker-entrypoint.sh'), 'npm', 'run', 'start'], {
    encoding: 'utf8',
    env: { PATH: `${dir}:/usr/bin:/bin`, LMS_ADMIN_EMAIL: 'owner@example.test', LMS_ADMIN_PASSWORD: 'fixture' },
  });
};
describe('startup seed handling', () => {
  it.each([0, 1])('starts the backend when the seed exits %s', (seedExit) => {
    const result = runEntrypoint(seedExit);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('BACKEND_STARTED');
  });
});
