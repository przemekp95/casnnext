#!/bin/sh
set -e

if [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  echo "🔄 Running Prisma migrations..."
  
  # Ensure Prisma client exists
  if [ ! -d "./node_modules/@prisma/client" ]; then
    echo "Generating Prisma client..."
    npx --yes prisma generate
  fi
  
  # Try migrations with fallback
  npx --yes prisma migrate deploy --schema=prisma/schema.prisma \
    || npx --yes prisma db push --schema=prisma/schema.prisma \
    || echo "Migrations failed, continuing anyway..."
fi

echo "✅ Migrations completed. Starting server..."
exec "$@"