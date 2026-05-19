/**
 * Auth System — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-auth.ts
 * The server must be running on port 5000.
 */

const DEFAULT_BASE = 'http://localhost:5000/api/auth';
const BASE = process.env.LMS_AUTH_BASE ?? DEFAULT_BASE;

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_CONFLICT = 409;

const COOKIE_ACCESS = 'access_token';
const COOKIE_REFRESH = 'refresh_token';

const NAME = 'Smoke Test User';
const PASSWORD_VALID = 'Password1';
const PASSWORD_INVALID = 'weakpass';
const PHONE_VALID = '0771234567';

type JsonValue = unknown;

interface CookieJar {
  values: Map<string, string>;
}

const authJar: CookieJar = { values: new Map() };
const anonJar: CookieJar = { values: new Map() };

let passed = 0;
let failed = 0;

const cookieHeader = (jar: CookieJar): string =>
  Array.from(jar.values.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const extractCookies = (headers: Headers, jar: CookieJar): void => {
  const getSetCookie = (headers as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies =
    getSetCookie?.call(headers) ?? (headers.get('set-cookie') ? [headers.get('set-cookie')!] : []);

  for (const raw of setCookies) {
    const pair = raw.split(';')[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      jar.values.set(name, value);
    }
  }
};

const getCookieValue = (jar: CookieJar, name: string): string | undefined => jar.values.get(name);

const setCookieValue = (jar: CookieJar, name: string, value: string): void => {
  jar.values.set(name, value);
};

const assert = (label: string, condition: boolean, detail?: JsonValue): void => {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL ${label}`, detail ?? '');
    failed += 1;
  }
};

const assertEqual = (label: string, expected: string, actual: string | undefined): void => {
  if (expected === actual) {
    console.log(`  OK   ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL ${label} (expected: ${expected}, actual: ${actual})`);
    failed += 1;
  }
};

const request = async (
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  jar: CookieJar,
): Promise<{ status: number; data: JsonValue }> => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar.values.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  extractCookies(res.headers, jar);
  const data = (await res.json().catch(() => null)) as JsonValue;
  return { status: res.status, data };
};

const expectStatus = async (
  label: string,
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  expectedStatus: number,
  jar: CookieJar,
): Promise<{ status: number; data: JsonValue }> => {
  const result = await request(method, path, body, jar);
  assert(`${label} -> ${expectedStatus}`, result.status === expectedStatus, result.data);
  return result;
};

const runTests = async (): Promise<void> => {
  const ts = Date.now();
  const rawEmail = `SmokeTest.${ts}@LMS.Test`;
  const email = rawEmail.toLowerCase();
  const dupeEmail = `dupe.nic.${ts}@lms.test`;
  const nic = ts.toString().slice(-12).padStart(12, '0');

  console.log('\nAuth System — Smoke Tests\n');

  console.log('── Validation ──');
  const validationTests = [
    {
      label: 'Register missing fields',
      method: 'POST',
      path: '/register',
      body: { email: 'not-an-email' },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Register invalid email',
      method: 'POST',
      path: '/register',
      body: { email: 'bad', name: 'Test', password: PASSWORD_VALID },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Register weak password',
      method: 'POST',
      path: '/register',
      body: { email: 't@t.com', name: 'Test', password: PASSWORD_INVALID },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Register invalid phone',
      method: 'POST',
      path: '/register',
      body: { email: 'p@t.com', name: 'Test', password: PASSWORD_VALID, phone: '123' },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Register invalid NIC',
      method: 'POST',
      path: '/register',
      body: { email: 'n@t.com', name: 'Test', password: PASSWORD_VALID, nic: 'ABC' },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Login missing password',
      method: 'POST',
      path: '/login',
      body: { email: 't@t.com' },
      expected: HTTP_BAD_REQUEST,
    },
    {
      label: 'Login invalid email',
      method: 'POST',
      path: '/login',
      body: { email: 'not-an-email', password: PASSWORD_VALID },
      expected: HTTP_BAD_REQUEST,
    },
  ];

  for (const t of validationTests) {
    await expectStatus(t.label, t.method, t.path, t.body, t.expected, anonJar);
  }

  console.log('\n── Registration ──');
  const reg = await expectStatus(
    'Register new student',
    'POST',
    '/register',
    {
      email: rawEmail,
      name: NAME,
      password: PASSWORD_VALID,
      phone: PHONE_VALID,
      nic,
    },
    HTTP_CREATED,
    authJar,
  );

  const regData = reg.data as { data?: { id?: string; role?: string; email?: string } };
  assertEqual('Email normalized', email, regData.data?.email);
  assertEqual('Role default', 'STUDENT', regData.data?.role);
  if (regData.data?.id) {
    console.log(`     user.id = ${regData.data.id}`);
  }

  await expectStatus(
    'Register duplicate email',
    'POST',
    '/register',
    { email, name: 'Dupe', password: PASSWORD_VALID },
    HTTP_CONFLICT,
    anonJar,
  );

  await expectStatus(
    'Register duplicate NIC',
    'POST',
    '/register',
    { email: dupeEmail, name: 'Dupe NIC', password: PASSWORD_VALID, nic },
    HTTP_CONFLICT,
    anonJar,
  );

  anonJar.values.clear();

  console.log('\n── Login ──');
  await expectStatus(
    'Login wrong password',
    'POST',
    '/login',
    { email, password: 'WrongPass1' },
    HTTP_UNAUTHORIZED,
    anonJar,
  );

  const login = await expectStatus(
    'Login correct credentials',
    'POST',
    '/login',
    { email, password: PASSWORD_VALID },
    HTTP_OK,
    authJar,
  );

  const accessToken = getCookieValue(authJar, COOKIE_ACCESS);
  const refreshToken = getCookieValue(authJar, COOKIE_REFRESH);
  assert('Access cookie set', Boolean(accessToken), login.data);
  assert('Refresh cookie set', Boolean(refreshToken), login.data);

  console.log('\n── Protected Endpoints ──');
  await expectStatus('GET /me without auth', 'GET', '/me', undefined, HTTP_UNAUTHORIZED, anonJar);

  const accessTokenOriginal = getCookieValue(authJar, COOKIE_ACCESS);
  if (accessTokenOriginal) {
    setCookieValue(authJar, COOKIE_ACCESS, 'invalid');
    const invalidToken = await expectStatus(
      'GET /me with invalid token',
      'GET',
      '/me',
      undefined,
      HTTP_UNAUTHORIZED,
      authJar,
    );
    const invalidData = invalidToken.data as { data?: { expired?: boolean } };
    if (invalidData.data?.expired !== undefined) {
      assert('Expired flag is false', invalidData.data.expired === false, invalidToken.data);
    }
    setCookieValue(authJar, COOKIE_ACCESS, accessTokenOriginal);
  }

  const me = await expectStatus('GET /me (authenticated)', 'GET', '/me', undefined, HTTP_OK, authJar);
  const meData = me.data as { data?: { email?: string } };
  assertEqual('Email matches', email, meData.data?.email);

  console.log('\n── Token Refresh ──');
  await expectStatus('POST /refresh without cookie', 'POST', '/refresh', undefined, HTTP_UNAUTHORIZED, anonJar);

  const oldRefresh = getCookieValue(authJar, COOKIE_REFRESH);
  if (oldRefresh) {
    setCookieValue(authJar, COOKIE_REFRESH, 'invalid');
    await expectStatus('POST /refresh with invalid token', 'POST', '/refresh', undefined, HTTP_UNAUTHORIZED, authJar);
    setCookieValue(authJar, COOKIE_REFRESH, oldRefresh);
  }

  await expectStatus('POST /refresh (valid cookie)', 'POST', '/refresh', undefined, HTTP_OK, authJar);
  const newRefresh = getCookieValue(authJar, COOKIE_REFRESH);
  if (oldRefresh && newRefresh) {
    assert('Refresh token rotated', oldRefresh !== newRefresh, { oldRefresh, newRefresh });
  }

  if (oldRefresh) {
    setCookieValue(authJar, COOKIE_REFRESH, oldRefresh);
    await expectStatus(
      'POST /refresh with reused token',
      'POST',
      '/refresh',
      undefined,
      HTTP_UNAUTHORIZED,
      authJar,
    );
  }

  console.log('\n── Logout ──');
  await expectStatus('POST /logout', 'POST', '/logout', undefined, HTTP_OK, authJar);
  authJar.values.clear();
  await expectStatus('GET /me after logout', 'GET', '/me', undefined, HTTP_UNAUTHORIZED, authJar);
  await expectStatus('POST /logout without cookie', 'POST', '/logout', undefined, HTTP_OK, anonJar);

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.\n`);
    process.exit(1);
  } else {
    console.log(`\nAll ${passed} tests passed.\n`);
  }
};

runTests().catch((err) => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
