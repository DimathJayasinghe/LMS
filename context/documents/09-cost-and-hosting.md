
# 09 — Cost & Hosting

> How this system stays **cheap, simple, and easy to host** while remaining secure and reliable. One small VPS runs the whole backend; everything else is a free tier or pay-per-use.
>
> **Topology note (decided 2026-11-20, [19](./19-owner-decisions-2026-11-20.md) §6).** The browser must reach the page and `/api` on **one host** (nginx routing both, or a Vercel rewrite of `/api` to the VPS with `NEXT_PUBLIC_API_URL=/api`), because the auth cookies are host-only and the server-rendered layout must read them. The split variant (frontend at `<domain>`, API at `api.<domain>` with an absolute API URL) does not work with the server-side guard and is unsupported. Deploy check: after logging in on production, `curl -sI -b <cookie jar> https://<page-host>/dashboard` returns 200 (not a redirect to `/auth/login`) and the `access_token` cookie host equals the page host.

---

## 1. Hosting Model at a Glance

```
Page host (one origin with /api)  ONE VPS  (~$5–12/mo)
┌──────────────┐  /api →   ┌──────────────────────────────────────────────┐
│ Next.js app  │ ────────► │ nginx (TLS) → API → worker → Redis           │
│ (all roles)  │           │                       │                      │
└──────────────┘           │        PostgreSQL (pgdata vol) ◄─ backup ────┼──► off-site bucket
                           └──────────────────────────────────────────────┘    (rclone, encrypted)
                                    │ pay-per-use / free tiers
                    ┌───────────────┼───────────────┬───────────────┐
                 Cloudflare R2   Bunny.net       Notify.lk        Zoom / PayHere
                 (files)         (video)         (SMS)            (live / payments)
```

- **One origin.** The page host and `/api` are the same host: the VPS nginx serves both, or the frontend host (Vercel) rewrites `/api/*` to the VPS with `NEXT_PUBLIC_API_URL=/api`.
- **PostgreSQL is self-hosted** inside the Compose stack on a persistent volume (no more Neon). The `backup`
  service takes scheduled, verified, encrypted, off-site dumps — see [12-data-backup-and-recovery.md](./12-data-backup-and-recovery.md).

- **No Kubernetes, no load balancer, no auto-scaling.** At ~1,200 students the result-release spike is read-heavy and absorbed by Redis caching on one box.
- **Deploy is one command:** `git pull && docker compose up -d --build`.

---

## 2. Monthly Cost Estimate

| Item | Provider | Tier | Est. cost/mo |
|------|----------|------|--------------|
| Backend host (nginx + API + worker + Redis) | Hetzner / DigitalOcean VPS | 2 vCPU / 4 GB | **$5–12** |
| Frontend | Vercel | Hobby (free) | **$0** |
| PostgreSQL (self-hosted in Compose) | on the VPS | — | **$0** (runs on the box you already pay for) |
| Off-site DB backups | Backblaze B2 / S3 | pay-per-GB | **~$0–1** (dumps are small + compressed) |
| Redis | self-hosted in Compose | — | **$0** |
| DNS + CDN + DDoS shield | Cloudflare | Free | **$0** |
| Error tracking | Sentry | Free (5k events/mo) | **$0** |
| File storage | Cloudflare R2 | Pay-per-use (zero egress) | **~$0–5** |
| Video streaming | Bunny.net | Pay-per-GB (~$0.01/GB) | **usage-based** |
| SMS | Notify.lk | Lite | **usage-based** |
| Live classes | Zoom | Existing plan | **plan-based** |
| Payments | PayHere | Per-transaction fee | **per-txn** |
| Domain | registrar | — | **~$1/mo amortized** |
| **Fixed baseline** | | | **≈ $6–15 / month** |

**Cost controls built into the design:**
- Bunny **token-authenticated embed URLs** + enrolled/paid gating limit the "leaked link → 5,000 viewers → surprise bandwidth bill" scenario. The token expires after 4 hours (`BUNNY_TOKEN_TTL_SECONDS`) but is **not bound to an IP address**, so a leaked URL can be replayed from anywhere until it expires. Recommended hardening (not yet done): restrict allowed referrers/domains on the Bunny library, shorten the TTL toward the longest lesson length, and set a Bunny bandwidth alert.
- Cloudflare R2 has **zero egress fees** — downloads don't rack up transfer costs.
- SMS is a **BullMQ job**, so a result release sends in the background and can be batched/capped.
- Redis caching keeps DB load low so the single box comfortably absorbs read-heavy spikes (result releases).
- Self-hosting Postgres removes the managed-DB bill and the free-tier cold-start problem entirely — the only
  DB cost is a few cents of off-site backup storage.

