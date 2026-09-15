FROM node:24-bookworm-slim
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app /data/codex && chown node:node /app /data/codex
USER node
WORKDIR /app
COPY --chown=node:node . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile && rm -rf /home/node/.bun/install/cache

ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN API_URL=http://api:3001 DATABASE_URL=postgresql://build:build@localhost:5432/build \
 BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-runtime ALLOWED_SIGN_IN=example.com \
 bun run --cwd apps/app build
WORKDIR /app/apps/app
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
