#!/bin/bash

# Test Prisma v7 Configuration - Validation Script
# This script validates that the Docker deployment configuration is properly set up

set -e

echo "🔍 === DOCKER DEPLOYMENT CONFIGURATION VALIDATION ==="

# Test 1: Check docker-compose.final.yml exists and has correct structure
echo "1. Validating docker-compose.final.yml..."
if [ -f "docker-compose.final.yml" ]; then
    if grep -q "mysql:" docker-compose.final.yml && \
       grep -q "app:" docker-compose.final.yml && \
       grep -q "3001:3000" docker-compose.final.yml; then
        echo "✅ PASS: docker-compose.final.yml has correct structure"
    else
        echo "❌ FAIL: docker-compose.final.yml missing required services or port mapping"
        exit 1
    fi
else
    echo "❌ FAIL: docker-compose.final.yml not found"
    exit 1
fi

# Test 2: Check prisma.config.ts has correct PrismaClient setup
echo "2. Validating prisma.config.ts PrismaClient configuration..."
if grep -q "import { PrismaClient } from" prisma.config.ts && \
   grep -q "PrismaClient({" prisma.config.ts && \
   grep -q "datasources:" prisma.config.ts; then
    echo "✅ PASS: prisma.config.ts has correct PrismaClient setup"
else
    echo "❌ FAIL: prisma.config.ts missing proper PrismaClient configuration"
    exit 1
fi

# Test 3: Check lib/prisma.ts uses PrismaMariaDb adapter
echo "3. Validating lib/prisma.ts (should import MariaDB adapter)..."
if grep -q "PrismaMariaDb.*from.*@prisma/adapter-mariadb" lib/prisma.ts; then
    echo "✅ PASS: lib/prisma.ts imports PrismaMariaDb adapter"
else
    echo "❌ FAIL: lib/prisma.ts missing PrismaMariaDb adapter"
    exit 1
fi

# Test 4: Check docker-entrypoint.sh handles migrations
echo "4. Validating docker-entrypoint.sh migration handling..."
if [ -f "docker-entrypoint.sh" ]; then
    if grep -q "prisma migrate deploy" docker-entrypoint.sh; then
        echo "✅ PASS: docker-entrypoint.sh handles Prisma migrations"
    else
        echo "❌ FAIL: docker-entrypoint.sh missing migration commands"
        exit 1
    fi
else
    echo "❌ FAIL: docker-entrypoint.sh not found"
    exit 1
fi

# Test 5: Check package.json has required dependencies
echo "5. Validating package.json dependencies..."
if grep -q "@prisma/adapter-mariadb" package.json && \
   grep -q "@prisma/client" package.json; then
    echo "✅ PASS: package.json has required Prisma dependencies"
else
    echo "❌ FAIL: package.json missing required Prisma dependencies"
    exit 1
fi

# Test 6: Check database schema
echo "6. Validating database schema (prisma/schema.prisma)..."
if [ -f "prisma/schema.prisma" ]; then
    if grep -q "datasource db {" prisma/schema.prisma && \
       grep -q "provider.*=.*\"mysql\"" prisma/schema.prisma; then
        echo "✅ PASS: prisma/schema.prisma has correct MySQL datasource"
    else
        echo "❌ FAIL: prisma/schema.prisma missing proper datasource configuration"
        exit 1
    fi
else
    echo "❌ FAIL: prisma/schema.prisma not found"
    exit 1
fi

# Test 7: Check Dockerfile
echo "7. Validating Dockerfile..."
if [ -f "Dockerfile" ]; then
    if grep -q "docker-entrypoint.sh" Dockerfile; then
        echo "✅ PASS: Dockerfile uses docker-entrypoint.sh"
    else
        echo "❌ FAIL: Dockerfile missing docker-entrypoint.sh reference"
        exit 1
    fi
else
    echo "❌ FAIL: Dockerfile not found"
    exit 1
fi

echo ""
echo "🎉 === ALL TESTS PASSED ==="
echo "✅ Docker deployment configuration is valid and ready"
echo ""
echo "Deploy with:"
echo "  docker-compose -f docker-compose.final.yml up -d"
echo ""
echo "Access at:"
echo "  http://localhost:3001"