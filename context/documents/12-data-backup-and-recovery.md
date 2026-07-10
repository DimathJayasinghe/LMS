# 12 — Data: Backup, Recovery & Maintenance

> How the LMS stores, backs up, protects, and recovers its data now that PostgreSQL is
> **self-hosted** (no more Neon). This is the operational runbook — keep it accurate.
>
> Companion files: `docker-compose.yml` (the `postgres` + `backup` services), `docker/backup/`
> (the backup engine), `backend/.env` (the `POSTGRES_*` + `BACKUP_*` config).

---

## 1. The architecture change (why self-hosted)

Postgres used to be a managed **Neon** database. We moved it **into the Compose stack on the VPS** because:

- **No cold starts / timeouts.** Neon's free tier auto-suspends compute; the first query after idle
  timed out (`ETIMEDOUT`), which broke auth. A local Postgres is always warm.
- **Full control + zero DB bill.** The data lives on our disk, on our network, with our backup policy.
- **Simplicity.** One `docker compose up` brings up the whole system, DB included.

The trade-off we now **own**: **backups and data durability are our responsibility.** This document is how we
meet that responsibly. The guiding rule is the **3-2-1 backup strategy**: **3** copies of the data, on **2**
different media, with **1** copy off-site.

```
        ONE VPS (Docker Compose)
┌───────────────────────────────────────────────┐
│  backend / worker ──► postgres (pgdata volume) │   ← source of truth
│                          ▲                      │
│                          │ pg_dump (internal)   │
│                       backup  ──►  ./backups/   │   ← copy #1 (host disk)
└───────────────────────────────────────────────┘
                              │ rclone (encrypted)
                              ▼
                       Off-site bucket (B2 / S3)     ← copy #2, off-site
```

- Postgres is **not published** to the host or internet (`docker-compose.yml` has no `ports:` for it) — it is
  reachable only by the app over the private `lms` Docker network.
- Data persists in the named volume **`pgdata`** (`/var/lib/postgresql/data`). It survives container
  restarts/rebuilds; it does **not** survive `docker compose down -v` — which is exactly why we back up.

---

## 2. The backup system at a glance

A dedicated **`backup`** service (image built from `docker/backup/`, same Postgres version as the DB) runs a
scheduler that, on start and every `BACKUP_SCHEDULE_INTERVAL_HOURS`, performs one backup:

1. **Dump** — `pg_dump --format=custom --compress=9` (compressed; supports selective + parallel restore).
2. **Verify** — `pg_restore --list` on the fresh dump, so a truncated/corrupt archive is caught immediately.
3. **Encrypt** *(if a passphrase is set)* — GPG **AES-256** symmetric; the plaintext dump is removed.
4. **Checksum** — a `.sha256` beside each dump (integrity proof at restore time).
5. **Rotate (GFS tiers)** — writes to `daily/`, and on **Sunday** also copies to `weekly/`, on the **1st** also
   to `monthly/`; prunes each tier past its retention window.
