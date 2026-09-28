FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14 AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    CLUB_DB=/data/club.sqlite
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile && mkdir -p /data && chown bun:bun /data /app
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/server.ts ./server.ts
COPY --from=build --chown=bun:bun /app/src ./src
COPY --from=build --chown=bun:bun /app/analytics.html ./analytics.html
COPY --from=build --chown=bun:bun /app/gallery.html ./gallery.html
USER bun
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:3001/readyz'); if (!r.ok) process.exit(1)"]
CMD ["bun", "server.ts"]
