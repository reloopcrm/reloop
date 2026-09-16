FROM node:24-bookworm-slim AS build
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app && chown node:node /app
USER node
WORKDIR /app
COPY --chown=node:node . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile --filter agent
RUN cd apps/agent && DATABASE_URL=postgresql://build:build@localhost:5432/build bun run build && rm -rf node_modules/.cache && mkdir -p .eve/.workflow-data
RUN rm -rf node_modules/.bun/prisma@* node_modules/.bun/@prisma+studio-core@* node_modules/.bun/@electric-sql+pglite@*

FROM node:24-bookworm-slim
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app /data/codex && chown node:node /app /data/codex
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/agent ./apps/agent
ENV NODE_ENV=production PORT=2000 CODEX_HOME=/data/codex
WORKDIR /app/apps/agent
EXPOSE 2000
CMD ["bun", "run", "start"]
