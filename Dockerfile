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

# Generate Prisma client with proper MariaDB adapter configuration for build-time
# Set DB_* variables for MariaDB adapter during build
ENV DB_HOST="localhost"
ENV DB_PORT="3306"
ENV DB_USER="builduser"
ENV DB_PASSWORD="buildpass"
ENV DB_NAME="builddb"
ENV NEXT_PHASE="phase-production-build"

# Generate Prisma client
RUN npx prisma generate

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files from builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma schema for runtime migrations (no prisma.config.ts needed for MariaDB)
COPY --from=builder /app/casn.sql ./
COPY --from=builder /app/prisma ./prisma

# Copy Prisma client generated during build
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

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
CMD ["npm", "start"]