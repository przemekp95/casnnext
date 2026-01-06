#!/bin/bash
set -e

echo "🔄 Running Prisma migrations..."
prisma migrate deploy

echo "✅ Migrations completed. Starting server..."
exec node server.js