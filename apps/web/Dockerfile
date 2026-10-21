# The website image. Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg API_PROXY_URL=http://api:4000 -t streakly-web .
#
# API_PROXY_URL is a BUILD argument: Next writes the /api proxy target into
# the build output, so changing it means rebuilding the image.

# Node runs the Next build and server; bun is copied in only to install
# packages from bun.lock.
FROM node:22-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter streakly --filter @streakly/web
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG API_PROXY_URL=http://api:4000
ENV API_PROXY_URL=$API_PROXY_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && bun run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The standalone output carries only the files the server needs, including
# its own trimmed node_modules.
COPY --from=build /app/apps/web/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
