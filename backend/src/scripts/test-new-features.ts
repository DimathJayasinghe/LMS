export {};

/**
 * New modules — Subjects, Institutes, Timetable — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-new-features.ts
 * Requires a running server (default http://localhost:5000/api) and a
 * SUPER_ADMIN account (LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD).
 */

const DEFAULT_API_BASE = 'http://localhost:5000/api';
const API_BASE = process.env.LMS_API_BASE ?? DEFAULT_API_BASE;
const AUTH_BASE = `${API_BASE}/auth`;

const ADMIN_EMAIL = (process.env.LMS_ADMIN_EMAIL ?? '').toLowerCase();
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD ?? '';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_CONFLICT = 409;

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
    if (idx > 0) jar.values.set(pair.slice(0, idx), pair.slice(idx + 1));
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

const idOf = (r: { data: JsonValue }): string | undefined =>
  (r.data as { data?: { id?: string } })?.data?.id;

const runTests = async (): Promise<void> => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Missing LMS_ADMIN_EMAIL or LMS_ADMIN_PASSWORD.');
    process.exit(1);
  }

  const ts = Date.now();
  console.log('\nNew Features -- Smoke Tests\n');

  // ── Auth guards ──────────────────────────────────────────
  await expectStatus('GET /subjects without auth', 'GET', `${API_BASE}/subjects`, undefined, HTTP_UNAUTHORIZED, anonJar);
  await expectStatus('Admin login', 'POST', `${AUTH_BASE}/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, HTTP_OK, adminJar);

  const reg = await expectStatus('Register student', 'POST', `${AUTH_BASE}/register`, { email: `stu.${ts}@lms.test`, name: 'Smoke Student', password: 'Password1' }, HTTP_CREATED, studentJar);
  const studentId = idOf(reg);
  assert('Student id returned', Boolean(studentId), reg.data);

  // ── Subjects ─────────────────────────────────────────────
  const subj = await expectStatus('Admin create subject', 'POST', `${API_BASE}/subjects`, { name: `Physics ${ts}` }, HTTP_CREATED, adminJar);
  const subjectId = idOf(subj);
  assert('Subject id returned', Boolean(subjectId), subj.data);
  await expectStatus('Duplicate subject', 'POST', `${API_BASE}/subjects`, { name: `Physics ${ts}` }, HTTP_CONFLICT, adminJar);
  await expectStatus('List subjects', 'GET', `${API_BASE}/subjects`, undefined, HTTP_OK, adminJar);
  await expectStatus('Update subject', 'PATCH', `${API_BASE}/subjects/${subjectId}`, { description: 'A/L Physics' }, HTTP_OK, adminJar);

  // ── Institutes ───────────────────────────────────────────
  const inst = await expectStatus('Admin create institute', 'POST', `${API_BASE}/institutes`, { name: `Nugegoda ${ts}`, code: `NUG${ts}`, city: 'Nugegoda' }, HTTP_CREATED, adminJar);
  const instituteId = idOf(inst);
  assert('Institute id returned', Boolean(instituteId), inst.data);
  await expectStatus('Duplicate institute code', 'POST', `${API_BASE}/institutes`, { name: `Other ${ts}`, code: `NUG${ts}` }, HTTP_CONFLICT, adminJar);
  await expectStatus('List institutes', 'GET', `${API_BASE}/institutes`, undefined, HTTP_OK, adminJar);

  // ── Promote a teacher, create a course ───────────────────
  await expectStatus('Promote student -> TEACHER', 'PATCH', `${API_BASE}/users/${studentId}/role`, { role: 'TEACHER' }, HTTP_OK, adminJar);
  const course = await expectStatus('Create course (subject + teacher + banner)', 'POST', `${API_BASE}/classes`, {
    name: `Theory ${ts}`,
    year: 2026,
    monthlyFee: 2500,
    subjectId,
    teacherId: studentId,
    bannerUrl: 'https://example.com/banner.png',
    backdropUrl: 'https://example.com/backdrop.png',
  }, HTTP_CREATED, adminJar);
  const courseId = idOf(course);
  assert('Course id + banner returned', Boolean(courseId) && (course.data as { data?: { bannerUrl?: string } }).data?.bannerUrl === 'https://example.com/banner.png', course.data);

  // ── Timetable ────────────────────────────────────────────
  const slot = await expectStatus('Create timetable slot', 'POST', `${API_BASE}/timetable/slots`, {
    courseId,
    instituteId,
    dayOfWeek: 1, // Monday
    startTime: '16:00',
    durationMinutes: 120,
    classType: 'PHYSICAL',
  }, HTTP_CREATED, adminJar);
  const slotId = idOf(slot);
  assert('Slot id returned', Boolean(slotId), slot.data);

  await expectStatus('List timetable', 'GET', `${API_BASE}/timetable/slots`, undefined, HTTP_OK, adminJar);
  await expectStatus('Get slot', 'GET', `${API_BASE}/timetable/slots/${slotId}`, undefined, HTTP_OK, adminJar);

  // Generate sessions across the next 21 days — must produce ≥1 Monday session.
  const from = new Date();
  const to = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  const gen = await expectStatus('Generate sessions from timetable', 'POST', `${API_BASE}/timetable/generate`, { from: from.toISOString(), to: to.toISOString() }, HTTP_OK, adminJar);
  const created = (gen.data as { data?: { created?: number } }).data?.created ?? 0;
  assert('At least one session generated', created >= 1, gen.data);

  // Re-run must be idempotent: nothing new created.
  const gen2 = await request('POST', `${API_BASE}/timetable/generate`, { from: from.toISOString(), to: to.toISOString() }, adminJar);
  const created2 = (gen2.data as { data?: { created?: number } }).data?.created ?? -1;
  assert('Re-generate is idempotent (0 created)', created2 === 0, gen2.data);

  // Generated sessions should appear under the course.
  const sessions = await expectStatus('List course sessions', 'GET', `${API_BASE}/classes/${courseId}/sessions`, undefined, HTTP_OK, adminJar);
  const sessionCount = ((sessions.data as { data?: unknown[] }).data ?? []).length;
  assert('Course has generated sessions', sessionCount >= 1, sessions.data);

  await expectStatus('Update slot', 'PATCH', `${API_BASE}/timetable/slots/${slotId}`, { durationMinutes: 90 }, HTTP_OK, adminJar);
  await expectStatus('Delete slot', 'DELETE', `${API_BASE}/timetable/slots/${slotId}`, undefined, HTTP_OK, adminJar);

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
};

runTests().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
