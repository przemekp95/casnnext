#!/bin/bash

# Test TypeORM Configuration - Updated for TypeORM Migration
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
       grep -q "18080:80" docker-compose.portainer.yml && \
       grep -q 'PORT: "80"' docker-compose.portainer.yml; then
        echo "✅ PASS: docker-compose.portainer.yml has correct structure"
    else
        echo "❌ FAIL: docker-compose.portainer.yml missing required services, port mapping, or PORT environment variable"
        exit 1
    fi
else
    echo "❌ FAIL: docker-compose.portainer.yml not found"
    exit 1
fi

# Test 2: Check casn.sql can be downloaded from GitHub releases
echo "2. Validating casn.sql (database init from releases)..."
# Try to download the latest database dump from releases
if curl -L -o casn.sql "https://github.com/przemekp95/casnnext/releases/latest/download/casn.sql" 2>/dev/null; then
    # Check if we actually got a database file (not an error message)
    if grep -q "Not Found" casn.sql 2>/dev/null || \
       grep -q "<!DOCTYPE html>" casn.sql 2>/dev/null; then
        echo "⚠️  WARN: Downloaded file appears to be error page (no releases exist yet)"
        rm casn.sql
        echo "✅ PASS: Database dump validation skipped (will be handled by release workflow)"
    elif grep -q "Author" casn.sql && \
         grep -q "Analysis" casn.sql; then
        echo "✅ PASS: casn.sql downloaded from releases and contains authors and analyses data"
        # Clean up - remove downloaded file as it's not needed in CI
        rm casn.sql
    else
        echo "❌ FAIL: casn.sql downloaded but missing author and analysis data"
        rm casn.sql
        exit 1
    fi
else
    echo "⚠️  WARN: Could not download casn.sql from releases (this is OK if no releases exist yet)"
    echo "✅ PASS: Database dump validation skipped (will be handled by release workflow)"
fi

# Test 3: Check app command override
echo "3. Validating app command override..."
if grep -q "node.*server.js" docker-compose.final.yml; then
    echo "✅ PASS: docker-compose.final.yml uses custom server for TypeORM bootstrap"
else
    echo "❌ FAIL: docker-compose.final.yml missing proper command configuration"
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
       grep -q "typeorm" package.json; then
        echo "✅ PASS: package.json has required dependencies"
    else
        echo "❌ FAIL: package.json missing required dependencies"
        exit 1
    fi
else
    echo "❌ FAIL: package.json not found"
    exit 1
fi

# Test 6: Check TypeORM entities
echo "6. Validating TypeORM entities..."
if [ -f "lib/entities/Author.ts" ] && [ -f "lib/entities/Analysis.ts" ]; then
    if grep -q "EntitySchema" lib/entities/Author.ts && \
       grep -q "EntitySchema" lib/entities/Analysis.ts && \
       grep -q "AuthorSchema" lib/entities/Author.ts && \
       grep -q "AnalysisSchema" lib/entities/Analysis.ts; then
        echo "✅ PASS: TypeORM entities are properly configured with EntitySchema"
    else
        echo "❌ FAIL: TypeORM entities missing EntitySchema configuration"
        exit 1
    fi
else
    echo "❌ FAIL: TypeORM entities not found"
    exit 1
fi

# Test 7: Check migration scripts
echo "7. Validating TypeORM migration scripts..."
if [ -d "migrations" ] && [ "$(ls migrations/*.ts 2>/dev/null | wc -l)" -gt 0 ]; then
    echo "✅ PASS: TypeORM migrations directory exists and contains migration files"
else
    echo "❌ FAIL: TypeORM migrations not found"
    exit 1
fi

echo ""
echo "🎉 === ALL TESTS PASSED ==="
echo "✅ Docker deployment configuration is valid and ready for TypeORM approach"
echo ""
echo "Deploy with:"
echo "  docker-compose -f docker-compose.final.yml up -d"
echo ""
echo "Access at:"
echo "  http://localhost:3001"
echo ""
echo "This setup uses:"
echo "  • TypeORM migrations"
echo "  • Automatic database initialization"
echo "  • TypeORM entities for schema management"