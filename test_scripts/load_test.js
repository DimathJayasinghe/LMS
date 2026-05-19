#!/usr/bin/env node

const http = require('http');
const https = require('https');

const base = process.env.TARGET_BASE || 'http://localhost';
const apiPath = process.env.API_PATH || '/api/health';
const frontPath = process.env.FRONT_PATH || '/';
const durationSec = Number(process.env.DURATION_SECONDS || '30');
const concurrency = Number(process.env.CONCURRENCY || '50');
const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || '5000');
const mode = (process.env.MODE || 'mixed').toLowerCase();
const mixedApiRatio = Number(process.env.MIXED_API_RATIO || '0.7');

const apiUrl = new URL(apiPath, base);
const frontUrl = new URL(frontPath, base);

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: concurrency });

const stats = {
  api: makeStats(),
  front: makeStats(),
};

function makeStats() {
  return {
    total: 0,
    ok: 0,
    errors: 0,
    statusCounts: new Map(),
    latenciesMs: [],
    upstreamCounts: new Map(),
  };
}

function record(targetStats, result) {
  targetStats.total += 1;
  if (result.ok) {
    targetStats.ok += 1;
  } else {
    targetStats.errors += 1;
  }

  if (result.status) {
    const next = (targetStats.statusCounts.get(result.status) || 0) + 1;
    targetStats.statusCounts.set(result.status, next);
  }

  if (typeof result.ms === 'number') {
    targetStats.latenciesMs.push(result.ms);
  }

  if (result.upstream) {
    const next = (targetStats.upstreamCounts.get(result.upstream) || 0) + 1;
    targetStats.upstreamCounts.set(result.upstream, next);
  }
}

function pickTarget() {
  if (mode === 'api') return { name: 'api', url: apiUrl };
  if (mode === 'front') return { name: 'front', url: frontUrl };
  return Math.random() < mixedApiRatio
    ? { name: 'api', url: apiUrl }
    : { name: 'front', url: frontUrl };
}

function requestOnce(url) {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const agent = url.protocol === 'https:' ? httpsAgent : httpAgent;

    const start = process.hrtime.bigint();
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          Accept: '*/*',
          'User-Agent': 'lms-load-test/1.0',
        },
        agent,
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const ms = Number(end - start) / 1e6;
          const status = res.statusCode || 0;
          const upstream = res.headers['x-upstream-addr'];

          resolve({
            ok: status >= 200 && status < 400,
            status,
            ms,
            upstream: Array.isArray(upstream) ? upstream[0] : upstream,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', () => {
      resolve({ ok: false });
    });

    req.end();
  });
}

async function worker(endAt) {
  while (Date.now() < endAt) {
    const target = pickTarget();
    const result = await requestOnce(target.url);
    record(stats[target.name], result);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const idx = Math.max(0, Math.ceil(p * values.length) - 1);
  return values[idx];
}

function summarize(label, targetStats, durationMs) {
  const latencies = targetStats.latenciesMs.slice().sort((a, b) => a - b);
  const rps = durationMs ? (targetStats.total / (durationMs / 1000)).toFixed(2) : '0.00';

  console.log(`\n[${label}]`);
  console.log(`  Requests: ${targetStats.total} | OK: ${targetStats.ok} | Errors: ${targetStats.errors}`);
  console.log(`  RPS: ${rps}`);
  console.log(`  Latency ms (p50/p95/p99): ${percentile(latencies, 0.5).toFixed(1)} / ${percentile(latencies, 0.95).toFixed(1)} / ${percentile(latencies, 0.99).toFixed(1)}`);

  if (targetStats.statusCounts.size) {
    const statuses = Array.from(targetStats.statusCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([code, count]) => `${code}:${count}`)
      .join(' ');
    console.log(`  Statuses: ${statuses}`);
  }

  if (targetStats.upstreamCounts.size) {
    const upstreams = Array.from(targetStats.upstreamCounts.entries())
      .map(([addr, count]) => `${addr}:${count}`)
      .join(' ');
    console.log(`  Upstreams: ${upstreams}`);
  }
}

async function main() {
  console.log('LMS load test');
  console.log(`Base: ${base}`);
  console.log(`Mode: ${mode} | Duration: ${durationSec}s | Concurrency: ${concurrency}`);
  console.log(`API: ${apiUrl.href}`);
  console.log(`Front: ${frontUrl.href}`);

  const endAt = Date.now() + durationSec * 1000;
  const startAt = Date.now();

  const workers = Array.from({ length: concurrency }, () => worker(endAt));
  await Promise.all(workers);

  const durationMs = Date.now() - startAt;
  summarize('API', stats.api, durationMs);
  summarize('Front', stats.front, durationMs);

  if (!stats.api.upstreamCounts.size) {
    console.log('\nNote: X-Upstream-Addr header not found in API responses.');
    console.log('Ensure nginx adds `add_header X-Upstream-Addr $upstream_addr always;` in /api/.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