### 2.1 When there is more than one organization

The table above is the cost of **one** organization. Decided 2026-11-19: the code becomes multi-tenant ready ([14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md)), but no second organization is planned yet.

- **Shared across organizations:** the VPS, Postgres, Redis, nginx, the R2 bucket (organization-prefixed keys) and Sentry.
- **Per organization, billed to that organization:** its Bunny library and bandwidth, its PayHere merchant and fees, its Zoom licence, its SMS credits and sender ID. Provider credentials live in encrypted per-organization settings, not in the shared `.env`.
- **Capacity is not additive for free.** All organizations share one box, so combined students, concurrent readers and live-class load must be load-tested together before a second customer is onboarded. The supported scale remains ~1,200 students on one VPS until a measurement says otherwise.

---

## 3. What We Deliberately Don't Pay For

| Cut | Instead | Saving |
|-----|---------|--------|
| Kubernetes / managed cluster | One VPS + Docker Compose | Cluster fees + ops time |
| Auto-scaling / load balancer | Single instance + Redis cache | LB + extra instances |
| Upstash (managed Redis) | Self-hosted Redis container | Per-request Redis billing |
| Sanity CMS | Static marketing pages in Next.js | Subscription + integration effort |
| Email provider (Resend) | SMS only for v1 | Monthly email plan |
| Separate admin frontend | One Next.js app, route groups | Second build/deploy pipeline |

---

## 4. Deploy Runbook (VPS)

**One-time setup:**
1. Create a VPS (Ubuntu LTS). Add a non-root sudo user; enable UFW (allow 22, 80, 443).
2. Install Docker + Docker Compose plugin.
3. Point Cloudflare DNS for the single page host (the same host serves `/` and `/api`) → VPS IP (proxied, orange cloud).
4. Clone the repo; create `backend/.env` (never commit it) — set a **strong `POSTGRES_PASSWORD`**, a
   `BACKUP_ENCRYPTION_PASSPHRASE`, and (recommended) `BACKUP_RCLONE_REMOTE` for off-site backups.
5. Issue a Let's Encrypt cert for nginx (certbot or an nginx-companion container); enable auto-renew.
6. `docker compose up -d --build` — this brings up Postgres and backups; the API applies checked-in
   migrations before it starts and fails fast if they cannot be applied.
7. Verify `docker compose logs backend` and `docker compose exec backend npx prisma migrate status`.
8. Configure off-site + run one restore drill (see [12 §5, §8](./12-data-backup-and-recovery.md)).

**Each deploy:**
```bash
cd /srv/lms && git pull && docker compose up -d --build && docker compose ps
```

Databases created by the pre-2026-08-20 `db push` entrypoint require the one-time baseline-adoption
sequence in `context/Guides_And_Summeries/database_migration_guide.md` **before** the new API image starts.

**GitHub Actions (recommended):** on merge to `main`, run build + tests, then SSH to the VPS and run the deploy line above. Zero secrets in the repo — use Actions secrets for the SSH key.

**Services in `docker-compose.yml`:** `postgres` (self-hosted DB on the `pgdata` volume, not exposed to the host), `nginx` (TLS + reverse proxy → API), `backend` (Express API), `worker` (BullMQ), `redis`, and `backup` (scheduled encrypted dumps → `./backups` + off-site). The backend entrypoint runs migrations in-container before serving traffic; the worker never runs them.

---

## 5. Reliability on a Single Box

A single VPS is a single point of failure. Mitigations that keep it cheap:

| Concern | Mitigation |
|---------|-----------|
| Data loss | Postgres runs on a persistent `pgdata` volume, backed by the **`backup` service**: scheduled `pg_dump`, verified, AES-256 encrypted, rotated (daily/weekly/monthly), and copied **off-site**. Monthly restore drills. Full runbook: [12](./12-data-backup-and-recovery.md). |
| Redis loss | Redis holds cache + queue, not source-of-truth data. Enable **AOF/RDB snapshot** to a mounted volume; a restart replays it. Jobs are re-enqueuable. |
| Box dies | Rebuild is scripted: new VPS → clone → `.env` → pull off-site backups → `docker compose up -d postgres` → `restore --latest` → `up -d`. The off-site copy is what makes total-loss recovery possible ([12 §7c](./12-data-backup-and-recovery.md)). |
| Process crash | `restart: unless-stopped` on every container; Sentry alerts on unhandled errors. |
| Traffic spike | Redis caches hot reads (results); rate limiting protects auth + token endpoints. |
| TLS expiry | Let's Encrypt auto-renew (cron/container). |

