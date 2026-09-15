FROM node:24-bookworm-slim
COPY --from=oven/bun:1.3.12 /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app /data/codex && chown node:node /app /data/codex
USER node
WORKDIR /app
COPY --chown=node:node . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build bun install --frozen-lockfile && rm -rf /home/node/.bun/install/cache

USER root
RUN npm install -g @openai/codex@0.154.0 && npm cache clean --force
USER node
RUN cd apps/agent && bun run build && mkdir -p .eve/.workflow-data
ENV NODE_ENV=production PORT=2000 CODEX_HOME=/data/codex
WORKDIR /app/apps/agent
EXPOSE 2000
CMD ["bun", "run", "start"]
