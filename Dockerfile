FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci

FROM deps AS tools

COPY . .
RUN npm run prisma:generate

FROM tools AS builder

RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist-workers ./dist-workers
COPY --from=builder --chown=nextjs:nodejs /app/scripts/membership-reconcile-worker.mjs ./scripts/membership-reconcile-worker.mjs

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
