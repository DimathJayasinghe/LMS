/**
 * Attendance System — End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-attendance.ts
 * The server must be running on port 5000.
 */

import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:5000/api';

// You must provide an existing admin account to run this test
// since direct database modifications from scripts are timing out.
const ADMIN_EMAIL = process.env.LMS_ADMIN_EMAIL || 'admin@lms.com';
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD || 'adminpassword123';

// ─── Helpers ─────────────────────────────────────────────────

interface CookieJar {
  values: Map<string, string>;
}

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

let passed = 0;
let failed = 0;

const assert = (label: string, condition: boolean, detail?: unknown): void => {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`, detail ?? '');
    failed++;
  }
};

async function request(
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  jar: CookieJar,
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(method === 'PATCH' ? { 'Idempotency-Key': randomUUID() } : {}),
      ...(jar.values.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  extractCookies(res.headers, jar);
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

// ─── Setup / Teardown ────────────────────────────────────────

const ts = Date.now();
const studentEmail = `student.${ts}@test.com`;
const adminEmail = ADMIN_EMAIL;
const adminPassword = ADMIN_PASSWORD;
const password = 'Password123';
const barcode = `BAR-${ts}`;
const zoomMeetingId = `ZOOM-${ts}`;

let studentId = '';
let adminId = '';
let courseId = '';
let classSessionId = '';
let instituteId = '';

const adminJar: CookieJar = { values: new Map() };
const studentJar: CookieJar = { values: new Map() };

async function setup() {
  console.log('── Setting up test data ──');

  // Register Student
  const studentRes = await request('POST', '/auth/register', {
    email: studentEmail,
    name: 'Test Student',
    password,
  }, studentJar);
  studentId = (studentRes.data as any)?.data?.id;
  // Login Admin
  const adminRes = await request('POST', '/auth/login', {
    email: adminEmail,
    password: adminPassword,
  }, adminJar);
  
  if (adminRes.status !== 200) {
    console.error('\n❌ Failed to log in as Admin. Please ensure TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set in your .env file to an existing Admin account.');
    process.exit(1);
  }
  adminId = (adminRes.data as any).data.id;

  const institutesRes = await request('GET', '/institutes', undefined, adminJar);
  const activeInstitute = (institutesRes.data as any)?.data?.find(
    (institute: { isActive?: boolean }) => institute.isActive !== false,
  );
  if (!activeInstitute?.id) {
    console.error('\n❌ Attendance smoke test requires at least one active institute.');
    process.exit(1);
  }
  instituteId = activeInstitute.id;

  // Add barcode via API (using Admin auth)
  const barcodeRes = await request('PATCH', `/users/${studentId}/barcode`, {
    barcode,
  }, adminJar);
  assert('Barcode assigned', barcodeRes.status === 200);

  // Create Course via API
  const courseRes = await request('POST', '/classes', {
    name: `Test Course ${ts}`,
    year: new Date().getFullYear(),
    monthlyFee: 1000,
  }, adminJar);
  assert('Course created', courseRes.status === 201);
  courseId = (courseRes.data as any).data.id;

  // Create Class Session via API
  const sessionRes = await request('POST', `/classes/${courseId}/sessions`, {
    title: 'Test Session',
    date: new Date().toISOString(),
    durationMinutes: 60,
    zoomMeetingId,
  }, adminJar);
  assert('Class Session created', sessionRes.status === 201);
  classSessionId = (sessionRes.data as any).data.id;

  console.log('Setup complete.\n');
}

async function teardown() {
  console.log('\n── Tearing down test data ──');
  console.log('Skipping database teardown as direct DB connections are unavailable.');
  console.log('To clean up, you may want to manually delete:');
  if (classSessionId) console.log(`  - ClassSession: ${classSessionId}`);
  if (courseId) console.log(`  - Course: ${courseId}`);
  if (studentId) console.log(`  - Student: ${studentId}`);
  console.log('Teardown complete.');
}

// ─── Tests ───────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('\n🔵 Attendance Endpoints — Smoke Tests\n');
  await setup();

  try {
    console.log('── Testing Mutations ──');

    // 1. Scan Barcode (Admin)
    const scanRes = await request('POST', '/attendance/scan', {
      barcode,
      classSessionId,
      instituteId,
      source: 'BARCODE',
    }, adminJar);
    assert('POST /scan (admin) -> 200 OK', scanRes.status === 200, scanRes.data);
    assert('POST /scan returns correct source', (scanRes.data as any)?.data?.source === 'BARCODE');

    // Duplicate Scan (Upsert test)
    const scanDupeRes = await request('POST', '/attendance/scan', {
      barcode,
      classSessionId,
      instituteId,
      source: 'BARCODE',
    }, adminJar);
    assert('POST /scan (duplicate) -> 200 OK (upserted)', scanDupeRes.status === 200);

    // 2. Zoom Webhook (No auth)
    const zoomRes = await request('POST', '/attendance/zoom-webhook', {
      event: 'meeting.participant_joined',
      payload: {
        object: {
          id: zoomMeetingId,
          participant: {
            email: studentEmail,
            join_time: new Date().toISOString(),
          },
        },
      },
    }, { values: new Map() });
    assert('POST /zoom-webhook -> 200 OK', zoomRes.status === 200, zoomRes.data);

    // 3. Manual Attendance (Admin)
    const manualRes = await request('POST', '/attendance/manual', {
      userId: studentId,
      classSessionId,
    }, adminJar);
    assert('POST /manual (admin) -> 200 OK', manualRes.status === 200, manualRes.data);
    assert('POST /manual updates source', (manualRes.data as any)?.data?.source === 'MANUAL');

    // Manual Attendance (Student - Should Fail)
    const manualFailRes = await request('POST', '/attendance/manual', {
      userId: studentId,
      classSessionId,
    }, studentJar);
    assert('POST /manual (student) -> 403 Forbidden', manualFailRes.status === 403);

    // 4. Video Attendance (Student)
    const videoRes = await request('POST', '/attendance/video', {
      classSessionId,
    }, studentJar);
    assert('POST /video (student) -> 200 OK', videoRes.status === 200, videoRes.data);

    console.log('\n── Testing Queries ──');

    // 5. Get Session Attendance (Admin)
    const sessionRes = await request('GET', `/attendance/session/${classSessionId}`, undefined, adminJar);
    assert('GET /session/:sessionId (admin) -> 200 OK', sessionRes.status === 200);
    assert('GET /session/:sessionId returns exactly 1 record (upsert success)', (sessionRes.data as any)?.count === 1);

    // Get Session Attendance (Student - Should Fail)
    const sessionFailRes = await request('GET', `/attendance/session/${classSessionId}`, undefined, studentJar);
    assert('GET /session/:sessionId (student) -> 403 Forbidden', sessionFailRes.status === 403);

    // 6. Get Course Attendance (Admin)
    const courseRes = await request('GET', `/attendance/class/${courseId}`, undefined, adminJar);
    assert('GET /class/:classId (admin) -> 200 OK', courseRes.status === 200);
    assert('GET /class/:classId returns 1 record', (courseRes.data as any)?.count === 1);

    // 7. Get Student Attendance (Student - Self)
    const studentQueryRes = await request('GET', `/attendance/student/${studentId}`, undefined, studentJar);
    assert('GET /student/:userId (self) -> 200 OK', studentQueryRes.status === 200);
    assert('GET /student/:userId returns 1 record', (studentQueryRes.data as any)?.count === 1);

    // Get Student Attendance (Student - Other - Should Fail)
    const studentQueryFailRes = await request('GET', `/attendance/student/${adminId}`, undefined, studentJar);
    assert('GET /student/:userId (other) -> 403 Forbidden', studentQueryFailRes.status === 403);

  } finally {
    await teardown();
  }

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
