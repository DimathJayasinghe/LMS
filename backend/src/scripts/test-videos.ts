/**
 * Video Recordings — End-to-End Smoke Test
 *
 * Run: npx tsx src/scripts/test-videos.ts
 * The server must be running on port 5000.
 *
 * Requires a valid Admin account in .env (LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD).
 * Also requires BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME in .env.
 *
 * What is tested:
 *  1. Admin creates a course + class session (setup)
 *  2. Admin attaches a video to the session
 *  3. Admin updates video metadata
 *  4. Any user lists videos for the course (paginated)
 *  5. Any user fetches single video metadata
 *  6. Student gets an IP-bound stream URL
 *  7. Unauthenticated request is rejected (401)
 *  8. Student cannot create a video (403)
 *  9. Admin deletes the video
 * 10. Deleted video is no longer in the list
 */

import * as dotenv from 'dotenv';
dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.LMS_ADMIN_EMAIL || 'admin@lms.com';
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD || 'adminpassword123';

// A real Bunny Stream video ID from your library — tests won't stream, just validate tokens
// Override via env if you have a real video ID to use
const FAKE_BUNNY_VIDEO_ID = process.env.TEST_BUNNY_VIDEO_ID || 'test-bunny-video-id-abc123';

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
      jar.values.set(pair.slice(0, idx), pair.slice(idx + 1));
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
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar.values.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  extractCookies(res.headers, jar);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ─── State ───────────────────────────────────────────────────

const ts = Date.now();
const studentEmail = `video.student.${ts}@test.com`;
let courseId = '';
let sessionId = '';
let videoId = '';

const adminJar: CookieJar = { values: new Map() };
const studentJar: CookieJar = { values: new Map() };
const anonJar: CookieJar = { values: new Map() };

// ─── Setup ───────────────────────────────────────────────────

async function setup(): Promise<void> {
  console.log('── Setting up test data ──');

  // Login Admin
  const adminRes = await request('POST', '/auth/login', {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  }, adminJar);

  if (adminRes.status !== 200) {
    console.error('\n❌ Admin login failed. Check LMS_ADMIN_EMAIL / LMS_ADMIN_PASSWORD in .env.');
    process.exit(1);
  }
  console.log('  Admin logged in.');

  // Register Student
  await request('POST', '/auth/register', {
    email: studentEmail,
    name: 'Video Test Student',
    password: 'Password123',
  }, studentJar);

  const studentLoginRes = await request('POST', '/auth/login', {
    email: studentEmail,
    password: 'Password123',
  }, studentJar);
  assert('Student login after register', studentLoginRes.status === 200);

  // Create Course
  const courseRes = await request('POST', '/classes', {
    name: `Video Test Course ${ts}`,
    year: new Date().getFullYear(),
    monthlyFee: 1500,
  }, adminJar);
  assert('Course created for test', courseRes.status === 201, courseRes.data);
  courseId = (courseRes.data as any)?.data?.id;

  // Create Class Session
  const sessionRes = await request('POST', `/classes/${courseId}/sessions`, {
    title: 'Test Session for Video',
    date: new Date().toISOString(),
    durationMinutes: 90,
  }, adminJar);
  assert('Class session created for test', sessionRes.status === 201, sessionRes.data);
  sessionId = (sessionRes.data as any)?.data?.id;

  console.log('Setup complete.\n');
}

// ─── Teardown ────────────────────────────────────────────────

async function teardown(): Promise<void> {
  console.log('\n── Tearing down test data ──');
  if (videoId) {
    const delRes = await request('DELETE', `/videos/${videoId}`, undefined, adminJar);
    console.log(`  Video ${videoId} deleted:`, delRes.status === 200 ? 'OK' : 'already gone');
  }
  console.log('  Note: Course/Session cleanup requires direct DB access.');
  if (sessionId) console.log(`  - ClassSession: ${sessionId}`);
  if (courseId) console.log(`  - Course: ${courseId}`);
  console.log('Teardown complete.');
}

// ─── Tests ───────────────────────────────────────────────────

