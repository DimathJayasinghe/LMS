import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { randomItem, randomString, uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || '';
const STUDENT_EMAIL = __ENV.STUDENT_EMAIL || '';
const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || '';
const TEST_BUNNY_VIDEO_ID = __ENV.TEST_BUNNY_VIDEO_ID || '';

const DURATION_SECONDS = Number(__ENV.DURATION_SECONDS || '60');
const STRESS_VUS = Number(__ENV.STRESS_VUS || '2000');
const EDGE_VUS = Number(__ENV.EDGE_VUS || '5');

export const options = {
  scenarios: {
    stress: {
      executor: 'constant-vus',
      vus: STRESS_VUS,
      duration: `${DURATION_SECONDS}s`,
      exec: 'stressFlow',
    },
    edge: {
      executor: 'per-vu-iterations',
      vus: EDGE_VUS,
      iterations: 1,
      exec: 'edgeCases',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<2000'],
  },
};

function jsonHeaders(extra) {
  return Object.assign({ 'Content-Type': 'application/json' }, extra || {});
}

function extractCookies(res) {
  const access = res.cookies && res.cookies.access_token ? res.cookies.access_token[0].value : '';
  const refresh = res.cookies && res.cookies.refresh_token ? res.cookies.refresh_token[0].value : '';
  return { access, refresh };
}

function applyCookies(jar, cookies) {
  if (!cookies) return;
  if (cookies.access) jar.set(BASE_URL, 'access_token', cookies.access);
  if (cookies.refresh) jar.set(BASE_URL, 'refresh_token', cookies.refresh);
}

function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders() },
  );

  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
  });

  if (!ok) {
    fail(`Login failed: ${email}`);
  }

  return { cookies: extractCookies(res), user: safeJson(res).data };
}

function registerStudent() {
  const email = `student_${randomString(8)}@example.com`;
  const password = 'Password1';
  const body = {
    email,
    name: `Student ${randomString(6)}`,
    password,
    phone: '0771234567',
    nic: `2000${Math.floor(Math.random() * 100000000)}`.slice(0, 12),
  };

  const res = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify(body),
    { headers: jsonHeaders() },
  );

  const ok = check(res, {
    'register status 201': (r) => r.status === 201,
  });

  if (!ok) {
    fail('Student registration failed');
  }

  return {
    cookies: extractCookies(res),
    user: safeJson(res).data,
    email,
    password,
  };
}

function safeJson(res) {
  try {
    return res.json();
  } catch (err) {
    return {};
  }
}

function adminRequest(path, method, jar, body) {
  return http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: jsonHeaders(),
    jar,
  });
}

function studentRequest(path, method, jar, body) {
  return http.request(method, `${BASE_URL}${path}`, body ? JSON.stringify(body) : null, {
    headers: jsonHeaders(),
    jar,
  });
}

export function setup() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    fail('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  }

  const admin = login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminJar = http.cookieJar();
  applyCookies(adminJar, admin.cookies);

  let student;
  if (STUDENT_EMAIL && STUDENT_PASSWORD) {
    student = login(STUDENT_EMAIL, STUDENT_PASSWORD);
  } else {
    student = registerStudent();
  }

  const studentJar = http.cookieJar();
  applyCookies(studentJar, student.cookies);

  const classRes = adminRequest('/api/classes', 'POST', adminJar, {
    name: `Stress Class ${randomString(6)}`,
    year: 2026,
    description: 'Load test class',
    monthlyFee: 2500,
    isActive: true,
  });

  check(classRes, { 'create class 201': (r) => r.status === 201 });
  const classData = safeJson(classRes).data || {};

  const sessionRes = adminRequest(`/api/classes/${classData.id}/sessions`, 'POST', adminJar, {
    title: 'Load Test Session',
    description: 'Session for stress testing',
    classType: 'ONLINE',
    date: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    durationMinutes: 60,
    zoomLink: 'https://zoom.us/j/123456789',
    zoomMeetingId: '123456789',
  });

  check(sessionRes, { 'create session 201': (r) => r.status === 201 });
  const sessionData = safeJson(sessionRes).data || {};

  const examRes = adminRequest('/api/exams', 'POST', adminJar, {
    title: `Stress Exam ${randomString(4)}`,
    type: 'MCQ',
    courseId: classData.id,
    startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    totalMarks: 2,
    mcqPayload: {
      questions: [
        {
          id: 'q1',
          text: 'Which are prime numbers?',
          order: 1,
          marks: 2,
          options: [
            { id: 'o1', text: '2', isCorrect: true },
            { id: 'o2', text: '4', isCorrect: false },
          ],
        },
      ],
    },
  });

  check(examRes, { 'create exam 201': (r) => r.status === 201 });
  const examData = safeJson(examRes).data || {};

  if (student.user && student.user.id) {
    const barcodeRes = adminRequest(`/api/users/${student.user.id}/barcode`, 'PATCH', adminJar, {
      barcode: `BC-${randomString(8)}`,
    });
    check(barcodeRes, { 'assign barcode 200': (r) => r.status === 200 });
  }

  let videoId = '';
  if (TEST_BUNNY_VIDEO_ID) {
    const videoRes = adminRequest('/api/videos', 'POST', adminJar, {
      title: 'Load Test Video',
      bunnyVideoId: TEST_BUNNY_VIDEO_ID,
      classSessionId: sessionData.id,
      durationSeconds: 1200,
    });
    if (videoRes.status === 201) {
      videoId = safeJson(videoRes).data.id;
    }
  }

  return {
    adminCookies: admin.cookies,
    studentCookies: student.cookies,
    classId: classData.id,
    sessionId: sessionData.id,
    examId: examData.id,
    studentId: student.user ? student.user.id : '',
    videoId,
  };
}

