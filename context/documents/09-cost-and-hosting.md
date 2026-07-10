
# 09 — Cost & Hosting

> How this system stays **cheap, simple, and easy to host** while remaining secure and reliable. One small VPS runs the whole backend; everything else is a free tier or pay-per-use.

---

## 1. Hosting Model at a Glance

```
Vercel (free)                    ONE VPS  (~$5–12/mo)
┌──────────────┐   HTTPS   ┌──────────────────────────────────────────────┐
│ Next.js app  │ ────────► │ nginx (TLS) → API → worker → Redis           │
│ (all roles)  │           │                       │                      │
└──────────────┘           │        PostgreSQL (pgdata vol) ◄─ backup ────┼──► off-site bucket
                           └──────────────────────────────────────────────┘    (rclone, encrypted)
                                    │ pay-per-use / free tiers
                    ┌───────────────┼───────────────┬───────────────┐
                 Cloudflare R2   Bunny.net       Notify.lk        Zoom / PayHere
                 (files)         (video)         (SMS)            (live / payments)
```

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
- Bunny **IP-bound tokens** + enrolled/paid gating stop the "leaked link → 5,000 viewers → surprise bandwidth bill" scenario.
- Cloudflare R2 has **zero egress fees** — downloads don't rack up transfer costs.
- SMS is a **BullMQ job**, so a result release sends in the background and can be batched/capped.
- Redis caching keeps DB load low so the single box comfortably absorbs read-heavy spikes (result releases).
- Self-hosting Postgres removes the managed-DB bill and the free-tier cold-start problem entirely — the only
  DB cost is a few cents of off-site backup storage.

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
3. Point Cloudflare DNS `api.academylms.com` → VPS IP (proxied, orange cloud).
4. Clone the repo; create `backend/.env` (never commit it) — set a **strong `POSTGRES_PASSWORD`**, a
   `BACKUP_ENCRYPTION_PASSPHRASE`, and (recommended) `BACKUP_RCLONE_REMOTE` for off-site backups.
5. Issue a Let's Encrypt cert for nginx (certbot or an nginx-companion container); enable auto-renew.
6. `docker compose up -d --build` — this also brings up Postgres (fresh `pgdata` volume) and the backup service.
7. Apply the schema: `docker compose exec backend npx prisma migrate deploy` (first boot only / after schema changes).
8. Configure off-site + run one restore drill (see [12 §5, §8](./12-data-backup-and-recovery.md)).

**Each deploy:**
```bash
cd /srv/lms && git pull && docker compose up -d --build && docker compose ps
```

**GitHub Actions (recommended):** on merge to `main`, run build + tests, then SSH to the VPS and run the deploy line above. Zero secrets in the repo — use Actions secrets for the SSH key.

**Services in `docker-compose.yml`:** `postgres` (self-hosted DB on the `pgdata` volume, not exposed to the host), `nginx` (TLS + reverse proxy → API), `backend` (Express API), `worker` (BullMQ), `redis`, and `backup` (scheduled encrypted dumps → `./backups` + off-site). Migrations run **in-container** (`docker compose exec backend npx prisma migrate deploy`) since the DB has no host port.

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
- Helmet + strict CORS + Redis-backed rate limiting (auth 10/min/IP).
- JWT in HTTP-only cookies; refresh tokens hashed + rotated with reuse detection.
- Content gated per enrollment + paid month; Bunny IP-bound tokens + watermark; server-signed Zoom join.
- Cloudflare proxy in front of the VPS = free WAF + DDoS absorption.
- Audit log on every privileged mutation.

See [02-architecture.md §7](./02-architecture.md#7-security-model) for the full model.