async function runTests(): Promise<void> {
  console.log('\n🎥 Video Recordings Endpoints — Smoke Tests\n');
  await setup();

  try {
    console.log('── Mutation Tests ──');

    // ── 1. Unauthenticated create → 401 ──────────────────────
    const unauthRes = await request('POST', '/videos', {
      title: 'Hack video',
      bunnyVideoId: 'fake-id',
      classSessionId: sessionId,
    }, anonJar);
    assert('POST /videos (unauthenticated) → 401', unauthRes.status === 401, unauthRes.data);

    // ── 2. Student create → 403 ───────────────────────────────
    const studentCreateRes = await request('POST', '/videos', {
      title: 'Hack video',
      bunnyVideoId: 'fake-id',
      classSessionId: sessionId,
    }, studentJar);
    assert('POST /videos (student) → 403 Forbidden', studentCreateRes.status === 403, studentCreateRes.data);

    // ── 3. Admin creates video ────────────────────────────────
    const createRes = await request('POST', '/videos', {
      title: 'Week 1 — Introduction to Algebra',
      bunnyVideoId: FAKE_BUNNY_VIDEO_ID,
      classSessionId: sessionId,
      durationSeconds: 5400,
    }, adminJar);
    assert('POST /videos (admin) → 201 Created', createRes.status === 201, createRes.data);
    assert('POST /videos returns video data', (createRes.data as any)?.data?.id !== undefined);
    assert('POST /videos bunnyVideoId stored', (createRes.data as any)?.data?.bunnyVideoId === FAKE_BUNNY_VIDEO_ID);
    assert('POST /videos classSession relation included', (createRes.data as any)?.data?.classSession?.id === sessionId);
    videoId = (createRes.data as any)?.data?.id;

    // ── 4. Invalid session ID → 404 ───────────────────────────
    const badSessionRes = await request('POST', '/videos', {
      title: 'Bad Session Video',
      bunnyVideoId: 'abc',
      classSessionId: '00000000-0000-0000-0000-000000000000',
    }, adminJar);
    assert('POST /videos (invalid sessionId) → 404', badSessionRes.status === 404, badSessionRes.data);

    // ── 5. Admin updates video ────────────────────────────────
    const updateRes = await request('PATCH', `/videos/${videoId}`, {
      title: 'Week 1 — Introduction to Algebra (Updated)',
      durationSeconds: 5500,
    }, adminJar);
    assert('PATCH /videos/:id (admin) → 200', updateRes.status === 200, updateRes.data);
    assert('PATCH /videos/:id title updated', (updateRes.data as any)?.data?.title?.includes('Updated'));
    assert('PATCH /videos/:id duration updated', (updateRes.data as any)?.data?.durationSeconds === 5500);

    // ── 6. Student updates → 403 ─────────────────────────────
    const studentUpdateRes = await request('PATCH', `/videos/${videoId}`, {
      title: 'Hacked',
    }, studentJar);
    assert('PATCH /videos/:id (student) → 403', studentUpdateRes.status === 403);

    console.log('\n── Query Tests ──');

    // ── 7. List videos for class (admin) ─────────────────────
    const listRes = await request('GET', `/videos/class/${courseId}`, undefined, adminJar);
    assert('GET /videos/class/:classId (admin) → 200', listRes.status === 200, listRes.data);
    assert('GET /videos/class/:classId returns count', typeof (listRes.data as any)?.count === 'number');
    assert('GET /videos/class/:classId returns at least 1 video', (listRes.data as any)?.count >= 1);

    // ── 8. List videos for class (student) ───────────────────
    const listStudentRes = await request('GET', `/videos/class/${courseId}`, undefined, studentJar);
    assert('GET /videos/class/:classId (student) → 200', listStudentRes.status === 200, listStudentRes.data);

    // ── 9. List with pagination query params ─────────────────
    const listPageRes = await request('GET', `/videos/class/${courseId}?page=1&limit=5`, undefined, adminJar);
    assert('GET /videos/class/:classId?page=1&limit=5 → 200', listPageRes.status === 200);
    assert('GET /videos/class/:classId pagination limit respected', (listPageRes.data as any)?.limit === 5);

    // ── 10. Get single video metadata ─────────────────────────
    const getRes = await request('GET', `/videos/${videoId}`, undefined, studentJar);
    assert('GET /videos/:id (student) → 200', getRes.status === 200, getRes.data);
    assert('GET /videos/:id returns correct id', (getRes.data as any)?.data?.id === videoId);

    // ── 11. Get non-existent video → 404 ─────────────────────
    const notFoundRes = await request('GET', '/videos/00000000-0000-0000-0000-000000000000', undefined, adminJar);
    assert('GET /videos/:id (not found) → 404', notFoundRes.status === 404);

    console.log('\n── Stream URL Tests ──');

    // ── 12. Student gets stream URL ───────────────────────────
    const streamRes = await request('GET', `/videos/${videoId}/stream`, undefined, studentJar);
    assert('GET /videos/:id/stream (student) → 200', streamRes.status === 200, streamRes.data);
    assert('GET /videos/:id/stream returns streamUrl', typeof (streamRes.data as any)?.data?.streamUrl === 'string');
    assert('GET /videos/:id/stream returns embedUrl', typeof (streamRes.data as any)?.data?.embedUrl === 'string');
    assert('GET /videos/:id/stream returns expiresAt', typeof (streamRes.data as any)?.data?.expiresAt === 'number');

    const streamUrl: string = (streamRes.data as any)?.data?.streamUrl ?? '';
    assert('GET /videos/:id/stream URL contains token param', streamUrl.includes('token='));
    assert('GET /videos/:id/stream URL token uses HS256 prefix', streamUrl.includes('token=HS256-'));
    assert('GET /videos/:id/stream URL contains expires param', streamUrl.includes('expires='));

    // ── 13. Unauthenticated stream URL → 401 ──────────────────
    const unauthStreamRes = await request('GET', `/videos/${videoId}/stream`, undefined, anonJar);
    assert('GET /videos/:id/stream (unauthenticated) → 401', unauthStreamRes.status === 401);

    console.log('\n── Delete Tests ──');

    // ── 14. Student deletes video → 403 ──────────────────────
    const studentDelRes = await request('DELETE', `/videos/${videoId}`, undefined, studentJar);
    assert('DELETE /videos/:id (student) → 403', studentDelRes.status === 403);

    // ── 15. Admin deletes video ───────────────────────────────
    // Capture ID before clearing state — DELETE returns data:null so
    // we cannot recover the ID from deleteRes later.
    const deletedVideoId = videoId;
    const deleteRes = await request('DELETE', `/videos/${videoId}`, undefined, adminJar);
    assert('DELETE /videos/:id (admin) → 200', deleteRes.status === 200, deleteRes.data);

    // Prevent teardown from trying to delete an already-deleted video
    videoId = '';

    // ── 16. Deleted video no longer in list ───────────────────
    const listAfterDeleteRes = await request('GET', `/videos/class/${courseId}`, undefined, adminJar);
    assert('GET /videos/class/:classId after delete → 0 videos', (listAfterDeleteRes.data as any)?.count === 0);

    // ── 17. Deleted video returns 404 ─────────────────────────
    const getDeletedRes = await request('GET', `/videos/${deletedVideoId}`, undefined, adminJar);
    assert('GET /videos/:id (deleted) → 404', getDeletedRes.status === 404);

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
