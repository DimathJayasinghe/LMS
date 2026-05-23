/**
 * SSE — Smoke Test
 * Run: npx tsx src/scripts/test-stream.ts
 * Requires the API server and Redis to be running.
 *
 * Docker Compose routes API traffic through nginx on port 80, so the default
 * base URL targets /api on localhost rather than the backend container port.
 */

const API_BASE = process.env.LMS_API_BASE ?? 'http://localhost/api';

const COOKIE_ACCESS = 'access_token';

interface CookieJar {
  values: Map<string, string>;
}

const jar: CookieJar = { values: new Map() };

let passed = 0;
let failed = 0;

const cookieHeader = (): string =>
  Array.from(jar.values.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const extractCookies = (headers: Headers): void => {
  const getSetCookie = (headers as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    getSetCookie?.call(headers) ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);

  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx > 0) {
      jar.values.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
};

const assert = (label: string, condition: boolean, detail?: unknown): void => {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL ${label}`, detail ?? '');
    failed += 1;
  }
};

const registerAndLogin = async (): Promise<void> => {
  const email = `sse-test-${Date.now()}@example.com`;

  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'Password1',
      name: 'SSE Test Student',
      phone: '0771234567',
    }),
  });

  assert('Student registered', registerRes.status === 201);

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password1' }),
  });

  extractCookies(loginRes.headers);
  assert('Student logged in', loginRes.status === 200);
};

const readSseUntilConnected = async (timeoutMs: number): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}/stream`, {
      headers: { Cookie: cookieHeader() },
      signal: controller.signal,
    });

    assert('SSE status 200', res.status === 200);
    assert(
      'SSE content-type',
      (res.headers.get('content-type') ?? '').includes('text/event-stream'),
    );

    const reader = res.body?.getReader();
    if (!reader) {
      return false;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      if (buffer.includes('event: CONNECTED') || buffer.includes('"type":"CONNECTED"')) {
        return true;
      }
    }

    return false;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return false;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const main = async (): Promise<void> => {
  console.log('\n─── SSE Smoke Test ───\n');

  const unauthRes = await fetch(`${API_BASE}/stream`);
  assert('Unauthenticated stream returns 401', unauthRes.status === 401);

  await registerAndLogin();

  const gotConnected = await readSseUntilConnected(5000);
  assert('Received CONNECTED event within 5s', gotConnected);

  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
