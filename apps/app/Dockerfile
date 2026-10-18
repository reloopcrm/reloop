FROM node:24-bookworm-slim AS build
ENV NEXT_DIST_DIR=.next
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile
RUN API_URL=http://api:3001 DATABASE_URL=postgresql://build:build@localhost:5432/build \
 NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
 BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-runtime ALLOWED_SIGN_IN=example.com \
 bun run --cwd apps/app build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app && chown node:node /app
USER node
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/app/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=build --chown=node:node /app/apps/app/public ./apps/app/public
EXPOSE 3000
CMD ["node", "apps/app/server.js"]
