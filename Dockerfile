FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
RUN npx prisma generate && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache git libc6-compat && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser && \
    mkdir -p /app/data/uploads /app/data/novels && \
    chown -R appuser:nodejs /app

COPY --from=builder --chown=appuser:nodejs /app/public ./public
COPY --from=builder --chown=appuser:nodejs /app/.next/standalone ./
COPY --from=builder --chown=appuser:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=appuser:nodejs /app/worker ./worker
COPY --chmod=755 docker-entrypoint.sh /docker-entrypoint.sh

USER appuser
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0" APP_MODE="web"
ENTRYPOINT ["/docker-entrypoint.sh"]
