# 16 — Local Development and Provider Drivers

> Until the system is hosted, the whole stack runs **offline in Docker**: Postgres, Redis, the API, the
> worker, the frontend, and local stand-ins for the paid external services. This document is the
> contract for those stand-ins ("drivers"). Production behaviour is unchanged: every driver defaults to
> the real provider.

---

## 1. Run it

```bash
cp backend/.env.local.example backend/.env        # local-only secrets; no external accounts
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

- `docker-compose.yml` is the production stack plus the dev-only `frontend` and `ngrok` services (see
  [09-cost-and-hosting.md](./09-cost-and-hosting.md) appendix). `docker-compose.local.yml` is an
  **overlay** that only adds the local services and flips the driver variables. It must never be used on
  the VPS.
- The overlay sets `NODE_ENV=development` for the backend and worker, because the backend refuses local
  drivers when `NODE_ENV=production` (§4).
- Open the app on `http://localhost` (nginx). Browsers upload straight to local storage on
  `http://localhost:9000` with presigned URLs, so use `localhost`, not a LAN IP or an ngrok URL, for
  anything that uploads files.
- The seeded super admin comes from `LMS_ADMIN_EMAIL` / `LMS_ADMIN_PASSWORD` in `backend/.env`.
- `docker-compose.dev.yml` is a separate, older standalone stack with hot reload and Postgres on host
  port 5433; it does not include the local storage service.

---

## 2. Driver matrix

A driver is selected by an environment variable, is implemented **inside the existing utility**
(`utils/r2.ts`, the SMS job, and so on) so services and their tests do not change, and defaults to the
real provider.

| Concern | Real provider (default) | Local driver | Variable | Status |
|---------|-------------------------|--------------|----------|--------|
| Database | Self-hosted Postgres 16 | Same Postgres container | — | Done |
| Redis / queues | Redis container | Same Redis container | — | Done |
| File storage | Cloudflare R2 (`STORAGE_DRIVER=r2`) | RustFS, an S3-compatible server in Docker (`STORAGE_DRIVER=local`) | `STORAGE_DRIVER` | **Done** |
| SMS | Notify.lk (`SMS_DRIVER=notify`) | Writes the message to the worker log; the `SmsLog` row becomes `SENT` (`SMS_DRIVER=log`) | `SMS_DRIVER` | **Done** |
| Video | Bunny Stream (DRM) | Local video service: TUS upload, no DRM | `VIDEO_DRIVER` | Planned |
| Payments | PayHere | PayHere sandbox with a tunnel today; a local mock checkout that posts a correctly signed notify is planned | `PAYHERE_DRIVER` | Planned |
| Live class | Zoom | Mock meeting creation only; joining a meeting needs real Zoom | `ZOOM_DRIVER` | Planned |

"Planned" rows are not implemented. Do not assume the variables exist until the row says Done. The
next two pull requests add them and update this table.

### 2.1 Storage (`STORAGE_DRIVER=local`)

| Aspect | Behaviour |
|--------|-----------|
| Server | `rustfs/rustfs` (pinned tag in `docker-compose.local.yml`), S3 API on port 9000. The MinIO image used to be the usual choice, but the `minio/minio` repository is no longer published on Docker Hub (checked 2026-11-19). |
| Buckets | `lms-private` (`R2_BUCKET_NAME`) and `lms-public` (`R2_PUBLIC_BUCKET_NAME`), created by the one-shot `storage-init` service (`docker/local/storage-init.sh`, idempotent) |
| Access | Private bucket: presigned URLs only. Public bucket: anonymous `GetObject`, so avatars and banners load by URL |
| CORS | `PUT`/`GET`/`HEAD` from `http://localhost`, `:3000` and the `127.0.0.1` equivalents |
| Addressing | Path-style (`http://host:9000/<bucket>/<key>`), region `us-east-1`; R2 keeps virtual-host style and region `auto` |
| Two endpoints | `R2_ENDPOINT=http://storage:9000` is what the backend uses for HEAD/GET/DELETE inside Docker. `R2_PRESIGN_ENDPOINT=http://localhost:9000` is the host the browser calls; presigned URLs are signed for that host because a signature covers the host. Empty `R2_PRESIGN_ENDPOINT` means "same as `R2_ENDPOINT`" (this is also the production behaviour) |
| Public URLs | `R2_PUBLIC_URL=http://localhost:9000/lms-public` |
| Network | Port 9000 is bound to `127.0.0.1` only, because the credentials are committed dev values |
| Credentials | Fixed local-only values in the overlay and `backend/.env.local.example` |

Verified manually on 2026-11-19 against the real backend image in Docker (not an automated test): login, presign an avatar upload, browser-style
`PUT` with an `Origin` header, backend confirm (a `HeadObject` over the in-network endpoint), and
anonymous read of the public object all succeeded.

Course banners render with `next/image` set to `unoptimized`, so remote banner URLs (R2 or local storage) need no `images.remotePatterns` entry.

### 2.2 SMS (`SMS_DRIVER=log`)

The worker logs `SMS (log driver, not delivered)` with the recipient and rendered message and marks the
`SmsLog` row `SENT`. Settings gating, template rendering, queueing and history views all run as usual;
only the HTTP call to Notify.lk is skipped. Recipient and message validation still apply. A `SENT` row
therefore does **not** prove delivery when the log driver is active; it only exists offline.

---

## 3. What local drivers do not give you

- **No DRM.** Bunny's MediaCage and token-authenticated playback cannot run locally. The planned local
  video driver reproduces the *contract* (create video, TUS upload, webhook to READY, signed embed URL)
  so the application flow can be exercised, with no copy protection. Never describe local playback as
  DRM-protected, and verify DRM only against a real Bunny library.
- **No real SMS delivery, no real Zoom meetings, no real card payments.** Those need the provider's
  sandbox and, for webhooks, a public tunnel (the dev-only `ngrok` service).
- **Different performance and limits.** RustFS is not R2: no R2 edge caching, different error text, and
  different multipart behaviour. Anything that depends on those needs a real-provider check before
  launch.

---

## 4. Production guard

A local or mock driver is a deployment-time choice for development. In `backend/src/config/env.ts`, when
`NODE_ENV=production`, the process **exits at boot** if any driver is not the real provider, before it
checks provider credentials (`findLocalDrivers` in `backend/src/config/drivers.ts`). Tests cover the
default values, the accepted local values, the production refusal and the rejection of unknown values.

Relationship to multi-tenancy ([14-multi-tenancy-readiness.md](./14-multi-tenancy-readiness.md) §4):
drivers are **process-wide**, not per organization. `OrganizationIntegration` supplies credentials for
the *real* drivers. A local driver is never selectable per organization and never reaches production.

---

## 5. Adding a driver

1. Add the variable to `env.ts` with the real provider as the default, and extend `findLocalDrivers`.
2. Select the implementation inside the existing utility; keep exported function signatures unchanged.
3. Add unit tests for both drivers and update the production-guard test.
4. Add the service or setting to `docker-compose.local.yml` and `backend/.env.local.example`.
5. Update the matrix in §2 and the README setup notes in the same pull request.
