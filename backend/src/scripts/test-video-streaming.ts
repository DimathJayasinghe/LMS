/**
 * Video Streaming — Full End-to-End Integration Test
 *
 * This script tests the REAL video pipeline:
 *  1. Downloads a small sample video (Big Buck Bunny clip)
 *  2. Uploads it to Bunny Stream via their REST API
 *  3. Waits for Bunny to finish processing
 *  4. Attaches the video to a class session via our LMS API
 *  5. Gets an IP-bound signed stream URL via our LMS API
 *  6. Generates an HTML player page and opens it in the browser
 *  7. Cleans up (deletes from Bunny + LMS DB)
 *
 * Requirements:
 *   - Server running on port 5000
 *   - Valid Bunny credentials in .env (BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME)
 *   - Valid admin credentials in .env (LMS_ADMIN_EMAIL, LMS_ADMIN_PASSWORD)
 *
 * Run: npx tsx src/scripts/test-video-streaming.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const BASE = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = process.env.LMS_ADMIN_EMAIL || 'admin@lms.com';
const ADMIN_PASSWORD = process.env.LMS_ADMIN_PASSWORD || 'adminpassword123';

const BUNNY_API_KEY = process.env.BUNNY_API_KEY || '';
const BUNNY_LIBRARY_ID = process.env.BUNNY_LIBRARY_ID || '';

// Sample video sources — tried in order. Google-hosted first (most reliable).
const SAMPLE_VIDEO_URLS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
];

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
    if (idx > 0) jar.values.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
};

async function apiRequest(
  method: string,
  apiPath: string,
  body: Record<string, unknown> | undefined,
  jar: CookieJar,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${apiPath}`, {
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

function log(icon: string, msg: string, detail?: unknown): void {
  console.log(`  ${icon} ${msg}`);
  if (detail) console.log(`     `, typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
}

// ─── Bunny Stream API Helpers ────────────────────────────────

async function bunnyCreateVideo(title: string): Promise<string> {
  const res = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos`, {
    method: 'POST',
    headers: {
      'AccessKey': BUNNY_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Create Video failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { guid: string };
  return data.guid;
}

async function bunnyUploadVideo(videoId: string, fileBuffer: Buffer): Promise<void> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Upload failed (${res.status}): ${text}`);
  }
}

async function bunnyGetVideoStatus(videoId: string): Promise<{ status: number; encodeProgress: number }> {
  const res = await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      method: 'GET',
      headers: { 'AccessKey': BUNNY_API_KEY, 'Accept': 'application/json' },
    },
  );
  const data = await res.json() as { status: number; encodeProgress: number };
  return data;
}

async function bunnyDeleteVideo(videoId: string): Promise<void> {
  await fetch(
    `https://video.bunnycdn.com/library/${BUNNY_LIBRARY_ID}/videos/${videoId}`,
    {
      method: 'DELETE',
      headers: { 'AccessKey': BUNNY_API_KEY },
    },
  );
}

async function waitForBunnyEncoding(videoId: string, maxWaitMs: number = 120_000): Promise<void> {
  const start = Date.now();
  // Bunny status codes: 0 = created, 1 = uploaded, 2 = processing, 3 = transcoding, 4 = finished
  while (Date.now() - start < maxWaitMs) {
    const { status, encodeProgress } = await bunnyGetVideoStatus(videoId);

    if (status >= 4) {
      log('✅', `Bunny encoding finished (status=${status}, progress=${encodeProgress}%)`);
      return;
    }

    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`\r     ⏳ Encoding: ${encodeProgress}% (status=${status}, ${elapsed}s elapsed)...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Even if not fully finished, we can still try — Bunny allows streaming during encoding
  console.log('');
  log('⚠️', `Encoding not fully complete after ${maxWaitMs / 1000}s — continuing anyway (partial streaming may work)`);
}

// ─── HTML Player Generator ──────────────────────────────────

function generatePlayerHtml(
  streamUrl: string,
  embedUrl: string,
  title: string,
  expiresAt: number,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LMS Video Player — ${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0f0f1a;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #667eea, #764ba2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .player-container {
      width: 100%;
      max-width: 900px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(102, 126, 234, 0.15);
      background: #1a1a2e;
      margin-bottom: 2rem;
    }
    video {
      width: 100%;
      display: block;
      background: #000;
    }
    .info-card {
      width: 100%;
      max-width: 900px;
      background: #1a1a2e;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .info-card h2 { font-size: 1rem; color: #667eea; margin-bottom: 0.75rem; }
    .info-row { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid #2a2a3e; }
    .info-label { color: #888; font-size: 0.85rem; }
    .info-value { font-size: 0.85rem; font-family: monospace; word-break: break-all; max-width: 60%; text-align: right; }
    .url-box { background: #12121e; border-radius: 8px; padding: 0.75rem; margin-top: 0.5rem; font-family: monospace; font-size: 0.75rem; word-break: break-all; color: #aaa; max-height: 80px; overflow-y: auto; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-green { background: #0f5132; color: #75b798; }
    .badge-amber { background: #664d03; color: #ffda6a; }
    #countdown { font-size: 0.85rem; color: #888; }
    .tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .tab {
      padding: 0.5rem 1rem;
      border-radius: 8px;
      background: #2a2a3e;
      color: #aaa;
      cursor: pointer;
      border: none;
      font-size: 0.85rem;
    }
    .tab.active { background: #667eea; color: #fff; }
    .player-section { display: none; }
    .player-section.active { display: block; }
    iframe { width: 100%; aspect-ratio: 16/9; border: 0; border-radius: 0; }
  </style>
</head>
<body>
  <h1>🎬 LMS Video Player</h1>
  <p class="subtitle">IP-Bound Streaming — DRM Token Test</p>

  <div class="tabs">
    <button class="tab active" onclick="switchTab('hls')">HLS.js Player</button>
    <button class="tab" onclick="switchTab('embed')">Bunny Embed</button>
  </div>

  <div class="player-container">
    <div id="hls-section" class="player-section active">
      <video id="video" controls playsinline></video>
    </div>
    <div id="embed-section" class="player-section">
      <iframe src="${embedUrl}" loading="lazy"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowfullscreen></iframe>
    </div>
  </div>

  <div class="info-card">
    <h2>🔐 Token Details</h2>
    <div class="info-row">
      <span class="info-label">Title</span>
      <span class="info-value">${title}</span>
    </div>
    <div class="info-row">
      <span class="info-label">IP Binding</span>
      <span class="info-value"><span class="badge badge-green">ACTIVE</span></span>
    </div>
    <div class="info-row">
      <span class="info-label">Token Expires</span>
      <span class="info-value" id="countdown">Calculating...</span>
    </div>
    <div class="info-row">
      <span class="info-label">Token Format</span>
      <span class="info-value"><span class="badge badge-amber">HS256-HMAC</span></span>
    </div>
    <div style="margin-top: 0.75rem;">
      <span class="info-label">Stream URL (signed)</span>
      <div class="url-box">${streamUrl}</div>
    </div>
  </div>

  <script>
    // ─── HLS.js Player ───────────────────────────────────────
    const video = document.getElementById('video');
    const streamUrl = '${streamUrl}';

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest loaded — ready to play');
      });
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data.type, data.details);
        if (data.response && data.response.code === 403) {
          document.getElementById('countdown').textContent = '⛔ 403 — Token rejected (IP mismatch or expired)';
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    }

    // ─── Countdown ───────────────────────────────────────────
    const expiresAt = ${expiresAt};
    function updateCountdown() {
      const remaining = expiresAt - Math.floor(Date.now() / 1000);
      const el = document.getElementById('countdown');
      if (remaining <= 0) {
        el.textContent = '⛔ EXPIRED';
        el.style.color = '#dc3545';
      } else {
        const hrs = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        const secs = remaining % 60;
        el.textContent = hrs + 'h ' + mins + 'm ' + secs + 's remaining';
      }
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);

    // ─── Tab Switcher ────────────────────────────────────────
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.player-section').forEach(s => s.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tab + '-section').classList.add('active');
    }
  </script>
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🎥 Video Streaming — Full E2E Integration Test\n');

  // ─── Validate credentials ──────────────────────────────────
  if (!BUNNY_API_KEY || !BUNNY_LIBRARY_ID) {
    console.error('❌ BUNNY_API_KEY and BUNNY_LIBRARY_ID must be set in .env');
    process.exit(1);
  }

  const adminJar: CookieJar = { values: new Map() };
  const studentJar: CookieJar = { values: new Map() };

  let bunnyVideoId = '';
  let lmsVideoId = '';
  let courseId = '';
  let sessionId = '';

  try {
    // ── Step 1: Setup LMS data ─────────────────────────────
    console.log('── Step 1: Setting up LMS data ──');

    const loginRes = await apiRequest('POST', '/auth/login', {
      email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
    }, adminJar);
    if (loginRes.status !== 200) {
      console.error('❌ Admin login failed:', loginRes.data);
      process.exit(1);
    }
    log('✅', 'Admin logged in');

    // Register + login student
    const ts = Date.now();
    const studentEmail = `stream.test.${ts}@test.com`;
    await apiRequest('POST', '/auth/register', {
      email: studentEmail, name: 'Stream Tester', password: 'Password123',
    }, studentJar);
    await apiRequest('POST', '/auth/login', {
      email: studentEmail, password: 'Password123',
    }, studentJar);
    log('✅', 'Student registered & logged in');

    // Create course + session
    const courseRes = await apiRequest('POST', '/classes', {
      name: `Streaming Test ${ts}`, year: 2026, monthlyFee: 1000,
    }, adminJar);
    courseId = courseRes.data?.data?.id;
    log('✅', `Course created: ${courseId}`);

    const sessionRes = await apiRequest('POST', `/classes/${courseId}/sessions`, {
      title: 'Live Recording — Test Session', date: new Date().toISOString(), durationMinutes: 60,
    }, adminJar);
    sessionId = sessionRes.data?.data?.id;
    log('✅', `Session created: ${sessionId}`);

    // ── Step 2: Download sample video ──────────────────────
    console.log('\n── Step 2: Acquiring sample video ──');
    let videoBuffer: Buffer | null = null;

    // Try each URL in order with a 15-second timeout per attempt
    for (const url of SAMPLE_VIDEO_URLS) {
      try {
        log('⏳', `Trying ${url}...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15_000);

        const videoRes = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!videoRes.ok) {
          log('⚠️', `HTTP ${videoRes.status} — skipping`);
          continue;
        }

        videoBuffer = Buffer.from(await videoRes.arrayBuffer());
        log('✅', `Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB from ${new URL(url).hostname}`);
        break;
      } catch (err: any) {
        log('⚠️', `Failed (${err.code || err.message}) — trying next source`);
      }
    }

    // Fallback: generate a tiny test video with ffmpeg if available
    if (!videoBuffer) {
      log('⏳', 'All URLs failed. Trying local ffmpeg to generate a test clip...');
      try {
        const { execSync } = await import('child_process');
        const tmpPath = path.join(process.cwd(), 'src', 'scripts', '_test_sample.mp4');
        execSync(
          `ffmpeg -y -f lavfi -i testsrc=duration=5:size=640x360:rate=24 -c:v libx264 -pix_fmt yuv420p "${tmpPath}"`,
          { timeout: 15_000, stdio: 'pipe' },
        );
        videoBuffer = fs.readFileSync(tmpPath);
        fs.unlinkSync(tmpPath);
        log('✅', `Generated ${(videoBuffer.length / 1024).toFixed(0)} KB test clip via ffmpeg`);
      } catch {
        throw new Error(
          'Could not acquire a sample video. All remote URLs timed out and ffmpeg is not available.\n' +
          'Fix: Place any .mp4 file at src/scripts/_test_sample.mp4 and re-run.',
        );
      }
    }

    // ── Step 3: Upload to Bunny Stream ─────────────────────
    console.log('\n── Step 3: Uploading to Bunny Stream ──');
    log('⏳', 'Creating video slot in Bunny...');
    bunnyVideoId = await bunnyCreateVideo('LMS E2E Test — Big Buck Bunny');
    log('✅', `Bunny video created: ${bunnyVideoId}`);

    log('⏳', 'Uploading video binary...');
    await bunnyUploadVideo(bunnyVideoId, videoBuffer);
    log('✅', 'Upload complete');

    // ── Step 4: Wait for Bunny encoding ────────────────────
    console.log('\n── Step 4: Waiting for Bunny to encode ──');
    await waitForBunnyEncoding(bunnyVideoId, 120_000);

    // ── Step 5: Attach video to LMS session ────────────────
    console.log('\n── Step 5: Attaching video via LMS API ──');
    const createRes = await apiRequest('POST', '/videos', {
      title: 'Big Buck Bunny — Test Recording',
      bunnyVideoId,
      classSessionId: sessionId,
      durationSeconds: 60,
    }, adminJar);

    if (createRes.status !== 201) {
      throw new Error(`LMS video create failed: ${JSON.stringify(createRes.data)}`);
    }
    lmsVideoId = createRes.data?.data?.id;
    log('✅', `LMS video record created: ${lmsVideoId}`);

    // ── Step 6: Get stream URL (as student) ────────────────
    console.log('\n── Step 6: Requesting IP-bound stream URL ──');
    const streamRes = await apiRequest('GET', `/videos/${lmsVideoId}/stream`, undefined, studentJar);

    if (streamRes.status !== 200) {
      throw new Error(`Stream URL request failed: ${JSON.stringify(streamRes.data)}`);
    }

    const { streamUrl, embedUrl, expiresAt, title } = streamRes.data.data;
    log('✅', 'Stream URL generated');
    log('🔗', `Stream: ${streamUrl}`);
    log('🔗', `Embed:  ${embedUrl}`);
    log('⏰', `Expires: ${new Date(expiresAt * 1000).toISOString()}`);

    // ── Step 7: Generate HTML player and open ──────────────
    console.log('\n── Step 7: Generating player page ──');
    const playerHtml = generatePlayerHtml(streamUrl, embedUrl, title, expiresAt);

    const playerPath = path.join(process.cwd(), 'src', 'scripts', 'video-player.html');
    fs.writeFileSync(playerPath, playerHtml, 'utf-8');
    log('✅', `Player written to: ${playerPath}`);
    log('📺', 'Open this file in your browser to test playback:');
    console.log(`\n     file://${playerPath}\n`);

    // Try to open automatically
    const { exec } = await import('child_process');
    const openCmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} "${playerPath}"`, (err) => {
      if (err) log('ℹ️', 'Could not auto-open browser. Please open the file manually.');
    });

    // ── Step 8: Verification summary ───────────────────────
    console.log('── Verification Summary ──');
    console.log('');
    console.log('  What to check in the browser:');
    console.log('  ┌─────────────────────────────────────────────────────────┐');
    console.log('  │ 1. Video plays via HLS.js player   → DRM token valid   │');
    console.log('  │ 2. Bunny embed tab also works       → Embed URL valid  │');
    console.log('  │ 3. Token countdown ticks down        → Expiry working  │');
    console.log('  │ 4. Copy the URL to another device   → Should get 403   │');
    console.log('  └─────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('  Press Ctrl+C when done watching. Cleanup will run automatically.');
    console.log('');

    // Wait for user to finish watching
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        console.log('');
        resolve();
      });
      // Auto-cleanup after 5 minutes if user doesn't press Ctrl+C
      setTimeout(() => resolve(), 5 * 60 * 1000);
    });

  } finally {
    // ── Cleanup ──────────────────────────────────────────────
    console.log('\n── Cleanup ──');

    if (lmsVideoId) {
      await apiRequest('DELETE', `/videos/${lmsVideoId}`, undefined, adminJar);
      log('🗑️', `LMS video record deleted: ${lmsVideoId}`);
    }

    if (bunnyVideoId) {
      await bunnyDeleteVideo(bunnyVideoId);
      log('🗑️', `Bunny video deleted: ${bunnyVideoId}`);
    }

    // Clean up the HTML file
    const playerPath = path.join(process.cwd(), 'src', 'scripts', 'video-player.html');
    if (fs.existsSync(playerPath)) {
      fs.unlinkSync(playerPath);
      log('🗑️', 'Player HTML file cleaned up');
    }

    if (sessionId) log('ℹ️', `ClassSession still in DB: ${sessionId}`);
    if (courseId) log('ℹ️', `Course still in DB: ${courseId}`);

    console.log('\n✅ Cleanup complete.\n');
  }
}

main().catch((err) => {
  console.error('\n❌ Test crashed:', err);
  process.exit(1);
});
