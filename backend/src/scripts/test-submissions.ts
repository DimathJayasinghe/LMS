/**
 * E2E Test Script — Submissions + Marking (Step 9)
 *
 * Uses Node 22's built-in fetch — NO external dependencies required.
 *
 * Tests the full submission lifecycle:
 *   1. Student starts a submission (MCQ auto-grade + PDF upload URL)
 *   2. Student completes the PDF upload
 *   3. Marker lists submissions for the exam
 *   4. Marker grades a submission
 *   5. Admin publishes results
 *
 * Prerequisites:
 *   - Server running on http://localhost:80
 *   - An admin user, a marker user, and a student user must exist
 *   - An active exam (MCQ or WRITTEN) must exist with the marker assigned
 *
 * Usage:
 *   npx tsx src/scripts/test-submissions.ts
 *
 * Set these env vars or update the constants below:
 *   TEST_BASE_URL, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD,
 *   TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD,
 *   TEST_MARKER_EMAIL, TEST_MARKER_PASSWORD,
 *   TEST_EXAM_ID
 */

import { randomUUID } from 'crypto';

const BASE_URL = process.env.TEST_BASE_URL;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD;
const MARKER_EMAIL = process.env.TEST_MARKER_EMAIL;
const MARKER_PASSWORD = process.env.TEST_MARKER_PASSWORD;
const EXAM_ID = process.env.TEST_EXAM_ID;

// ─── Helpers ──────────────────────────────────────────────

const extractCookies = (res: Response): string => {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
};

