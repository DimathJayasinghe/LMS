# 14 — Multi-Tenancy Readiness (ADR)

> **Status:** Direction accepted 2026-11-19. **Nothing in this document is implemented yet.** This ADR
> records the decision, the exact changes it implies, and the order to make them in, so the
> codebase can be aligned before more features are added.
>
> **Supersedes** the "Multi-institute / multi-tenancy — out of scope" row in
> [01-project-overview.md](./01-project-overview.md) §6 and the "single institution only" framing
> elsewhere. The product is still deployed for **one** tuition institute first.

---

## 1. Decision

Build and operate the LMS for **one organization today**, but make the data model, request handling and
provider configuration **tenant-aware now**, so that serving a second tuition institute later is a
configuration and onboarding task rather than a rewrite.

| Question | Decision |
|---|---|
| Tenancy model | **Shared database, shared schema, `organizationId` on every tenant-owned table** |
| Name of a tenant | **`Organization`** (a tuition institute as a customer of the platform) |
| `Institute` | Keeps its current meaning: a **physical branch/center** inside one organization. It is not renamed and is not a tenant |
| Tenant owner role | `SUPER_ADMIN` remains the owner of **one organization**. "Exactly one" becomes "exactly one per organization" |
| Platform operator role | **`PLATFORM_ADMIN` is reserved** for the future SaaS operator. It is not added to the `Role` enum until a platform console is built (see §9) |
| Isolation enforcement | Service-layer tenant scoping through a single Prisma client extension, plus tenant-isolation tests; Postgres row-level security is a later hardening step (§6) |
| When | Pre-launch. There is no production data to migrate, which makes this the cheapest moment |
| Out of scope for this ADR | Billing/plans/quotas, a platform console, per-tenant custom domains beyond routing, schema-per-tenant or database-per-tenant isolation |

### 1.1 Vocabulary (use these terms in code, docs and UI copy)

| Term | Meaning |
|---|---|
| **Organization** | The tenant: one tuition business with its own users, courses, money and branding |
| **Institute** | A physical center/branch of an organization (e.g. Nugegoda, Rathnapura). Already in the schema |
| **Platform** | The operator of the SaaS (future) |
| **Tenant-owned table** | A table whose rows belong to exactly one organization and carry `organizationId` |

Before this ADR the docs used "institution" for both the customer and the building. From now on,
"institution" in new text means the organization; the building is always "institute" or "branch".

## 2. Alternatives considered

| Option | For | Against | Verdict |
|---|---|---|---|
| **Shared schema + `organizationId`** (chosen) | One database, one migration path, cheapest to run on the single VPS the project is designed for; easy cross-tenant reporting for the platform | A missing filter leaks data; per-tenant backup/restore is harder; noisy-neighbour risk | Chosen; mitigated by §6 |
| Database per tenant | Strongest isolation, trivial per-tenant restore, no filter bugs | Operational cost grows linearly (backups, migrations, connection pools); incompatible with the one-small-VPS constraint | Keep as the escape hatch for a tenant with strict isolation needs |
| Schema per tenant | Good isolation inside one database | Prisma has weak support for runtime schema switching; migrations multiply per tenant | Rejected |
| Do nothing until a second customer exists | Zero work now | Retrofitting `organizationId` onto a live database with real data, uniques and webhooks is far costlier and riskier | Rejected |

## 3. Data model changes

### 3.1 New table

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique          // subdomain / URL key, e.g. "acme"
  code      String   @unique          // short prefix for human-facing IDs, e.g. "ACM"
  isActive  Boolean  @default(true)
  timezone  String   @default("Asia/Colombo")
  locale    String   @default("en")   // default UI language: en | si | ta

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

A single row, created by the migration, represents the current institute (the **default
organization**). Its `slug`/`code` are set from configuration during the migration.

### 3.2 Tables that gain `organizationId`

**Rule: if a row can be selected on its own, it carries `organizationId`**, even when its parent
already does. This keeps the scoped client uniform (no join-dependent filtering) and lets row-level
security be added later without schema change. Child tables copy the value from their parent at create
time.

All of these are tenant-owned: `User`, `Permission`, `RefreshToken`, `IdempotencyRecord`, `Subject`,
`SubjectTeacher`, `Course`, `CourseContentProgress`, `CourseModule`, `CourseMaterial`, `Enrollment`,
`Payment`, `PaymentAdjustment`, `PaymentSlip` (planned), `ClassSession`, `Attendance`,
`VideoRecording`, `Exam`, `ExamPaper`, `ExamPaperRevision`, `ExamAudience`, `ExamParticipant`,
`Submission`, `MarkerAssignment`, `MarkerGroup`, `MarkerGroupMember`, `MarkerGroupMembershipEvent`, `MarkerAssignmentAudience`, `MarkerAllocationRevision`,
`AuditLog`, `SmsLog`, `Notification`, `NotificationSetting`, `Institute`, `TimetableSlot`,
`StudentBarcode`.

