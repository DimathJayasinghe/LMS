# Backend

## Local development

1. Ensure `.env` is set (especially `DATABASE_URL` for PostgreSQL).
2. Install dependencies:

```bash
npm install
```

3. Generate the Prisma client:

```bash
npx prisma generate
```

4. Start the API server:

```bash
npm run dev
```

The server runs on `http://localhost:5000`.

Apply checked-in migrations before local development when the API container is not managing startup:

```bash
npx prisma migrate deploy
```

The production API container performs this step automatically and fails fast on migration errors.
Never use `prisma db push` for persistent environments. For the one-time adoption of an older db-push
database, follow `context/Guides_And_Summeries/database_migration_guide.md` before deploying the new image.

## Docker

The root Compose stack is the supported local and single-VPS deployment topology.

```bash
docker compose up -d --build
```

The root deployment also includes PostgreSQL, Redis, nginx, the worker, and backups. See
`context/documents/09-cost-and-hosting.md` for the VPS runbook.