export function stressFlow(data) {
  const adminJar = http.cookieJar();
  const studentJar = http.cookieJar();
  applyCookies(adminJar, data.adminCookies);
  applyCookies(studentJar, data.studentCookies);

  const action = Math.random();

  if (action < 0.3) {
    const res = studentRequest('/api/classes', 'GET', studentJar);
    check(res, { 'list classes 200': (r) => r.status === 200 });
  } else if (action < 0.45) {
    const res = studentRequest(`/api/classes/${data.classId}/sessions`, 'GET', studentJar);
    check(res, { 'list sessions 200': (r) => r.status === 200 });
  } else if (action < 0.6) {
    const res = studentRequest('/api/exams?status=active', 'GET', studentJar);
    check(res, { 'list exams 200': (r) => r.status === 200 });
  } else if (action < 0.7) {
    const res = studentRequest(`/api/exams/${data.examId}`, 'GET', studentJar);
    check(res, { 'get exam 200': (r) => r.status === 200 });
  } else if (action < 0.8) {
    const res = studentRequest('/api/attendance/video', 'POST', studentJar, {
      classSessionId: data.sessionId,
    });
    check(res, { 'video attendance 200': (r) => r.status === 200 });
  } else if (action < 0.9) {
    const res = adminRequest(`/api/attendance/class/${data.classId}`, 'GET', adminJar);
    check(res, { 'attendance list 200': (r) => r.status === 200 || r.status === 404 });
  } else {
    const res = studentRequest('/api/submissions', 'POST', studentJar, {
      examId: data.examId,
      answers: { q1: ['o1'] },
    });
    check(res, { 'submit exam 201 or 409': (r) => r.status === 201 || r.status === 409 });
  }

  sleep(0.1);
}

export function edgeCases(data) {
  const adminJar = http.cookieJar();
  const studentJar = http.cookieJar();
  applyCookies(adminJar, data.adminCookies);
  applyCookies(studentJar, data.studentCookies);

  const invalidLogin = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: 'invalid@example.com', password: 'badpass' }),
    { headers: jsonHeaders() },
  );
  check(invalidLogin, { 'invalid login 401': (r) => r.status === 401 });

  const badPagination = adminRequest('/api/users?page=abc&limit=200', 'GET', adminJar);
  check(badPagination, { 'invalid pagination 400': (r) => r.status === 400 });

  const forbiddenRole = studentRequest(`/api/users/${data.studentId}/role`, 'PATCH', studentJar, {
    role: 'ADMIN',
  });
  check(forbiddenRole, { 'role change forbidden 403': (r) => r.status === 403 || r.status === 401 });

  const examEarlyPublish = adminRequest(
    `/api/submissions/exam/${data.examId}/publish`,
    'POST',
    adminJar,
    {},
  );
  check(examEarlyPublish, { 'publish while active 400': (r) => r.status === 400 });

  const doubleScan = adminRequest('/api/attendance/scan', 'POST', adminJar, {
    barcode: 'NON_EXISTENT',
    classSessionId: data.sessionId,
  });
  check(doubleScan, { 'invalid barcode 404': (r) => r.status === 404 || r.status === 400 });

  const streamRes = studentRequest('/api/stream', 'GET', studentJar);
  check(streamRes, { 'stream ok 200': (r) => r.status === 200 });

  if (data.videoId) {
    const videoRes = studentRequest(`/api/videos/${data.videoId}/stream`, 'GET', studentJar);
    check(videoRes, { 'video stream 200': (r) => r.status === 200 });
  }
}