`Organization` itself and any future platform-level tables are the only non-tenant tables.

**Constraint style.** Prisma cannot express partial unique indexes, so wherever a uniqueness rule applies
only to "active" or "approved" rows the design uses a nullable sentinel column with a plain `@unique`
(see the payment channels spec §3.3). Per-organization uniques in this table are ordinary composite
`@@unique([organizationId, …])` constraints.

Because the child's `organizationId` is copied rather than derived, a bug could create a child in a
different organization than its parent. Prisma cannot express composite foreign keys on `(id,
organizationId)` cleanly, so integrity is enforced two ways: services always set the value from the
parent, and a **tenant integrity check** (a SQL script run in CI against the test database and
available to operators) fails if any child row's `organizationId` differs from its parent's.

### 3.3 Global uniques that must become per-organization

These are the constraints that would make two organizations collide or leak. Verified against
`backend/prisma/schema.prisma` on 2026-11-19.

| Today | Target | Notes |
|---|---|---|
| `User.email @unique` | `@@unique([organizationId, email])` | Login must resolve the organization first (§5). The same person may hold accounts in two organizations |
| `User.nic @unique` | `@@unique([organizationId, nic])` | Same person, two organizations |
| `User.barcode @unique` | `@@unique([organizationId, barcode])` | LMS QR value |
| `User.indexNumber @unique @default(autoincrement())` | **Stays globally unique** | Used as an internal surrogate. The human-facing ID becomes `<Organization.code>-<padded index>`; numbers are therefore **not contiguous within one organization**. A per-organization counter table was rejected because it adds a hot row to every registration |
| `Subject.name @unique` | `@@unique([organizationId, name])` | |
| `Institute.name @unique`, `Institute.code @unique` | `@@unique([organizationId, name])`, `@@unique([organizationId, code])` | |
| `Payment.payhereId @unique` | `@@unique([organizationId, payhereId])` | This is PayHere's `payment_id`, assigned by the provider per merchant; uniqueness across merchants is not guaranteed |
| `IdempotencyRecord.key @unique` | `@@unique([organizationId, userId, key])` | Today a client-supplied key can match another tenant's cached response |
| `NotificationSetting @@unique([type, channel])` | `@@unique([organizationId, type, channel])` | Settings become per organization |
| `Course @@unique([subjectId, name, year])` | Unchanged | `subjectId` is already organization-scoped |
| `RefreshToken.token`, `CourseMaterial.objectKey` | Unchanged | Hash / key-prefixed values are globally unique by construction |

Existing composite uniques whose members are already organization-scoped (for example
`Enrollment(userId, courseId, …)`, `Attendance(userId, classSessionId)`, `StudentBarcode(instituteId,
barcode)`) need no change.

### 3.4 Indexes

Every tenant-owned table gets an index that starts with `organizationId` for its hottest list query
(for example `Payment(organizationId, paymentMonth, status)`), and `organizationId` alone is **not**
enough on large tables. Review the indexing table in [08-database-design.md](./08-database-design.md)
§6 when applying this.

## 4. Per-organization provider configuration

Today every provider credential is a single process-wide environment variable validated in
`backend/src/config/env.ts`. That is correct for one organization and wrong for several.

