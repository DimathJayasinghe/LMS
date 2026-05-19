export {};

/**
 * User Management -- End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-users.ts
 * The server must be running on port 5000 and an admin account must exist.
 */

const DEFAULT_API_BASE = 'http://localhost:5000/api';
const API_BASE = process.env.LMS_API_BASE ?? DEFAULT_API_BASE;
const AUTH_BASE = `${API_BASE}/auth`;
const USERS_BASE = `${API_BASE}/users`;

const ADMIN_EMAIL = (process.env.LMS_ADMIN_EMAIL ?? '').toLowerCase();
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD ?? '';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

const NAME = 'User Smoke Test';
const PASSWORD_VALID = 'Password1';

type JsonValue = unknown;

interface CookieJar {
  values: Map<string, string>;
}

const adminJar: CookieJar = { values: new Map() };
const studentJar: CookieJar = { values: new Map() };
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

const assert = (label: string, condition: boolean, detail?: JsonValue): void => {
  if (condition) {
    console.log(`  OK   ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL ${label}`, detail ?? '');
    failed += 1;
  }
};

const request = async (
  method: string,
  url: string,
  body: Record<string, unknown> | undefined,
  jar: CookieJar,
): Promise<{ status: number; data: JsonValue }> => {
  const res = await fetch(url, {
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
  url: string,
  body: Record<string, unknown> | undefined,
  expectedStatus: number,
  jar: CookieJar,
): Promise<{ status: number; data: JsonValue }> => {
  const result = await request(method, url, body, jar);
  assert(`${label} -> ${expectedStatus}`, result.status === expectedStatus, result.data);
  return result;
};

const requireEnv = (): void => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Missing LMS_ADMIN_EMAIL or LMS_ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }
};

const runTests = async (): Promise<void> => {
  requireEnv();

  const ts = Date.now();
  const rawEmail = `user.${ts}@lms.test`;
  const email = rawEmail.toLowerCase();
  const barcode = `BC-${ts}`;

  console.log('\nUser Management -- Smoke Tests\n');

  await expectStatus('GET /users without auth', 'GET', USERS_BASE, undefined, HTTP_UNAUTHORIZED, anonJar);

  await expectStatus(
    'Admin login',
    'POST',
    `${AUTH_BASE}/login`,
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    HTTP_OK,
    adminJar,
  );

  const adminMe = await expectStatus(
    'GET /users/me (admin)',
    'GET',
    `${USERS_BASE}/me`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const adminMeData = adminMe.data as { data?: { email?: string } };
  assert('Admin email matches', adminMeData.data?.email === ADMIN_EMAIL, adminMe.data);

  const reg = await expectStatus(
    'Register student',
    'POST',
    `${AUTH_BASE}/register`,
    { email: rawEmail, name: NAME, password: PASSWORD_VALID },
    HTTP_CREATED,
    studentJar,
  );

  const regData = reg.data as { data?: { id?: string; email?: string } };
  const studentId = regData.data?.id;
  assert('Student id returned', Boolean(studentId), reg.data);
  assert('Student email normalized', regData.data?.email === email, reg.data);

  if (!studentId) {
    throw new Error('Student ID missing from registration response.');
  }

  await expectStatus(
    'Student GET /users forbidden',
    'GET',
    USERS_BASE,
    undefined,
    HTTP_FORBIDDEN,
    studentJar,
  );

  const list = await expectStatus(
    'Admin list users',
    'GET',
    `${USERS_BASE}?page=1&limit=5&status=all`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const listData = list.data as { data?: unknown[]; count?: number };
  assert('List users data is array', Array.isArray(listData.data), list.data);
  assert('List users count is number', typeof listData.count === 'number', list.data);

  const getUser = await expectStatus(
    'Admin get user',
    'GET',
    `${USERS_BASE}/${studentId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const getUserData = getUser.data as { data?: { id?: string } };
  assert('Get user id matches', getUserData.data?.id === studentId, getUser.data);

  const roleUpdate = await expectStatus(
    'Admin update role',
    'PATCH',
    `${USERS_BASE}/${studentId}/role`,
    { role: 'MARKER' },
    HTTP_OK,
    adminJar,
  );
  const roleData = roleUpdate.data as { data?: { role?: string } };
  assert('Role updated to MARKER', roleData.data?.role === 'MARKER', roleUpdate.data);

  const roleReset = await expectStatus(
    'Admin reset role',
    'PATCH',
    `${USERS_BASE}/${studentId}/role`,
    { role: 'STUDENT' },
    HTTP_OK,
    adminJar,
  );
  const roleResetData = roleReset.data as { data?: { role?: string } };
  assert('Role reset to STUDENT', roleResetData.data?.role === 'STUDENT', roleReset.data);

  const deactivated = await expectStatus(
    'Admin deactivate user',
    'PATCH',
    `${USERS_BASE}/${studentId}/status`,
    { isActive: false },
    HTTP_OK,
    adminJar,
  );
  const deactivatedData = deactivated.data as { data?: { deletedAt?: string | null } };
  assert('User deactivated', Boolean(deactivatedData.data?.deletedAt), deactivated.data);

  const activated = await expectStatus(
    'Admin activate user',
    'PATCH',
    `${USERS_BASE}/${studentId}/status`,
    { isActive: true },
    HTTP_OK,
    adminJar,
  );
  const activatedData = activated.data as { data?: { deletedAt?: string | null } };
  assert('User activated', activatedData.data?.deletedAt === null, activated.data);

  const barcodeRes = await expectStatus(
    'Admin assign barcode',
    'PATCH',
    `${USERS_BASE}/${studentId}/barcode`,
    { barcode },
    HTTP_OK,
    adminJar,
  );
  const barcodeData = barcodeRes.data as { data?: { barcode?: string } };
  assert('Barcode assigned', barcodeData.data?.barcode === barcode, barcodeRes.data);

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
