export {};

/**
 * Classes + Class Sessions — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-classes.ts
 * The server must be running on port 5000 and an admin account must exist.
 */

const DEFAULT_API_BASE = 'http://localhost:5000/api';
const API_BASE = process.env.LMS_API_BASE ?? DEFAULT_API_BASE;
const AUTH_BASE = `${API_BASE}/auth`;
const CLASSES_BASE = `${API_BASE}/classes`;

const ADMIN_EMAIL = (process.env.LMS_ADMIN_EMAIL ?? '').toLowerCase();
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD ?? '';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

const CLASS_NAME = '2025 A/L Theory';

interface CookieJar {
  values: Map<string, string>;
}

type JsonValue = unknown;

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
  const className = `${CLASS_NAME} ${ts}`;
  const classYear = 2025;

  console.log('\nClasses + Sessions -- Smoke Tests\n');

  await expectStatus('GET /classes without auth', 'GET', CLASSES_BASE, undefined, HTTP_UNAUTHORIZED, anonJar);

  await expectStatus(
    'Admin login',
    'POST',
    `${AUTH_BASE}/login`,
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    HTTP_OK,
    adminJar,
  );

  const regStudent = await expectStatus(
    'Register student',
    'POST',
    `${AUTH_BASE}/register`,
    { email: `student.${ts}@lms.test`, name: 'Class Smoke Student', password: 'Password1' },
    HTTP_CREATED,
    studentJar,
  );

  const studentData = regStudent.data as { data?: { id?: string } };
  assert('Student registered', Boolean(studentData.data?.id), regStudent.data);

  await expectStatus(
    'Student create class forbidden',
    'POST',
    CLASSES_BASE,
    { name: className, year: classYear, monthlyFee: 2500 },
    HTTP_FORBIDDEN,
    studentJar,
  );

  const created = await expectStatus(
    'Admin create class',
    'POST',
    CLASSES_BASE,
    { name: className, year: classYear, monthlyFee: 2500 },
    HTTP_CREATED,
    adminJar,
  );

  const createdData = created.data as { data?: { id?: string } };
  const classId = createdData.data?.id;
  assert('Class id returned', Boolean(classId), created.data);

  if (!classId) {
    throw new Error('Class id missing from create response.');
  }

  const list = await expectStatus(
    'Admin list classes',
    'GET',
    `${CLASSES_BASE}?year=${classYear}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const listData = list.data as { data?: unknown[] };
  assert('List classes data is array', Array.isArray(listData.data), list.data);

  const getClass = await expectStatus(
    'Admin get class',
    'GET',
    `${CLASSES_BASE}/${classId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const getClassData = getClass.data as { data?: { id?: string } };
  assert('Get class id matches', getClassData.data?.id === classId, getClass.data);

  await expectStatus(
    'Admin update class',
    'PATCH',
    `${CLASSES_BASE}/${classId}`,
    { description: 'Updated class description' },
    HTTP_OK,
    adminJar,
  );

  const sessionPayload = {
    title: 'Revision Session',
    date: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    durationMinutes: 90,
  };

  const createdSession = await expectStatus(
    'Admin create class session',
    'POST',
    `${CLASSES_BASE}/${classId}/sessions`,
    sessionPayload,
    HTTP_CREATED,
    adminJar,
  );

  const createdSessionData = createdSession.data as { data?: { id?: string } };
  const sessionId = createdSessionData.data?.id;
  assert('Session id returned', Boolean(sessionId), createdSession.data);

  if (!sessionId) {
    throw new Error('Session id missing from create response.');
  }

  const listSessions = await expectStatus(
    'List class sessions',
    'GET',
    `${CLASSES_BASE}/${classId}/sessions`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const listSessionsData = listSessions.data as { data?: unknown[] };
  assert('List sessions data is array', Array.isArray(listSessionsData.data), listSessions.data);

  const getSession = await expectStatus(
    'Get class session',
    'GET',
    `${CLASSES_BASE}/${classId}/sessions/${sessionId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const getSessionData = getSession.data as { data?: { id?: string } };
  assert('Get session id matches', getSessionData.data?.id === sessionId, getSession.data);

  await expectStatus(
    'Update class session',
    'PATCH',
    `${CLASSES_BASE}/${classId}/sessions/${sessionId}`,
    { title: 'Revision Session Updated' },
    HTTP_OK,
    adminJar,
  );

  await expectStatus(
    'Delete class session',
    'DELETE',
    `${CLASSES_BASE}/${classId}/sessions/${sessionId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );

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
