export {};

/**
 * Exams -- End-to-End Smoke Test
 * Run: npx tsx src/scripts/test-exams.ts
 * The server must be running on port 5000 and an admin account must exist.
 */

const DEFAULT_API_BASE = 'http://localhost:5000/api';
const API_BASE = process.env.LMS_API_BASE ?? DEFAULT_API_BASE;
const AUTH_BASE = `${API_BASE}/auth`;
const USERS_BASE = `${API_BASE}/users`;
const CLASSES_BASE = `${API_BASE}/classes`;
const EXAMS_BASE = `${API_BASE}/exams`;

const ADMIN_EMAIL = (process.env.LMS_ADMIN_EMAIL ?? '').toLowerCase();
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD ?? '';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

const PASSWORD_VALID = 'Password1';

type JsonValue = unknown;

interface CookieJar {
  values: Map<string, string>;
}

const adminJar: CookieJar = { values: new Map() };
const studentJar: CookieJar = { values: new Map() };
const markerJar: CookieJar = { values: new Map() };
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

const hasR2Config = (): boolean => {
  const accessKey = process.env.R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_KEY;
  const endpoint = process.env.R2_ENDPOINT ?? '';
  const accountId = process.env.R2_ACCOUNT_ID ?? '';

  return Boolean(accessKey && secretKey && process.env.R2_BUCKET_NAME && (endpoint || accountId));
};

