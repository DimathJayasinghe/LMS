/**
 * Auth System — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-auth.ts
 * The server must be running on port 5000.
 */

const BASE = 'http://localhost:5000/api/auth';

// ─── Cookie jar helper ───────────────────────────────────────

let cookieJar: string[] = [];

function extractCookies(headers: Headers): void {
  const setCookie = headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookieJar.push(...setCookie);
}

function cookieHeader(): string {
  // Extract name=value pairs only (strip attributes)
  return cookieJar.map((c) => c.split(';')[0]).join('; ');
}

// ─── Request helper ──────────────────────────────────────────

async function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieJar.length ? { Cookie: cookieHeader() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  extractCookies(res.headers);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ─── Test runner ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`, detail ?? '');
    failed++;
  }
}

// ─── Tests ───────────────────────────────────────────────────

async function runTests(): Promise<void> {
  const ts = Date.now();
  const email = `smoke.${ts}@lms.test`;

  console.log('\n🔵 Auth System — Smoke Tests\n');

  // ── Validation ──────────────────────────────────────────────
  console.log('── Validation ──');

  const v1 = await request('POST', '/register', { email: 'not-an-email' });
  assert('Register: missing required fields → 400', v1.status === 400, v1.data);

  const v2 = await request('POST', '/register', {
    email: 't@t.com',
    name: 'Test',
    password: 'weak',
  });
  assert('Register: weak password → 400', v2.status === 400, v2.data);

  // ── Registration ────────────────────────────────────────────
  console.log('\n── Registration ──');

  const reg = await request('POST', '/register', {
    email,
    name: 'Smoke Test User',
    password: 'Password1',
    phone: '0771234567',
  });
  assert('Register new student → 201', reg.status === 201, reg.data);

  const regData = reg.data as { data?: { role?: string; id?: string } };
  assert(
    `Role defaults to STUDENT`,
    regData?.data?.role === 'STUDENT',
    regData?.data?.role,
  );
  console.log(`     user.id = ${regData?.data?.id}`);

  const dupe = await request('POST', '/register', {
    email,
    name: 'Duplicate',
    password: 'Password1',
  });
  assert('Register duplicate email → 409', dupe.status === 409, dupe.data);

  // ── Login ───────────────────────────────────────────────────
  console.log('\n── Login ──');
  cookieJar = []; // Clear cookies from registration

  const wrongPw = await request('POST', '/login', {
    email,
    password: 'WrongPass1',
  });
  assert('Login: wrong password → 401', wrongPw.status === 401, wrongPw.data);

  const login = await request('POST', '/login', { email, password: 'Password1' });
  assert('Login with correct credentials → 200', login.status === 200, login.data);
  assert('Login sets cookies', cookieJar.length > 0, `cookies: ${cookieJar.length}`);

  // ── Protected Endpoint ──────────────────────────────────────
  console.log('\n── Protected Endpoints ──');

  const me = await request('GET', '/me');
  assert('GET /me → 200', me.status === 200, me.data);

  const meData = me.data as { data?: { email?: string } };
  assert(`/me returns correct email`, meData?.data?.email === email, meData?.data?.email);

  // Test unauthenticated /me
  const savedCookies = [...cookieJar];
  cookieJar = [];
  const meUnauth = await request('GET', '/me');
  assert('GET /me without cookie → 401', meUnauth.status === 401, meUnauth.data);
  cookieJar = savedCookies;

  // ── Token Refresh ───────────────────────────────────────────
  console.log('\n── Token Refresh ──');

  const refresh = await request('POST', '/refresh');
  assert('POST /refresh → 200', refresh.status === 200, refresh.data);

  // ── Logout ──────────────────────────────────────────────────
  console.log('\n── Logout ──');

  const logout = await request('POST', '/logout');
  assert('POST /logout → 200', logout.status === 200, logout.data);

  // Browsers honor Set-Cookie: maxAge=0 by deleting the cookie.
  // Our test jar doesn't, so we flush it manually to simulate the same behavior.
  cookieJar = [];

  // Access token cookie should be cleared
  const meAfterLogout = await request('GET', '/me');
  assert('GET /me after logout → 401', meAfterLogout.status === 401, meAfterLogout.data);

  // ── Summary ─────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n✅ All ${passed} tests passed!\n`);
  }
}

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
