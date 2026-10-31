# =============================================================================
# Belay — punto de partida para el sistema de un cliente
# =============================================================================
# Esto lo dejó el panel al crear el repo, y SÓLO si no había un Dockerfile.
# Es un andamio, no un estándar: editalo sin culpa. Las actualizaciones del
# deploy no lo pisan.
#
# Está armado para una app Next.js con `output: 'standalone'`. Si tu sistema es
# otra cosa (una API en Node, Python, lo que sea), reemplazá todo el archivo: lo
# único que el deploy necesita es que la imagen escuche en el puerto que le
# llega por la variable PORT.
# =============================================================================

FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS produccion
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# No correr como root: si alguien se escapa de la app, que salga a un usuario
# sin permisos y no al dueño del container.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S app -G nodejs

# `standalone` trae sólo lo que la app necesita para correr: la imagen queda
# chica, y en este esquema la imagen viaja entera por SSH en cada deploy.
COPY --from=build --chown=app:nodejs /app/.next/standalone ./
COPY --from=build --chown=app:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=app:nodejs /app/public ./public

USER app

# El puerto real lo fija el compose con la variable PORT. 3000 es el default.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
