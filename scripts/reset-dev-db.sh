#!/bin/bash

# Reset Dev Database Script
# This script stops containers, removes database volume, and restarts with fresh DB

set -e

echo "🗑️  Stopping and removing existing containers..."
docker-compose -f docker-compose.final.yml down -v

echo "🗑️  Removing MySQL data volume..."
docker volume rm casn_mysql_data 2>/dev/null || true

echo "🏗️  Starting fresh containers with new database..."
docker-compose -f docker-compose.final.yml up -d

echo "⏳ Waiting for MySQL to be ready..."
sleep 30

echo "🔍 Checking database health..."
docker-compose -f docker-compose.final.yml exec -T mysql mysqladmin ping -h localhost -u root -prootpassword123

echo "✅ Dev database reset complete!"
echo ""
echo "🌐 App should be available at: http://localhost:3001"
echo "🔧 If issues persist, check logs with: docker-compose -f docker-compose.final.yml logs app"