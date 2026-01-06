#!/bin/sh
set -e

if [ "${SKIP_PRISMA_MIGRATE:-0}" != "1" ]; then
  echo "🔄 Running Prisma migrations..."
  npx --yes prisma migrate deploy --schema=prisma/schema.prisma \
    || npx --yes prisma db push --schema=prisma/schema.prisma
fi

echo "✅ Migrations completed. Starting server..."
exec "$@"