const runTests = async (): Promise<void> => {
  requireEnv();

  const ts = Date.now();
  const className = `Exam Test Class ${ts}`;
  const classYear = 2026;
  const studentEmail = `exam.student.${ts}@lms.test`;
  const markerEmail = `exam.marker.${ts}@lms.test`;

  console.log('\nExams -- Smoke Tests\n');

  await expectStatus('GET /exams without auth', 'GET', EXAMS_BASE, undefined, HTTP_UNAUTHORIZED, anonJar);

  await expectStatus(
    'Admin login',
    'POST',
    `${AUTH_BASE}/login`,
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    HTTP_OK,
    adminJar,
  );

  const createdClass = await expectStatus(
    'Admin create class',
    'POST',
    CLASSES_BASE,
    { name: className, year: classYear, monthlyFee: 2500 },
    HTTP_CREATED,
    adminJar,
  );

  const classId = (createdClass.data as { data?: { id?: string } }).data?.id;
  assert('Class id returned', Boolean(classId), createdClass.data);
  if (!classId) {
    throw new Error('Class id missing from create response.');
  }

  await expectStatus(
    'Register student',
    'POST',
    `${AUTH_BASE}/register`,
    { email: studentEmail, name: 'Exam Student', password: PASSWORD_VALID },
    HTTP_CREATED,
    studentJar,
  );

  const mcqPayload = {
    questions: [
      {
        id: 'q1',
        text: 'Which are prime numbers?',
        order: 1,
        marks: 2,
        options: [
          { id: 'o1', text: '2', isCorrect: true },
          { id: 'o2', text: '4', isCorrect: false },
          { id: 'o3', text: '7', isCorrect: true },
          { id: 'o4', text: '9', isCorrect: false },
        ],
      },
    ],
  };

  const startTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const endTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await expectStatus(
    'Student create exam forbidden',
    'POST',
    EXAMS_BASE,
    {
      title: `Student Exam ${ts}`,
      type: 'MCQ',
      courseId: classId,
      startTime,
      endTime,
      totalMarks: 10,
      mcqPayload,
    },
    HTTP_FORBIDDEN,
    studentJar,
  );

  const createdExam = await expectStatus(
    'Admin create MCQ exam',
    'POST',
    EXAMS_BASE,
    {
      title: `MCQ Exam ${ts}`,
      type: 'MCQ',
      courseId: classId,
      startTime,
      endTime,
      totalMarks: 10,
      mcqPayload,
    },
    HTTP_CREATED,
    adminJar,
  );

  const examId = (createdExam.data as { data?: { id?: string } }).data?.id;
  assert('Exam id returned', Boolean(examId), createdExam.data);
  if (!examId) {
    throw new Error('Exam id missing from create response.');
  }

  const list = await expectStatus(
    'Admin list exams',
    'GET',
    `${EXAMS_BASE}?courseId=${classId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const listData = list.data as { data?: unknown[] };
  assert('List exams data is array', Array.isArray(listData.data), list.data);

  const adminExam = await expectStatus(
    'Admin get exam',
    'GET',
    `${EXAMS_BASE}/${examId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );
  const adminExamPayload = adminExam.data as {
    data?: { mcqPayload?: { questions?: Array<{ options?: Array<{ isCorrect?: boolean }> }> } };
  };
  const adminOption = adminExamPayload.data?.mcqPayload?.questions?.[0]?.options?.[0];
  assert('Admin exam includes isCorrect', typeof adminOption?.isCorrect === 'boolean', adminExam.data);

  const studentExam = await expectStatus(
    'Student get exam',
    'GET',
    `${EXAMS_BASE}/${examId}`,
    undefined,
    HTTP_OK,
    studentJar,
  );
  const studentExamPayload = studentExam.data as {
    data?: { mcqPayload?: { questions?: Array<{ options?: Array<Record<string, unknown>> }> } };
  };
  const studentOption = studentExamPayload.data?.mcqPayload?.questions?.[0]?.options?.[0];
  assert('Student exam strips isCorrect', studentOption ? !('isCorrect' in studentOption) : false, studentExam.data);

  await expectStatus(
    'Admin update exam',
    'PATCH',
    `${EXAMS_BASE}/${examId}`,
    { title: `MCQ Exam Updated ${ts}` },
    HTTP_OK,
    adminJar,
  );

  await expectStatus(
    'Admin delete exam',
    'DELETE',
    `${EXAMS_BASE}/${examId}`,
    undefined,
    HTTP_OK,
    adminJar,
  );

  await expectStatus(
    'Student get deleted exam',
    'GET',
    `${EXAMS_BASE}/${examId}`,
    undefined,
    HTTP_NOT_FOUND,
    studentJar,
  );

  const markerExam = await expectStatus(
    'Admin create written exam',
    'POST',
    EXAMS_BASE,
    {
      title: `Written Exam ${ts}`,
      type: 'WRITTEN',
      courseId: classId,
      startTime,
      endTime,
      totalMarks: 100,
    },
    HTTP_CREATED,
    adminJar,
  );

  const markerExamId = (markerExam.data as { data?: { id?: string } }).data?.id;
  assert('Marker exam id returned', Boolean(markerExamId), markerExam.data);
  if (!markerExamId) {
    throw new Error('Marker exam id missing from create response.');
  }

  const regMarker = await expectStatus(
    'Register marker user',
    'POST',
    `${AUTH_BASE}/register`,
    { email: markerEmail, name: 'Exam Marker', password: PASSWORD_VALID },
    HTTP_CREATED,
    markerJar,
  );

  const markerId = (regMarker.data as { data?: { id?: string } }).data?.id;
  assert('Marker user id returned', Boolean(markerId), regMarker.data);
  if (!markerId) {
    throw new Error('Marker id missing from registration response.');
  }

  await expectStatus(
    'Admin set MARKER role',
    'PATCH',
    `${USERS_BASE}/${markerId}/role`,
    { role: 'MARKER' },
    HTTP_OK,
    adminJar,
  );

  const assign = await expectStatus(
    'Assign marker to exam',
    'POST',
    `${EXAMS_BASE}/${markerExamId}/assign-markers`,
    { markerIds: [markerId] },
    HTTP_OK,
    adminJar,
  );
  const assignData = assign.data as { data?: { assignedCount?: number } };
  assert('Marker assigned count is 1', assignData.data?.assignedCount === 1, assign.data);

  if (hasR2Config()) {
    const upload = await expectStatus(
      'Generate exam upload URL',
      'POST',
      `${EXAMS_BASE}/${markerExamId}/upload-url`,
      {
        fileName: `paper-${ts}.pdf`,
        contentType: 'application/pdf',
        fileSizeBytes: 1024 * 100,
      },
      HTTP_OK,
      adminJar,
    );

    const uploadData = upload.data as { data?: { uploadUrl?: string } };
    assert('Upload URL returned', Boolean(uploadData.data?.uploadUrl), upload.data);
  } else {
    await expectStatus(
      'Generate exam upload URL (missing R2 config)',
      'POST',
      `${EXAMS_BASE}/${markerExamId}/upload-url`,
      {
        fileName: `paper-${ts}.pdf`,
        contentType: 'application/pdf',
        fileSizeBytes: 1024 * 100,
      },
      503,
      adminJar,
    );
  }

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