| Provider | Today (env, global) | Becomes (per organization) |
|---|---|---|
| Bunny Stream | `BUNNY_API_KEY`, `BUNNY_READ_ONLY_API_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_KEY`, `BUNNY_WEBHOOK_SECRET` | One Bunny library per organization (bandwidth and DRM settings are library-level) |
| PayHere | `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, return/cancel/notify URLs | The organization's own merchant, so money settles to the right account |
| Zoom | `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`, `ZOOM_WEBHOOK_SECRET` | Each organization's own Zoom account |
| SMS | `NOTIFY_API_KEY`, `NOTIFY_USER_ID`, `NOTIFY_SENDER_ID` | Sender ID is per organization (it is the brand students see) |
| Bank transfer details | none | Account name, number, bank, branch, shown to students on the slip form |
| Storage | `R2_*`: a private bucket plus a public display-asset bucket (`R2_PUBLIC_BUCKET_NAME`, `R2_PUBLIC_URL`) | Both buckets are shared, with a per-organization key prefix (§7); a dedicated bucket is an optional override |

Provider **drivers** (`STORAGE_DRIVER`, `SMS_DRIVER` and the planned video, payment and live-class drivers in [16-local-development.md](./16-local-development.md)) are a process-wide deployment choice, not per-organization configuration. `OrganizationIntegration` will supply credentials for the real drivers only; a local or mock driver is never selectable per organization and is refused when `NODE_ENV=production`.

### 4.1 Storage design

- A new `OrganizationIntegration` table: `organizationId`, `provider` (enum), `config` (JSON of
  non-secret fields), `secretsEnc` (secrets encrypted at rest with AES-256-GCM using a master key from
  the environment, `INTEGRATION_ENCRYPTION_KEY`), `status`, `lastVerifiedAt`.
- Secrets are never returned by any API, never logged (the HTTP request logger already redacts three header paths; the base logger in `config/logger.ts` has no redaction yet and needs a `redact` list first) and are
  only decrypted inside the provider utility that needs them.
- Provider utilities (`utils/bunny.ts`, `utils/zoom.ts`, `utils/r2.ts`, the PayHere signer and the SMS
  job) stop reading `env` directly and take a resolved `ProviderConfig` for the request's organization.
- **Transition rule:** while only the default organization exists, the resolver falls back to the
  existing environment variables when no `OrganizationIntegration` row is present. This lets the
  refactor land without changing deployment.
- `env.ts` keeps validating platform-level settings (database, Redis, JWT, encryption key). Provider
  variables become optional defaults for the default organization.

### 4.2 Webhooks resolve the organization before verifying

A webhook arrives without a user session, and its signature secret is per organization, so the handler
must identify the organization **first**, from a field the provider supplies, then verify with that
organization's secret:

| Webhook | Organization is identified by | Then verifies with |
|---|---|---|
| `POST /api/videos/bunny-webhook` | Library ID in the payload | That organization's read-only API key (HMAC over the raw body) |
| `POST /api/payments/payhere/notify` | `merchant_id` in the payload, or the `order_id` (our `Payment.id`) | That organization's merchant secret |
| `POST /api/attendance/zoom-webhook` | Zoom account ID in the payload | That account's webhook secret |

The payload field names above were confirmed for Bunny (`VideoLibraryId`) and PayHere (`merchant_id`) in the current schemas; confirm Zoom's account identifier against Zoom's documentation when implementing M4. Rules: an unknown identifier returns 200 with no action (so providers do not retry forever) and logs a
warning; verification failure returns 401; the organization derived from the webhook is the **only**
scope used for the writes that follow. Two organizations must never share a Bunny library or a PayHere
merchant — enforce with unique constraints on the identifier columns.

## 5. Request handling

1. **Resolve the tenant from the host.** `acme.<platform-domain>` or a verified custom domain maps to
   an `Organization`. If no mapping matches, the request uses the **default organization** (configured
   by `DEFAULT_ORGANIZATION_SLUG`), which is what makes the current single-domain deployment keep
   working unchanged.
2. **The access token carries `orgId`.** `auth.middleware.ts` rejects a token whose `orgId` differs
   from the resolved organization (`403 TENANT_MISMATCH`). Cookies stay host-only so one organization's
   cookie is never sent to another's subdomain.
3. **Login is organization-scoped.** Because email becomes unique per organization, the login endpoint
   looks the user up by `(organizationId, email)`.
4. **`AuthenticatedUser` gains `organizationId`.** Every service already receives the actor; it now
   also receives a tenant context derived from it, never from request input. A client-supplied
   `organizationId` is ignored everywhere.
5. **Background jobs carry `organizationId`** in their payload; the worker rebuilds the tenant context
   before touching Prisma.
6. **SSE** events are published to an organization-scoped channel so a result release in one
   organization can never reach another's subscribers.

## 6. Enforcing isolation

The recurring failure mode of shared-schema tenancy is one forgotten `where` clause. The defence is
layered:

1. **One scoped Prisma client.** A Prisma client extension (`$extends` with a `query` hook) injects
   `organizationId` into `where` for reads/updates/deletes and into `data` for creates, for every model
   in a **tenant-model registry**. Services receive this scoped client; the unscoped client is only
   importable by the tenant-resolution code, migrations and platform tooling.
2. **A registry test.** A unit test enumerates every Prisma model and fails unless it is either in the
   tenant-model registry or in an explicit non-tenant allowlist. Adding a table without deciding its
   tenancy breaks CI.
3. **No raw SQL** in services unless it takes the organization as a bound parameter; a lint rule bans
   `$queryRaw` / `$executeRaw` outside an allowlisted directory.
4. **Tenant-isolation tests.** For every service function exposed through a route, a table-driven test
   proves an actor from organization A cannot read, list, update, delete or count organization B's
   rows (including via guessed IDs). This extends the existing actor × target discipline in
   [04-ai-workflow-rules.md](./04-ai-workflow-rules.md) §3.4 with an organization dimension.
5. **Tenant integrity check** (§3.2) in CI.
6. **Row-level security (later).** Once the above is stable, add Postgres RLS policies keyed on a
   per-transaction setting (`set_config('app.organization_id', …, true)`) as defence in depth. It is
   deferred because Prisma's pooled connections require wrapping every request in a transaction to set
   the variable safely, which is a measurable cost on the single VPS and should be benchmarked first.

## 7. Key spaces for stored objects and cache

### 7.1 Cloudflare R2

- All new object keys are prefixed `org/<organizationId>/…` (for example
  `org/<id>/materials/<courseId>/<random>.pdf`). The key builder lives in one function; no service
  concatenates a key by hand.
- **Existing objects keep their current keys.** Keys are stored in the database as full strings, so
  legacy keys continue to work; only newly created objects get the prefix. No object copy is needed.
- The prefix and the key builder apply to **both** buckets: the private bucket (NIC scans, exam PDFs,
  slips, materials) and the public display-asset bucket (avatars, banners).
- Presign and confirm functions assert that the key starts with the caller's organization prefix (or is a
  legacy key attached to a row the caller's organization owns).

### 7.2 Redis

All keys that this application creates are prefixed `org:<organizationId>:`, including rate-limit
counters, idempotency locks (`idempotency.middleware.ts`), the Zoom join throttle
(`live-class.service.ts`), cached Zoom access tokens (`utils/zoom.ts`, which must be cached **per Zoom
account**) and any result caches. The SSE Pub/Sub channel becomes `org:<organizationId>:sse`.
BullMQ queue names stay shared; the organization travels in the job data.

## 8. Roles and authorization

- `SUPER_ADMIN`: owner of one organization; all current "global" meanings become "global **within the
  organization**". `assertCanManagePrivilegedTarget`, `assertCourseAccess` and every other ownership
  check keep working unchanged because they now run on the scoped client.
- `PLATFORM_ADMIN` is a **reserved name**. Platform operators are deliberately **not** tenant users: they
  must not appear in any organization's user list and must not receive tenant data implicitly. When the
  platform console is built, decide between a separate `PlatformAdmin` identity table (preferred) and a
  role on `User` with an explicit, audited "act in organization X" action. Until then no code path grants
  cross-tenant access.
- The role-by-resource matrix in [08-database-design.md](./08-database-design.md) §10 and the
  [gap analysis](../../docs/reports/2026-08-20-full-system-gap-analysis.md) §2 are unchanged; they apply
  inside each organization.

## 9. What stays out of scope (and why it is safe to defer)

| Deferred | Why it does not block readiness |
|---|---|
| Billing, plans, quotas, usage metering | Nothing in the data model depends on them; add `OrganizationPlan` later |
| Platform console and onboarding wizard | Organizations are created by a script/seed until there is a second customer |
| Per-tenant branding and theming | `Organization.name/locale` is enough for now; brand assets can use the same key prefix later |
| Per-tenant custom domains with automatic TLS | Subdomain routing is enough; custom domains need a certificate flow |
| Cross-organization students (one login, many organizations) | Accounts are per organization by design; revisit only if a real need appears |
| Database-per-tenant | Escape hatch described in §2 |

## 10. Capacity honesty

The system is designed and documented for **~1,200 students on one small VPS** (see
[09-cost-and-hosting.md](./09-cost-and-hosting.md)). Multi-tenancy does not change that arithmetic: N
organizations share one box, so total students, concurrent readers and live-class load across all
organizations must be load-tested together before a second customer is onboarded. The earlier idea of
"3,000+ students in one class" is not a current requirement and is not supported by any measurement.

## 11. Migration plan (expand → backfill → contract)

**Status 2026-11-19: M1 is implemented.** Migration `20261119091314_tenant_foundation_organization` creates `Organization`, inserts the default row (`id 00000000-0000-4000-8000-000000000001`, slug `default`, code `DEF`, placeholders to rename before launch) and adds `organizationId` to all 35 models as a nullable column with that id as the **column default**. Existing rows are backfilled by `ADD COLUMN … DEFAULT`, which does not rewrite rows or fire the immutability triggers on the evidence tables, and new rows land in the default organization until M2 sets the value explicitly. The default is dropped in M3 together with `NOT NULL`. Guards: `backend/src/utils/tenant-integrity.test.ts` (every model is tenant-owned, indexed and `Restrict`) and `backend/src/scripts/check-tenant-integrity.ts` (CI step; child organization must equal parent organization, no null organization).

Each step is its own PR, passes the production-Docker gate in the gap analysis §9, and keeps the app
working at every step.

| Step | Change | Acceptance |
|---|---|---|
| **M0** | Merge this ADR and the docs alignment | Owner reviews |
| **M1 Foundation** (**Done 2026-11-19**) | Add `Organization`; insert the default row; add **nullable** `organizationId` + FK + index to every tenant-owned table (including the already-merged Phase E tables); backfill every row to the default organization | Fresh and upgrade migrations at zero drift; integrity check passes |
| **M2 Context** | Add `organizationId` to `AuthenticatedUser`/JWT; tenant-resolution middleware with default-organization fallback; scoped Prisma client + registry test; services switch to the scoped client | Every existing test passes; new registry test passes; cross-tenant isolation tests added for existing services |
| **M3 Constrain** | Make `organizationId` `NOT NULL`; swap the uniques in §3.3; per-organization `IdempotencyRecord`/`NotificationSetting` | Migration refuses to run if any row has a null organization |
| **M4 Providers** | `OrganizationIntegration` + encryption + resolver with env fallback; refactor `bunny`, `zoom`, `payhere`, SMS and R2 utilities; webhook organization resolution (§4.2) | Webhook tests for unknown organization, wrong secret and cross-organization replay |
| **M5 Key spaces** | R2 key builder with prefix; Redis key builder; organization-scoped SSE channel and job payloads | No hand-built keys remain (grep/lint check) |
| **M6 Isolation suite** | Full table-driven tenant-isolation tests; CI integrity check; lint ban on raw SQL | A second seeded organization cannot see the first in any covered route |
| **M7 Login + routing** | Host-based tenant resolution, organization-scoped login, `TENANT_MISMATCH` | Two organizations on two hostnames in the Compose stack |
| **M8 (optional)** | Postgres RLS behind a benchmark | Measured overhead recorded before enabling |

**Rule for work already in flight.** Marker groups, exam papers/audiences and scoped marker allocations are merged on `dev`;
M1 gives them `organizationId` retroactively. Any branch that adds new tables before M1 lands (for example the
physical-result and academic-evidence slice) must be rebased after M1 so that its new tables are created with
`organizationId` from day one. **After M1,
no migration may add a tenant-owned table without `organizationId`**, and the registry test enforces it.

Recommended ordering relative to feature work: land **M1–M3 before the next Phase E slice (physical-result entry and
academic evidence, plan Task 4)**, then HYBRID enrollment and `PaymentSlip` (see the
[payment and enrollment spec](../../docs/superpowers/specs/2026-11-19-payment-channels-and-hybrid-enrollment-design.md)),
then M4–M7 in parallel with the rest of the roadmap.

## 12. Risks

| Risk | Mitigation |
|---|---|
| A query bypasses the scoped client | Registry test, unscoped client import restrictions, raw-SQL lint ban, isolation test suite |
| Child row created in the wrong organization | Copy from parent in services; integrity check in CI |
| Webhook trusted before the organization is known | §4.2: identify, then verify with that organization's secret; unique provider identifiers |
| Provider secret exposure | Encrypted at rest, redacted in logs, never returned by APIs, rotation procedure to be added to [10-maintenance-guide.md](./10-maintenance-guide.md) with M4 |
| Per-tenant restore is hard in a shared schema | Document a tenant export/import tool as a pre-onboarding task; database-per-tenant is the fallback |
| Noisy neighbour on one VPS | Per-organization rate limits (Redis key prefix); load-test combined capacity before onboarding (§10) |
| Refactor churn slows features | Foundation first (M1–M3), then feature work proceeds on the scoped client; M4–M7 run alongside |

## 13. Open decisions for the owner

1. ~~Organization code and slug~~ **Decided 2026-11-19: placeholder.** M1 creates the default
   organization with slug `default` and code `DEF`; both are renamed to the real values before launch
   (no issued student IDs carry the prefix yet, so this is a data update).
2. **Should existing students' printed or issued LMS QR values change?** The barcode today is
   `LMS-<index>`. Moving to `<ORG>-<index>` would invalidate printed cards. Recommended: keep existing
   values as they are (they stay unique per organization) and use the prefix only for newly issued codes.
3. **Is a tenant data export/restore tool required before the second customer?** Recommended: yes.
