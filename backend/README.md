# Backend

## Local development

1. Ensure [backend/.env](backend/.env) is set (especially `DATABASE_URL` for Neon).
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

If this is a fresh database, run migrations once:

```bash
npx prisma migrate deploy
```

## EC2 Deployment (PM2)

This project runs on a single EC2 instance with PM2 managing two processes:

1. Build the API:

```bash
npm install
npm run build
```

2. Start processes with PM2:

```bash
pm2 start dist/index.js --name "lms-api"
pm2 start dist/worker.js --name "lms-worker"
```

Make sure `REDIS_URL` points to Upstash (`rediss://`) and all production env vars are set.

## Docker (Local Only)

Docker Compose is kept for local development only. It starts the API, worker, and a local Redis.

```bash
docker compose -f docker-compose.dev.yml up --build
```
