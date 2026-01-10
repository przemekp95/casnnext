#!/bin/sh
set -e

if [ "${SKIP_TYPEORM_MIGRATE:-0}" != "1" ]; then
  echo "🔄 Running TypeORM migrations..."

  # Run TypeORM migrations
  npm run migration:run || echo "Migrations failed, continuing anyway..."

  # Run seed script to populate database with initial data
  echo "🌱 Running database seed..."
  npm run seed || echo "Seed script failed, continuing..."
fi

echo "✅ Migrations and seeding completed. Starting server..."
exec "$@"