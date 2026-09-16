FROM node:24-bookworm-slim AS build
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile --production --filter api
RUN bun run --cwd apps/api build

FROM node:24-bookworm-slim
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app /data/codex && chown node:node /app /data/codex
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api ./apps/api
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=12 \
 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "cd /app/packages/db && bun run db:deploy && cd /app/apps/api && exec bun dist/main.js"]
