FROM node:22-slim AS deps

WORKDIR /app

# .npmrc carries `legacy-peer-deps=true` — required because @zoom/meetingsdk
# pins peer react@18 against this react@19 project. Without it `npm ci` ERESOLVEs.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder

# Baked into the browser bundle at build time. For the dev-in-compose / ngrok
# setup pass `/api` (same-origin, works on any domain); server-side SSR uses the
# runtime INTERNAL_API_URL instead (see lib/env.ts).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

COPY . .
RUN npm run build

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
