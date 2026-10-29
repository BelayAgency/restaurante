# syntax=docker/dockerfile:1

FROM node:24.22.1-alpine3.24 AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.22.1-alpine3.24 AS build
WORKDIR /app
ARG ID_BUILD=dev
ENV ID_BUILD=$ID_BUILD NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:scripts

FROM node:24.22.1-alpine3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# .cjs y no .js: el package.json del standalone declara "type": "module".
COPY --from=build --chown=app:app /app/scripts/dist/ ./scripts/
COPY --from=build --chown=app:app /app/db/migraciones ./db/migraciones
USER app
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/salud" >/dev/null || exit 1
CMD ["sh", "-c", "node scripts/migrar.cjs && node scripts/sembrar.cjs && exec node server.js"]
