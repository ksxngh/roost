# syntax=docker/dockerfile:1
#
# Two production images from one build: `web` (the Next.js server) and
# `worker` (the BullMQ background process). Both share the same dependency
# install and Prisma client, so they can never drift apart. Select one with
# `docker build --target web` / `--target worker`. See docs/deployment.md.

FROM node:24-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
# Prisma 7 uses the pg driver adapter — no native query engine — so Alpine
# needs no extra system libraries here.

# --- deps: every dependency, including dev (the build and the worker's tsx
#     runtime both need them) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: generate the Prisma client and compile the Next.js build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` evaluates server modules, which call serverEnv() at import and
# require these. They are throwaway build-time placeholders; the real secrets
# are injected at runtime and never baked into the image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV BETTER_AUTH_SECRET="build-time-placeholder-secret-not-used-at-runtime"
RUN npx prisma generate
RUN npm run build

# --- web: the lean standalone server, run as a non-root user ---
FROM base AS web
ENV PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# The standalone output already contains the traced, pruned node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
# Container-level liveness; orchestrators should also poll /api/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# --- worker: the background job runner, sharing source and deps ---
FROM base AS worker
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY package.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
USER nextjs
# `npm run worker` runs the TypeScript entry through tsx, which resolves the
# `@/` path aliases from tsconfig.json. This image also carries the Prisma
# schema and migrations, so the same image runs `npx prisma migrate deploy`
# as a one-shot release step (see docker-compose.yml and docs/deployment.md).
CMD ["npm", "run", "worker"]
