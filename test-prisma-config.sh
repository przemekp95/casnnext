#!/bin/bash

# Test Prisma v7 Configuration - Validation Script
# This script validates that Prisma v7 with MariaDB adapter is properly configured

set -e

echo "🔍 === PRISMA V7 CONFIGURATION VALIDATION ==="

# Test 1: Check schema.prisma
echo "1. Validating schema.prisma (should have NO url in datasource)..."
if grep -q "url.*=.*env" prisma/schema.prisma; then
    echo "❌ FAIL: schema.prisma still contains url = env(), should be removed for v7"
    exit 1
else
    echo "✅ PASS: schema.prisma has no url in datasource"
fi

# Test 2: Check prisma.config.ts
echo "2. Validating prisma.config.ts (should have NO url field for Prisma v7 adapter)..."
if ! grep -q "url" prisma.config.ts; then
    echo "✅ PASS: prisma.config.ts has no url field"
else
    echo "❌ FAIL: prisma.config.ts contains url field"
    exit 1
fi
echo "3. Validating lib/prisma.ts (should import MariaDB adapter)..."
if grep -q "PrismaMariaDb.*from.*@prisma/adapter-mariadb" lib/prisma.ts; then
    echo "✅ PASS: lib/prisma.ts imports PrismaMariaDb adapter"
else
    echo "❌ FAIL: lib/prisma.ts missing PrismaMariaDb adapter"
    exit 1
fi

# Test 4: Check package.json dependencies
echo "4. Validating package.json dependencies..."
if grep -q "@prisma/adapter-mariadb" package.json; then
    echo "✅ PASS: @prisma/adapter-mariadb in dependencies"
else
    echo "❌ FAIL: @prisma/adapter-mariadb not in dependencies"
    exit 1
fi

# Test 5: Check docker-compose.portainer.yml
echo "5. Validating docker-compose.portainer.yml..."
if grep -q "DB_HOST" docker-compose.portainer.yml && \
   grep -q "DB_USER" docker-compose.portainer.yml && \
   grep -q "DB_PASSWORD" docker-compose.portainer.yml; then
    echo "✅ PASS: docker-compose.portainer.yml has DB_* environment variables"
else
    echo "❌ FAIL: docker-compose.portainer.yml missing DB_* environment variables"
    exit 1
fi

# Test 6: Check database schema exists
echo "6. Validating database schema (casn.sql)..."
if [ -f "casn.sql" ]; then
    if grep -q "CREATE TABLE.*Author" casn.sql && grep -q "CREATE TABLE.*Analysis" casn.sql; then
        echo "✅ PASS: casn.sql contains Author and Analysis tables"

# Test 7: Check Dockerfile copies casn.sql
echo "7. Validating Dockerfile copies casn.sql for data loading..."
if grep -q "casn.sql" Dockerfile; then
    echo "✅ PASS: Dockerfile copies casn.sql"
else
    echo "❌ FAIL: Dockerfile missing casn.sql copy"
    exit 1
fi
    else
        echo "❌ FAIL: casn.sql missing required tables"
        exit 1
    fi
else
    echo "❌ FAIL: casn.sql file not found"
    exit 1
fi

echo ""
echo "🎉 === ALL TESTS PASSED ==="
echo "✅ Prisma v7 configuration is valid and ready for deployment"
echo ""
echo "Next steps:"
echo "1. Deploy with: portainer stack deploy --composefile docker-compose.portainer.yml casn"
echo "2. Migrate with: docker-compose -f docker-compose.portainer.yml exec migrate npx prisma migrate deploy"
echo "3. Test with: docker-compose -f docker-compose.portainer.yml exec app npm test"
