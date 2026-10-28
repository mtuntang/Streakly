# The api image. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t streakly-api .
#
# Runtime env: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL,
# BETTER_AUTH_TRUSTED_ORIGINS, RESEND_API_KEY, EMAIL_FROM, CLIENT_IP_HEADER,
# PORT (default 4000).

FROM oven/bun:1.4.2 AS deps
WORKDIR /app
# Every workspace manifest is needed for a frozen install, even the ones
# this image doesn't run.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --omit=peer --filter streakly --filter @streakly/api
COPY prisma ./prisma
# Generates the Prisma client for this image's Linux and OpenSSL.
RUN bunx prisma generate

FROM oven/bun:1.4.2-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json ./
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
USER bun
EXPOSE 4000
# The platform restarts an unhealthy container. Without this the only signal
# is "process alive", so a wedged api keeps taking traffic. start-period
# covers the migrate deploy that runs before the server starts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
# Applies pending migrations, then serves. Migrate deploy only runs
# migrations already committed in prisma/migrations; it never edits schema.
CMD ["sh", "-c", "bunx prisma migrate deploy && exec bun apps/api/src/index.ts"]
