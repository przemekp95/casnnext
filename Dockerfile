# Use Node.js 20 LTS
FROM node:20-alpine AS base
RUN apk add --no-cache bash

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* ./

# Install dependencies - with cache clearing and force flag to handle integrity issues
RUN npm cache clean --force && npm install --force

COPY . .

# Generate Prisma client (dummy URL for build-time only)
ENV DB_HOST="localhost"
ENV DB_USER="user"
ENV DB_PASSWORD="pass"
ENV DB_NAME="db"

# Try to generate Prisma client, but don't fail if it doesn't work
RUN npx prisma generate || echo "Prisma generate failed, continuing without client generation"

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# If using npm comment out above and use below instead
# RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema for runtime migrations

# Copy Prisma config for v7 migrations
COPY --from=builder --chown=nextjs:nodejs /app/casn.sql ./
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Install prisma CLI for migrations (minimal install)
RUN npm install -g prisma@latest

# Copy entrypoint script
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

# Use entrypoint script to run migrations before starting server
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", ".next/standalone/server.js"]