**When to scale up (not out):** if VPS CPU/RAM (or disk I/O for Postgres) is consistently hot, first **resize the VPS** (bigger box) — it's one click and no code change. Only consider a second API instance behind nginx if a single large box is genuinely saturated; the stateless design (invariant §5.1) makes that a config change, not a rewrite. Keep the DB on fast SSD storage and size RAM so the working set stays cached.

---

## 6. Security Posture (cost-free hardening)

Most security here costs nothing but discipline:

- HTTPS everywhere (Let's Encrypt + Vercel).
- Secrets only in `backend/.env` on the box (Docker `env_file`), never in git.
- Helmet + strict CORS + Redis-backed rate limiting (per-user and per-address buckets; see doc 10).
- JWT in HTTP-only cookies; refresh tokens hashed + rotated with reuse detection.
- Content gated per enrollment + paid month; Bunny token-authenticated embed (+ MediaCage DRM where enabled) + watermark; server-signed Zoom join.
- Cloudflare proxy in front of the VPS = free WAF + DDoS absorption.
- Audit log on every privileged mutation.

See [02-architecture.md §7](./02-architecture.md#7-security-model) for the full model.

---

## Appendix — Local development: whole app in Compose behind one ngrok URL (DEV ONLY)

> For a fully **offline** setup that needs no provider accounts (local S3-compatible storage, logged SMS) use the overlay described in [16-local-development.md](./16-local-development.md). The ngrok tunnel below is only needed when a real provider sandbox must call back into your machine (Bunny, Zoom or PayHere webhooks).

Production serves the page and `/api` from ONE host (nginx routing `/` and `/api`, or a Vercel rewrite of `/api` to the VPS with `NEXT_PUBLIC_API_URL=/api`); see the topology note at the top. For
local development — especially exercising **external webhooks** (Bunny, Zoom, PayHere) that must
reach `localhost` — it's convenient to run *everything* in Compose and expose it on a single public
HTTPS URL. Two **dev-only** `docker-compose.yml` services do this:

- **`frontend`** — builds/serves the Next.js app in the stack. Built with
  `NEXT_PUBLIC_API_URL=/api` (browser calls the API **same-origin**) and runs with
  `INTERNAL_API_URL=http://backend:5000/api` (SSR reaches the backend directly — see
  `frontend/lib/env.ts`). nginx routes `/` → `frontend:3000`, `/api` → `backend:5000`, so the whole
  app is one origin.
- **`ngrok`** — tunnels `nginx:80` to a public URL. Reads `NGROK_AUTHTOKEN` + optional reserved
  `NGROK_DOMAIN` from `backend/.env`.

Result — one domain serves everything:

| Path | Goes to |
|---|---|
| `https://<ngrok-domain>/` | frontend |
| `https://<ngrok-domain>/api/...` | backend (incl. webhooks) |

**Webhook URLs** (unchanged by adding the frontend — they're still under `/api`):
`…/api/videos/bunny-webhook` (Bunny), `…/api/attendance/zoom-webhook` (Zoom),
`…/api/payments/payhere/notify` (PayHere, if you point `PAYHERE_NOTIFY_URL` at it).

**Gotchas:**
- After changing frontend code: `docker compose build frontend && docker compose up -d frontend`
  (it runs a production `next start`, not HMR — for rapid iteration, run `npm run dev` on
  `:3000` separately as before; that path still uses the absolute `NEXT_PUBLIC_API_URL` in
  `frontend/.env`; this works on `localhost` only because cookies ignore ports, and is not a production shape).
- ngrok's **free-tier browser interstitial** shows once per session on first page load — click
  "Visit Site"; a session cookie then suppresses it (API `fetch`es are unaffected after that).

**Production shapes (same-origin only):**
1. Delete the `ngrok` service from `docker-compose.yml` (production has its own public entry point).
2. Either keep the `frontend` service and the `frontend_upstream` block in `nginx/nginx.conf` so one host serves `/` (Next.js) and `/api` (Express), or remove them and restore `location / { return 404; }` when the frontend is deployed elsewhere.
3. If the frontend is deployed to Vercel, add a rewrite of `/api/*` to the VPS and set `NEXT_PUBLIC_API_URL=/api`. A frontend at `<domain>` with an absolute API at `api.<domain>` is not supported (auth cookies are host-only and the server-rendered layout reads them).