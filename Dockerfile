# Use Node.js 22 LTS (latest LTS for better performance and security)
FROM node:22-alpine AS base

# Install security updates and required packages
RUN apk add --no-cache bash curl && \
    apk upgrade --no-cache && \
    rm -rf /var/cache/apk/*

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy source code
COPY . .

# Clean npm cache
RUN npm cache clean --force

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application with optimized settings
RUN npm run build

# Production image with security hardening
FROM base AS runner
WORKDIR /app

# Security: Create non-root user and set proper permissions
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -G nodejs -h /app -s /bin/sh nextjs

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Copy package.json for health checks and metadata
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy built application with proper ownership
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Copy production dependencies
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy migrations for production database initialization
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

# Create posts directory with correct permissions before copying
RUN mkdir -p /app/posts && chown -R nextjs:nodejs /app/posts

# Copy MDX posts for runtime loading BEFORE switching to non-root user
COPY --from=builder --chown=nextjs:nodejs /app/posts ./posts

# Security: Switch to non-root user
USER nextjs

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

# Support both npm start and direct Next.js execution
# Default command - can be overridden for npm start compatibility
CMD ["npm", "start"]