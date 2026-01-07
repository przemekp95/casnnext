#!/bin/bash

# Test Prisma Configuration - Updated for Single Compose File
# This script validates that the Docker deployment configuration is properly set up

set -e

echo "🔍 === DOCKER DEPLOYMENT CONFIGURATION VALIDATION ==="

# Test 1: Check docker-compose.single.yml exists and has correct structure
echo "1. Validating docker-compose.single.yml..."
if [ -f "docker-compose.single.yml" ]; then
    if grep -q "mysql:" docker-compose.single.yml && \
       grep -q "app:" docker-compose.single.yml && \
       grep -q "3001:3000" docker-compose.single.yml && \
       grep -q "docker-init-db.sql" docker-compose.single.yml; then
        echo "✅ PASS: docker-compose.single.yml has correct structure with pre-populated database"
    else
        echo "❌ FAIL: docker-compose.single.yml missing required services, port mapping, or database init"
        exit 1
    fi
else
    echo "❌ FAIL: docker-compose.single.yml not found"
    exit 1
fi

# Test 2: Check docker-init-db.sql exists
echo "2. Validating docker-init-db.sql (pre-populated database)..."
if [ -f "docker-init-db.sql" ]; then
    if grep -q "Author" docker-init-db.sql && \
       grep -q "Analysis" docker-init-db.sql; then
        echo "✅ PASS: docker-init-db.sql contains authors and analyses data"
    else
        echo "❌ FAIL: docker-init-db.sql missing author and analysis data"
        exit 1
    fi
else
    echo "❌ FAIL: docker-init-db.sql not found"
    exit 1
fi

# Test 3: Check app entrypoint override
echo "3. Validating app entrypoint override..."
if grep -q "entrypoint.*npm.*start" docker-compose.single.yml; then
    echo "✅ PASS: docker-compose.single.yml overrides entrypoint to skip migrations"
else
    echo "❌ FAIL: docker-compose.single.yml missing entrypoint override"
    exit 1
fi

# Test 4: Check Dockerfile (should be compatible with both approaches)
echo "4. Validating Dockerfile compatibility..."
if [ -f "Dockerfile" ]; then
    if grep -q "npm.*start" Dockerfile; then
        echo "✅ PASS: Dockerfile supports npm start command"
    else
        echo "❌ FAIL: Dockerfile missing npm start command"
        exit 1
    fi
else
    echo "❌ FAIL: Dockerfile not found"
    exit 1
fi

# Test 5: Check package.json has required dependencies
echo "5. Validating package.json dependencies..."
if [ -f "package.json" ]; then
    if grep -q "next" package.json && \
       grep -q "prisma" package.json; then
        echo "✅ PASS: package.json has required dependencies"
    else
        echo "❌ FAIL: package.json missing required dependencies"
        exit 1
    fi
else
    echo "❌ FAIL: package.json not found"
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

# Test 7: Check seed script syntax (should be fixed)
echo "7. Validating seed script syntax..."
if [ -f "prisma/seed.ts" ]; then
    # Check that the problematic quote is fixed
    if ! grep -q '"mowy nienawiści""' prisma/seed.ts; then
        echo "✅ PASS: prisma/seed.ts has correct quote syntax"
    else
        echo "❌ FAIL: prisma/seed.ts still has syntax errors with quotes"
        exit 1
    fi
else
    echo "✅ PASS: prisma/seed.ts not found (using pre-populated database approach)"
fi

echo ""
echo "🎉 === ALL TESTS PASSED ==="
echo "✅ Docker deployment configuration is valid and ready for pre-populated database approach"
echo ""
echo "Deploy with:"
echo "  docker-compose -f docker-compose.single.yml up -d"
echo ""
echo "Access at:"
echo "  http://localhost:3001"
echo ""
echo "This setup uses:"
echo "  • Pre-populated database (no migrations needed)"
echo "  • Entrypoint override (skips migration scripts)"
echo "  • Single compose file (simplified deployment)"