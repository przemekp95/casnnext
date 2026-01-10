#!/bin/bash

# Test Prisma Configuration - Updated for Single Compose File
# This script validates that the Docker deployment configuration is properly set up

set -e

echo "🔍 === DOCKER DEPLOYMENT CONFIGURATION VALIDATION ==="

# Test 1: Check docker-compose.final.yml exists and has correct structure
echo "1. Validating docker-compose.final.yml..."
if [ -f "docker-compose.final.yml" ]; then
    if grep -q "mysql:" docker-compose.final.yml && \
       grep -q "app:" docker-compose.final.yml && \
       grep -q "3001:3000" docker-compose.final.yml && \
       grep -q 'PORT: "3000"' docker-compose.final.yml; then
        echo "✅ PASS: docker-compose.final.yml has correct structure"
    else
        echo "❌ FAIL: docker-compose.final.yml missing required services, port mapping, or PORT environment variable"
        exit 1
    fi
else
    echo "❌ FAIL: docker-compose.final.yml not found"
    exit 1
fi

# Test 1b: Check docker-compose.portainer.yml exists and has correct structure
echo "1b. Validating docker-compose.portainer.yml..."
if [ -f "docker-compose.portainer.yml" ]; then
    if grep -q "mysql:" docker-compose.portainer.yml && \
       grep -q "app:" docker-compose.portainer.yml && \
       grep -q "80:3000" docker-compose.portainer.yml && \
       grep -q 'PORT: "3000"' docker-compose.portainer.yml; then
        echo "✅ PASS: docker-compose.portainer.yml has correct structure"
    else
        echo "❌ FAIL: docker-compose.portainer.yml missing required services, port mapping, or PORT environment variable"
        exit 1
    fi
else
    echo "❌ FAIL: docker-compose.portainer.yml not found"
    exit 1
fi

# Test 2: Check casn.sql exists
echo "2. Validating casn.sql (database init)..."
if [ -f "casn.sql" ]; then
    if grep -q "Author" casn.sql && \
       grep -q "Analysis" casn.sql; then
        echo "✅ PASS: casn.sql contains authors and analyses data"
    else
        echo "❌ FAIL: casn.sql missing author and analysis data"
        exit 1
    fi
else
    echo "❌ FAIL: casn.sql not found"
    exit 1
fi

# Test 3: Check app command override
echo "3. Validating app command override..."
if grep -q "command.*npm.*start" docker-compose.final.yml; then
    echo "✅ PASS: docker-compose.final.yml overrides command to skip migrations"
else
    echo "❌ FAIL: docker-compose.final.yml missing command override"
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
echo "✅ Docker deployment configuration is valid and ready for empty database approach"
echo ""
echo "Deploy with:"
echo "  docker-compose -f docker-compose.final.yml up -d"
echo ""
echo "Access at:"
echo "  http://localhost:3001"
echo ""
echo "This setup uses:"
echo "  • Empty database (no seeding)"
echo "  • Entrypoint override (skips migration scripts)"
echo "  • Final compose file"
