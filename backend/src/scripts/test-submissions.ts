/**
 * E2E Test Script — Submissions + Marking (Step 9)
 *
 * Uses Node 22's built-in fetch — NO external dependencies required.
 * Automatically loads .env variables to authenticate as Admin,
 * then dynamically sets up a complete test environment (users, class, exam)
 * before running the submission tests.
 *
 * Tests the full submission lifecycle:
 *   1. Student starts a submission (MCQ auto-grade)
 *   2. Duplicate submissions are rejected
 *   3. Written + hybrid submissions (upload URL + completion)
 *   4. Marker lists submissions (with filters)
 *   5. Marker grades a submission
 *   6. Admin publishes results
 *
 * Usage:
 *   npx tsx src/scripts/test-submissions.ts
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:80';
const ADMIN_EMAIL = process.env.LMS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD;

const TEST_ID = randomUUID().slice(0, 8);
const STUDENT_EMAIL = `student-${TEST_ID}@lms.com`;
const STUDENT_PASSWORD = 'Password123';
const MARKER_EMAIL = `marker-${TEST_ID}@lms.com`;
const MARKER_PASSWORD = 'Password123';

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

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
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

const register = async (email: string, password: string, name: string): Promise<string> => {
  const { status, data } = await jsonRequest('/api/auth/register', {
    method: 'POST',
    // Using a random NIC to prevent collisions, 9 digits + V
    body: { email, password, name, phone: `077${Math.floor(1000000 + Math.random() * 9000000)}`, nic: `${Math.floor(100000000 + Math.random() * 900000000)}V` }
  });

  if (status !== 201) {
    throw new Error(`Register failed for ${email}: ${status} — ${JSON.stringify(data)}`);
  }

  const resData = data.data as Record<string, unknown>;
  return resData.id as string;
};

const pass = (label: string): void => console.log(`  ✅ ${label}`);
const fail = (label: string, detail: string): void => console.error(`  ❌ ${label}: ${detail}`);
const skip = (label: string, detail = ''): void =>
  console.log(`  ⏭️  ${label}${detail ? `: ${detail}` : ''}`);

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

  // ─── 0. Environment Setup ─────────────────────────────
  console.log('\n─── 0. Setting up test environment ───');

  const adminCookies = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  pass('Admin logged in');

  const studentId = await register(STUDENT_EMAIL, STUDENT_PASSWORD, 'Test Student');
  const studentCookies = await login(STUDENT_EMAIL, STUDENT_PASSWORD);
  pass('Test Student created and logged in');

  const markerId = await register(MARKER_EMAIL, MARKER_PASSWORD, 'Test Marker');
  let markerCookies = await login(MARKER_EMAIL, MARKER_PASSWORD);
  pass('Test Marker created and logged in');

  // Elevate marker user role to MARKER
  const roleRes = await jsonRequest(`/api/users/${markerId}/role`, {
    method: 'PATCH',
    body: { role: 'MARKER' },
    cookies: adminCookies
  });
  if (roleRes.status !== 200) throw new Error(`Failed to set marker role: ${JSON.stringify(roleRes.data)}`);
  pass('Marker role elevated');

  markerCookies = await login(MARKER_EMAIL, MARKER_PASSWORD);
  pass('Marker re-logged in with updated role');

  // Create a Course (Class)
  const classRes = await jsonRequest('/api/classes', {
    method: 'POST',
    body: { name: `Submission Test Class ${TEST_ID}`, year: 2026, description: 'E2E Testing', monthlyFee: 1000, isActive: true },
    cookies: adminCookies
  });
  if (classRes.status !== 201) throw new Error(`Failed to create class: ${JSON.stringify(classRes.data)}`);
  const courseId = (classRes.data.data as Record<string, unknown>).id as string;
  pass('Test Class created');

  // Create an Exam
  const startTime = new Date(Date.now() - 60 * 1000); // started 1 minute ago
  const endTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
  const mcqPayload = {
    questions: [
      { id: 'q1', text: 'Q1?', order: 1, marks: 50, options: [{id: 'o1', text: 'A', isCorrect: true}, {id: 'o2', text: 'B', isCorrect: false}] },
      { id: 'q2', text: 'Q2?', order: 2, marks: 50, options: [{id: 'o3', text: 'C', isCorrect: false}, {id: 'o4', text: 'D', isCorrect: true}] }
    ]
  };

  const examRes = await jsonRequest('/api/exams', {
    method: 'POST',
    body: {
      title: `Submission Test Exam ${TEST_ID}`,
      type: 'MCQ',
      courseId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalMarks: 100,
      mcqPayload
    },
    cookies: adminCookies
  });
  if (examRes.status !== 201) throw new Error(`Failed to create exam: ${JSON.stringify(examRes.data)}`);
  const EXAM_ID = (examRes.data.data as Record<string, unknown>).id as string;
  pass(`Test Exam created (ID: ${EXAM_ID})`);

  // Assign Marker to Exam
  const assignRes = await jsonRequest(`/api/exams/${EXAM_ID}/assign-markers`, {
    method: 'POST',
    body: { markerIds: [markerId] },
    cookies: adminCookies
  });
  if (assignRes.status !== 200) throw new Error(`Failed to assign marker: ${JSON.stringify(assignRes.data)}`);
  pass('Marker assigned to Exam');

  // Create a WRITTEN Exam (for upload completion test)
  const writtenExamRes = await jsonRequest('/api/exams', {
    method: 'POST',
    body: {
      title: `Submission Test Written Exam ${TEST_ID}`,
      type: 'WRITTEN',
      courseId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalMarks: 50,
    },
    cookies: adminCookies,
  });
  if (writtenExamRes.status !== 201) {
    throw new Error(`Failed to create written exam: ${JSON.stringify(writtenExamRes.data)}`);
  }
  const WRITTEN_EXAM_ID = (writtenExamRes.data.data as Record<string, unknown>).id as string;
  pass(`Written Exam created (ID: ${WRITTEN_EXAM_ID})`);

  const assignWrittenRes = await jsonRequest(`/api/exams/${WRITTEN_EXAM_ID}/assign-markers`, {
    method: 'POST',
    body: { markerIds: [markerId] },
    cookies: adminCookies,
  });
  if (assignWrittenRes.status !== 200) {
    throw new Error(`Failed to assign marker to written exam: ${JSON.stringify(assignWrittenRes.data)}`);
  }
  pass('Marker assigned to Written Exam');

  // Create a HYBRID Exam (MCQ + upload)
  const hybridExamRes = await jsonRequest('/api/exams', {
    method: 'POST',
    body: {
      title: `Submission Test Hybrid Exam ${TEST_ID}`,
      type: 'HYBRID',
      courseId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalMarks: 100,
      mcqPayload,
    },
    cookies: adminCookies,
  });
  if (hybridExamRes.status !== 201) {
    throw new Error(`Failed to create hybrid exam: ${JSON.stringify(hybridExamRes.data)}`);
  }
  const HYBRID_EXAM_ID = (hybridExamRes.data.data as Record<string, unknown>).id as string;
  pass(`Hybrid Exam created (ID: ${HYBRID_EXAM_ID})`);

  const assignHybridRes = await jsonRequest(`/api/exams/${HYBRID_EXAM_ID}/assign-markers`, {
    method: 'POST',
    body: { markerIds: [markerId] },
    cookies: adminCookies,
  });
  if (assignHybridRes.status !== 200) {
    throw new Error(`Failed to assign marker to hybrid exam: ${JSON.stringify(assignHybridRes.data)}`);
  }
  pass('Marker assigned to Hybrid Exam');

  // ─── Test 1: Student starts MCQ submission ────────────
  console.log('\n─── Test 1: Start MCQ Submission ───');

  // Answering q1 correct (o1) and q2 correct (o4)
  const mcqAnswers = { q1: ['o1'], q2: ['o4'] };
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
      assert(sub.marks === 100, `MCQ auto-graded correctly — marks: ${sub.marks}/100`);
    } else {
      fail('MCQ Auto-grading', 'Marks were null');
    }
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

  // ─── Test 2b: Written submission upload completion ────
  console.log('\n─── Test 2b: Written Submission Upload Completion ───');

  const writtenStartRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: {
      examId: WRITTEN_EXAM_ID,
      fileName: `answers-${TEST_ID}.pdf`,
      contentType: 'application/pdf',
      fileSizeBytes: 1024,
    },
    cookies: studentCookies,
  });

  if (writtenStartRes.status === 201) {
    const writtenData = writtenStartRes.data.data as Record<string, unknown>;
    const writtenSub = writtenData.submission as Record<string, unknown>;
    const uploadUrl = writtenData.uploadUrl as string | undefined;
    const uploadKey = writtenData.uploadKey as string | undefined;

    pass(`Written submission created — ID: ${writtenSub.id}`);
    assert(Boolean(uploadUrl), 'Upload URL returned for written exam');
    assert(Boolean(uploadKey), 'Upload key returned for written exam');

    const completeRes = await jsonRequest(`/api/submissions/${writtenSub.id}/complete`, {
      method: 'PATCH',
      cookies: studentCookies,
    });

    if (completeRes.status === 200) {
      const completeData = completeRes.data.data as Record<string, unknown>;
      assert(completeData.status === 'COMPLETED', 'Written submission completed');
    } else {
      fail('Complete upload', `${completeRes.status} — ${JSON.stringify(completeRes.data)}`);
    }
  } else if (writtenStartRes.status === 503 && writtenStartRes.data.code === 'R2_NOT_CONFIGURED') {
    skip('Start written submission', 'R2 not configured');
  } else {
    fail('Start written submission', `${writtenStartRes.status} — ${JSON.stringify(writtenStartRes.data)}`);
  }

  // ─── Test 2c: Hybrid submission upload flow ──────────
  console.log('\n─── Test 2c: Hybrid Submission Upload Flow ───');

  let hybridSubmissionId: string | null = null;

  const hybridStartRes = await jsonRequest('/api/submissions', {
    method: 'POST',
    body: {
      examId: HYBRID_EXAM_ID,
      answers: mcqAnswers,
      fileName: `hybrid-answers-${TEST_ID}.pdf`,
      contentType: 'application/pdf',
      fileSizeBytes: 2048,
    },
    cookies: studentCookies,
  });

  if (hybridStartRes.status === 201) {
    const hybridData = hybridStartRes.data.data as Record<string, unknown>;
    const hybridSub = hybridData.submission as Record<string, unknown>;
    const uploadUrl = hybridData.uploadUrl as string | undefined;
    const uploadKey = hybridData.uploadKey as string | undefined;

    hybridSubmissionId = hybridSub.id as string;
    pass(`Hybrid submission created — ID: ${hybridSubmissionId}`);
    assert(hybridSub.status === 'UPLOADING', 'Hybrid submission starts in UPLOADING status');
    assert(Boolean(uploadUrl), 'Upload URL returned for hybrid exam');
    assert(Boolean(uploadKey), 'Upload key returned for hybrid exam');
    assert(hybridSub.marks === null, 'Hybrid submission has no marks before grading');
  } else if (hybridStartRes.status === 503 && hybridStartRes.data.code === 'R2_NOT_CONFIGURED') {
    skip('Start hybrid submission', 'R2 not configured');
  } else {
    fail('Start hybrid submission', `${hybridStartRes.status} — ${JSON.stringify(hybridStartRes.data)}`);
  }

  // ─── Test 3: Marker lists submissions ─────────────────
  console.log('\n─── Test 3: Marker Lists Submissions ───');

  const listRes = await jsonRequest(`/api/submissions/exam/${EXAM_ID}`, {
    cookies: markerCookies,
  });

  if (listRes.status === 200) {
    pass(`Listed ${listRes.data.count} submissions`);
    assert(Array.isArray(listRes.data.data), 'Data is an array');
  } else {
    fail('List submissions', `${listRes.status} — ${JSON.stringify(listRes.data)}`);
  }

  // ─── Test 3b: Marker list filters (Hybrid) ────────────
  console.log('\n─── Test 3b: Marker List Filters (Hybrid) ───');

  if (hybridSubmissionId) {
    const uploadingListRes = await jsonRequest(
      `/api/submissions/exam/${HYBRID_EXAM_ID}?status=UPLOADING`,
      { cookies: markerCookies },
    );

    if (uploadingListRes.status === 200) {
      assert(
        (uploadingListRes.data.count as number) === 1,
        'UPLOADING filter returns 1 hybrid submission',
      );
    } else {
      fail('List UPLOADING submissions', `${uploadingListRes.status} — ${JSON.stringify(uploadingListRes.data)}`);
    }

    const hybridCompleteRes = await jsonRequest(`/api/submissions/${hybridSubmissionId}/complete`, {
      method: 'PATCH',
      cookies: studentCookies,
    });

    if (hybridCompleteRes.status === 200) {
      const completeData = hybridCompleteRes.data.data as Record<string, unknown>;
      assert(completeData.status === 'COMPLETED', 'Hybrid submission completed');
    } else {
      fail('Complete hybrid upload', `${hybridCompleteRes.status} — ${JSON.stringify(hybridCompleteRes.data)}`);
    }

    const ungradedListRes = await jsonRequest(
      `/api/submissions/exam/${HYBRID_EXAM_ID}?status=COMPLETED&graded=ungraded`,
      { cookies: markerCookies },
    );

    if (ungradedListRes.status === 200) {
      assert(
        (ungradedListRes.data.count as number) === 1,
        'COMPLETED + ungraded filter returns 1 hybrid submission',
      );
    } else {
      fail('List ungraded submissions', `${ungradedListRes.status} — ${JSON.stringify(ungradedListRes.data)}`);
    }
  } else {
    skip('Skipped', 'hybrid submission not started');
  }

  // ─── Test 4: Marker submits marks ─────────────────────
  console.log('\n─── Test 4: Marker Submits Marks (Overwrite Auto-grade) ───');

  if (listRes.status === 200 && (listRes.data.count as number) > 0) {
    const submissions = listRes.data.data as Array<Record<string, unknown>>;
    const submissionId = submissions[0]!.id as string;
    const idempotencyKey = randomUUID();

    const marksRes = await jsonRequest(`/api/submissions/${submissionId}/marks`, {
      method: 'PATCH',
      body: { marks: 85, feedback: 'Great work but deducted for late arrival.' },
      cookies: markerCookies,
      headers: { 'idempotency-key': idempotencyKey },
    });

    if (marksRes.status === 200) {
      const marksData = marksRes.data.data as Record<string, unknown>;
      pass(`Marks submitted for submission ${submissionId}`);
      assert(marksData.marks === 85, 'Marks saved correctly');
      assert(marksData.feedback === 'Great work but deducted for late arrival.', 'Feedback saved correctly');
    } else {
      fail('Submit marks', `${marksRes.status} — ${JSON.stringify(marksRes.data)}`);
    }

    // Test idempotency — same key should return cached response
    console.log('\n─── Test 4b: Idempotency on Marks ───');
    const dupMarksRes = await jsonRequest(`/api/submissions/${submissionId}/marks`, {
      method: 'PATCH',
      body: { marks: 85, feedback: 'Great work but deducted for late arrival.' },
      cookies: markerCookies,
      headers: { 'idempotency-key': idempotencyKey },
    });
    assert(dupMarksRes.status === 200, 'Duplicate marks request returns cached 200');
  } else {
    console.log('  ⏭️  Skipped — no submissions to grade');
  }

  // ─── Test 4c: Marker list filters (MCQ graded) ────────
  console.log('\n─── Test 4c: Marker List Filters (MCQ Graded) ───');

  const gradedListRes = await jsonRequest(
    `/api/submissions/exam/${EXAM_ID}?status=COMPLETED&graded=graded`,
    { cookies: markerCookies },
  );

  if (gradedListRes.status === 200) {
    assert(
      (gradedListRes.data.count as number) >= 1,
      'COMPLETED + graded filter returns at least 1 MCQ submission',
    );
  } else {
    fail('List graded submissions', `${gradedListRes.status} — ${JSON.stringify(gradedListRes.data)}`);
  }

  // ─── Test 5: Admin publishes results ──────────────────
  console.log('\n─── Test 5: Admin Publishes Results ───');

  // Need to fast-forward the exam to ended state to publish results.
  // We can do this by updating the exam via Admin PATCH /api/exams/:id
  console.log('Admin updating exam endTime to simulate completion...');
  const patchExamRes = await jsonRequest(`/api/exams/${EXAM_ID}`, {
    method: 'PATCH',
    body: { endTime: new Date(Date.now() - 1000).toISOString() }, // Ended 1 second ago
    cookies: adminCookies
  });
  if (patchExamRes.status === 200) {
     pass('Exam ended manually');
  }

  const pubRes = await jsonRequest(`/api/submissions/exam/${EXAM_ID}/publish`, {
    method: 'POST',
    cookies: adminCookies,
  });

  if (pubRes.status === 200) {
    const pubData = pubRes.data.data as Record<string, unknown>;
    pass('Results published');
    pass(`Total: ${pubData.totalSubmissions}, Graded: ${pubData.gradedSubmissions}`);
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

  console.log('\n✨ All tests completed successfully.\n');
};

runTests().catch((err: Error) => {
  console.error('\n💥 Test runner crashed:', err.message);
  process.exit(1);
});
