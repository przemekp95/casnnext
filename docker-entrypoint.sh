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

  # Run seed script to populate database with initial data
  echo "🌱 Running database seed..."
  # Use node directly since tsx may not be available
  node --loader ts-node/esm prisma/seed.ts || echo "Seed script failed, continuing..."
fi

echo "✅ Migrations and seeding completed. Starting server..."
exec "$@"