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

## Docker (Neon + Redis)

The Compose setup uses Neon for `DATABASE_URL` and runs Redis in a container. It reads env values from [backend/.env](backend/.env).

From the repo root:

```bash
docker compose up --build
```

If you need to apply migrations to Neon from inside the container:

```bash
docker compose exec backend npx prisma migrate deploy
```