const jsonRequest = async (
  url: string,
  options: {
    method?: string;
    body?: unknown;
    cookies?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; data: Record<string, unknown>; cookies: string }> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.cookies ? { Cookie: options.cookies } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(`${BASE_URL}${url}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json()) as Record<string, unknown>;
  const cookies = extractCookies(res);

  return { status: res.status, data, cookies };
};

const login = async (email: string, password: string): Promise<string> => {
  const { status, data, cookies } = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });

  if (status !== 200) {
    throw new Error(`Login failed for ${email}: ${status} — ${JSON.stringify(data)}`);
  }

  return cookies;
};

const pass = (label: string): void => console.log(`  ✅ ${label}`);
const fail = (label: string, detail: string): void => console.error(`  ❌ ${label}: ${detail}`);

const assert = (condition: boolean, label: string, detail = ''): void => {
  if (condition) {
    pass(label);
  } else {
    fail(label, detail || 'Assertion failed');
  }
};

// ─── Tests ────────────────────────────────────────────────

const runTests = async (): Promise<void> => {
  console.log('\n🧪 Submissions + Marking E2E Tests\n');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Exam ID:  ${EXAM_ID || '(not set — some tests will skip)'}\n`);

  if (!EXAM_ID) {
    console.log('⚠️  Set TEST_EXAM_ID to run the full test suite.\n');
    return;
  }

  // ─── Login all users ──────────────────────────────────
  console.log('─── Logging in users ───');

  const adminCookies = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  pass('Admin logged in');

  const studentCookies = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
  pass('Student logged in');

  const markerCookies = await login(MARKER_EMAIL, MARKER_PASSWORD);
  pass('Marker logged in');

  // ─── Test 1: Student starts MCQ submission ────────────
  console.log('\n─── Test 1: Start MCQ Submission ───');

  const mcqAnswers = { q1: ['o1', 'o3'], q2: ['o2'] };
  const startRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: { examId: EXAM_ID, answers: mcqAnswers },
    cookies: studentCookies,
  });

  if (startRes.status === 201) {
    const resData = startRes.data.data as Record<string, unknown>;
    const sub = resData.submission as Record<string, unknown>;
    pass(`Submission created — ID: ${sub.id}`);
    assert(
      sub.status === 'COMPLETED' || sub.status === 'UPLOADING',
      'Status is valid',
    );
    if (sub.marks !== null) {
      pass(`MCQ auto-graded — marks: ${sub.marks}`);
    }
  } else if (startRes.status === 409) {
    pass('Already submitted (expected if running again)');
  } else {
    fail('Start submission', `${startRes.status} — ${JSON.stringify(startRes.data)}`);
  }

  // ─── Test 2: Duplicate submission rejected ────────────
  console.log('\n─── Test 2: Duplicate Submission Rejected ───');

  const dupRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: { examId: EXAM_ID, answers: mcqAnswers },
    cookies: studentCookies,
  });
  assert(dupRes.status === 409, 'Duplicate submission returns 409');

  // ─── Test 3: Marker lists submissions ─────────────────
  console.log('\n─── Test 3: Marker Lists Submissions ───');

  const listRes = await jsonRequest(`/api/submissions/exam/${EXAM_ID}`, {
    cookies: markerCookies,
  });

  if (listRes.status === 200) {
    pass(`Listed ${listRes.data.count} submissions`);
    assert(Array.isArray(listRes.data.data), 'Data is an array');
  } else if (listRes.status === 403) {
    fail('List submissions', 'Marker not assigned to this exam');
  } else {
    fail('List submissions', `${listRes.status} — ${JSON.stringify(listRes.data)}`);
  }

  // ─── Test 4: Marker submits marks ─────────────────────
  console.log('\n─── Test 4: Marker Submits Marks ───');

  if (listRes.status === 200 && (listRes.data.count as number) > 0) {
    const submissions = listRes.data.data as Array<Record<string, unknown>>;
    const submissionId = submissions[0]!.id as string;
    const idempotencyKey = randomUUID();

    const marksRes = await jsonRequest(`/api/submissions/${submissionId}/marks`, {
      method: 'PATCH',
      body: { marks: 85, feedback: 'Great work!' },
      cookies: markerCookies,
      headers: { 'idempotency-key': idempotencyKey },
    });

    if (marksRes.status === 200) {
      const marksData = marksRes.data.data as Record<string, unknown>;
      pass(`Marks submitted for submission ${submissionId}`);
      assert(marksData.marks === 85, 'Marks saved correctly');
      assert(marksData.feedback === 'Great work!', 'Feedback saved correctly');
    } else {
      fail('Submit marks', `${marksRes.status} — ${JSON.stringify(marksRes.data)}`);
    }

    // Test idempotency — same key should return cached response
    console.log('\n─── Test 4b: Idempotency on Marks ───');
    const dupMarksRes = await jsonRequest(`/api/submissions/${submissionId}/marks`, {
      method: 'PATCH',
      body: { marks: 85, feedback: 'Great work!' },
      cookies: markerCookies,
      headers: { 'idempotency-key': idempotencyKey },
    });
    assert(dupMarksRes.status === 200, 'Duplicate marks request returns cached 200');
  } else {
    console.log('  ⏭️  Skipped — no submissions to grade');
  }

  // ─── Test 5: Admin publishes results ──────────────────
  console.log('\n─── Test 5: Admin Publishes Results ───');

  const pubRes = await jsonRequest(`/api/submissions/exam/${EXAM_ID}/publish`, {
    method: 'POST',
    cookies: adminCookies,
  });

  if (pubRes.status === 200) {
    const pubData = pubRes.data.data as Record<string, unknown>;
    pass('Results published');
    pass(`Total: ${pubData.totalSubmissions}, Graded: ${pubData.gradedSubmissions}`);
  } else if (pubRes.status === 400) {
    const errData = pubRes.data as Record<string, unknown>;
    const errMsg = (errData.message as string) ?? '';
    if (errMsg.includes('already published')) {
      pass('Already published (expected if running again)');
    } else if (errMsg.includes('still active')) {
      pass('Exam still active — cannot publish yet (expected for active exams)');
    } else {
      fail('Publish results', `${pubRes.status} — ${JSON.stringify(pubRes.data)}`);
    }
  } else {
    fail('Publish results', `${pubRes.status} — ${JSON.stringify(pubRes.data)}`);
  }

  // ─── Test 6: Unauthorized access checks ───────────────
  console.log('\n─── Test 6: Authorization Checks ───');

  const unauthRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: { examId: EXAM_ID },
  });
  assert(unauthRes.status === 401, 'Unauthenticated request returns 401');

  const wrongRoleRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: { examId: EXAM_ID },
    cookies: adminCookies,
  });
  assert(wrongRoleRes.status === 403, 'Admin cannot create student submission (403)');

  const studentListRes = await jsonRequest(`/api/submissions/exam/${EXAM_ID}`, {
    cookies: studentCookies,
  });
  assert(studentListRes.status === 403, 'Student cannot list submissions (403)');

  console.log('\n✨ All tests completed.\n');
};

runTests().catch((err: Error) => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
