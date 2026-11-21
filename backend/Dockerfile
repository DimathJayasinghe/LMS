FROM node:22-slim AS base

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

ARG DATABASE_URL=postgresql://lms:lms@postgres:5432/lms?schema=public
ENV DATABASE_URL=$DATABASE_URL

COPY . .
RUN npx prisma generate
RUN npm run build

FROM builder AS production-dependencies

# Reuse the exact dependency tree compiled above. Pruning after the build avoids
# a second registry download in the runtime stage (important for native packages
# such as Sharp) while still excluding TypeScript/test tooling from production.
RUN npm prune --omit=dev

FROM base AS runner

ENV NODE_ENV=production

COPY package.json package-lock.json ./

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