6. **Off-site** *(if a remote is set)* — `rclone sync` the whole `backups/` tree to a bucket.
7. **Record + ping** — appends to `backups/last-backup.log` and pings the monitoring URL (dead-man's switch).

Backups land on the host at **`./backups/`** (bind-mounted): `daily/`, `weekly/`, `monthly/`, `last-backup.log`.

---

## 3. Configuration (`backend/.env`)

| Var | Default | Meaning |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lms` / *(generated)* / `lms` | DB credentials — consumed by the `postgres` container **and** the backup scripts. |
| `DATABASE_URL` | `…@postgres:5432/lms` | App connection string (host = the compose service name). |
| `BACKUP_SCHEDULE_INTERVAL_HOURS` | `24` | How often the scheduler dumps. |
| `BACKUP_RETENTION_DAYS` | `7` | Keep every daily dump for N days. |
| `BACKUP_RETENTION_WEEKS` | `5` | Keep Sunday dumps for N weeks. |
| `BACKUP_RETENTION_MONTHS` | `6` | Keep 1st-of-month dumps for N months. |
| `BACKUP_ENCRYPTION_PASSPHRASE` | *(empty)* | Set to enable GPG AES-256 encryption at rest. **Recommended.** |
| `BACKUP_RCLONE_REMOTE` | *(empty)* | rclone destination for off-site copies, e.g. `b2:lms-backups`. **Recommended.** |
| `BACKUP_HEALTHCHECK_URL` | *(empty)* | Dead-man's-switch URL pinged on success (`…/fail` on failure). |

> **Two things to turn on for production** (both empty by default because they need your secrets/accounts):
> **(1)** `BACKUP_ENCRYPTION_PASSPHRASE` — dumps contain PII (NIC, phone). **(2)** `BACKUP_RCLONE_REMOTE` —
> without off-site, a dead VPS = lost data. See §5–6.

---

## 4. Security of the data & the backups

- **Network isolation.** Postgres has no host port; only the app (and the backup sidecar) reach it over the
  private Docker network. If you ever must expose it, require TLS and firewall it to specific IPs.
- **Secrets.** `POSTGRES_PASSWORD` lives only in `backend/.env` on the box (gitignored, `env_file`), never in
  git. Rotate it with `ALTER ROLE lms WITH PASSWORD '…'`, then update `.env` and `docker compose up -d`.
- **Encryption at rest.** With `BACKUP_ENCRYPTION_PASSPHRASE` set, every dump is AES-256 encrypted **before** it
  touches disk or leaves the box — so both `./backups/` and the off-site copy are ciphertext.
  - Store the passphrase in a password manager, **not** on the VPS and **not** in the backups volume. Losing it
    means the encrypted dumps are unrecoverable. (Validated: a wrong passphrase fails the restore.)
- **File permissions.** The backup dir and dumps are created `700`/`600`. Keep `./backups/` on a disk only root
  / the deploy user can read.
- **Transport.** rclone talks to B2/S3 over TLS. The payload is already encrypted regardless.
- **PII minimization.** Backups inherit whatever the DB holds. Don't add extra exports of PII elsewhere.

---

## 5. Off-site setup (rclone → Backblaze B2 or S3)

Off-site is the "1" in 3-2-1 and the difference between "VPS died, restore in 20 min" and "we lost everything."

**Recommended: Backblaze B2** (cheapest object storage, S3-compatible). AWS S3 / Cloudflare R2 / Google Drive
all work too.

1. Create a bucket (e.g. `lms-db-backups`) and an application key scoped to it.
2. Configure an rclone remote **once**, storing its config in the backup volume so the container reuses it:
   ```bash
   docker compose run --rm -v lms_backups:/backups backup rclone config
   # create a remote named e.g. "b2"; when asked, save config to /root/.config/rclone
   ```
   (Or mount a prepared `rclone.conf`. See the rclone docs for the exact provider prompts.)
3. Set `BACKUP_RCLONE_REMOTE=b2:lms-db-backups` in `backend/.env` and `docker compose up -d backup`.
4. Confirm: after the next run, objects appear in the bucket and `docker compose logs backup` shows
   `off-site sync → …`.

> Enable **bucket versioning / object-lock (immutability)** on the off-site bucket so ransomware or a bad actor
> can't delete/overwrite your history. This is the single highest-value durability upgrade.

---

## 6. Routine operation

```bash
# See the backup service working
docker compose logs -f backup
cat backups/last-backup.log

# Force an immediate one-off backup (does not disturb the scheduler)
docker compose run --rm backup backup

# List what you have
ls -lh backups/daily backups/weekly backups/monthly
```

Schedule/retention are env-driven — change them in `backend/.env` and `docker compose up -d backup`.

---

## 7. Restore & disaster recovery

**Restore is only real if you've tested it. Do the drill in §8.**

### 7a. Restore the live database (data loss / bad migration / corruption)
```bash
# newest daily dump → the live DB (interactive confirm: type the DB name)
docker compose run --rm backup restore --latest

# or a specific dump
docker compose run --rm backup restore /backups/daily/lms_YYYYMMDD_HHMMSS.dump.gpg
```
This runs `pg_restore --clean --if-exists` — it drops and recreates the objects in the target DB from the dump.
Stop the app first if you want a clean cutover: `docker compose stop backend worker`, restore, then `up -d`.

### 7b. Restore into a scratch DB (safe verification / partial recovery)
```bash
docker compose run --rm backup restore --latest --dbname lms_verify --create --yes
docker compose exec postgres psql -U lms -d lms_verify -c "\dt"   # inspect
```

### 7c. Full disaster recovery — the VPS is gone
1. Provision a new VPS; install Docker + Compose.
2. `git clone` the repo; restore `backend/.env` (secrets + the backup passphrase from your password manager).
3. Pull the latest off-site backups into `./backups/` (`rclone copy b2:lms-db-backups ./backups`).
4. `docker compose up -d postgres` (starts an empty DB on a fresh `pgdata` volume).
5. `docker compose run --rm backup restore --latest --yes`.
6. `docker compose up -d --build` (bring up the rest).
7. Verify: log in, spot-check counts.

**Recovery objectives with the defaults:** **RPO ≈ 24h** (you can lose up to a day of writes between daily
dumps) and **RTO ≈ minutes** (restore is fast). To shrink RPO, lower `BACKUP_SCHEDULE_INTERVAL_HOURS`, or adopt
PITR (§10).

---

## 8. Verify: the monthly restore drill (do not skip)

A backup you've never restored is a hope, not a backup. **Once a month:**
```bash
docker compose run --rm backup restore --latest --dbname lms_drill --create --yes
docker compose exec postgres psql -U lms -d lms_drill -tAc "SELECT count(*) FROM \"User\";"
docker compose exec postgres psql -U lms -c "DROP DATABASE lms_drill;"
```
Confirm the row counts look sane. Record the date you last drilled. (This exact flow — encrypt → checksum →
decrypt → restore into a scratch DB → verify row count — is validated in CI-style testing.)

---

## 9. Monitoring & alerting

- **Dead-man's switch:** set `BACKUP_HEALTHCHECK_URL` to a free healthchecks.io check. The script pings it on
  success and `…/fail` on failure; if a backup is **missed** (container down, disk full), you get alerted — the
  most important failure mode, since silent backup failure is how people "have backups" and still lose data.
- **Logs:** `docker compose logs backup` and `backups/last-backup.log`.
- **Disk space:** watch the `./backups/` disk; retention caps growth, but monitor anyway
  (`df -h`). A full disk fails both writes and backups.

---

## 10. Ongoing DB maintenance

- **Autovacuum** is on by default and sufficient at this scale; no manual `VACUUM` needed normally.
- **Connection limits:** the app uses a small Prisma pool. If you add instances, keep total connections under
  Postgres `max_connections` (default 100). A pooler (pgbouncer) is only needed if that's ever exceeded.
- **Version upgrades:** to move major versions, dump with the old version, start the new `postgres:NN-alpine`,
  restore. Bump the version in **both** `docker-compose.yml` (db) and `docker/backup/Dockerfile` together so
  `pg_dump`/`pg_restore` stay matched. Always take a fresh backup first.
- **Migrations:** run inside the stack — `docker compose exec backend npx prisma migrate deploy` (prod) — since
  the DB isn't exposed to the host. In dev, the DB is on `localhost:5433`, so host Prisma works directly.

---

## 11. Optional upgrade path — Point-in-Time Recovery (PITR)

Nightly logical dumps (this system) give RPO ≈ 24h and are simple, portable, and encryptable — the right default
for a single institute. If you later need **near-zero RPO** (recover to any second), add **WAL archiving**:
enable `archive_mode`, ship WAL segments off-site continuously (e.g. via `pgBackRest` or `wal-g`), and keep a
base backup. This is more moving parts and cost; adopt it only when losing a day of data becomes unacceptable.
Until then, keep the dumps **and** lower the interval if you want a tighter RPO.

---

## 12. Command cheat-sheet

```bash
# Bring up the stack (DB + app + backups)
docker compose up -d --build

# Backups
docker compose logs -f backup                      # watch
docker compose run --rm backup backup              # one-off now
cat backups/last-backup.log                         # history

# Restore
docker compose run --rm backup restore --latest                         # → live DB (confirms)
docker compose run --rm backup restore --latest --dbname lms_drill --create --yes   # → scratch DB

# Direct DB access (inside the box)
docker compose exec postgres psql -U lms -d lms

# Rotate the DB password: ALTER ROLE, update backend/.env, then:
docker compose up -d postgres backend worker backup
```
