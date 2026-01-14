#!/bin/bash

# CASN Single Compose File Deployment Script
# Simple deployment using docker-compose.single.yml

set -e

echo "🚀 Starting CASN Single Compose Deployment"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
print_status "Checking Docker availability..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not running"
    exit 1
fi

if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running"
    exit 1
fi

print_status "Docker is available"

# Check if docker-compose is available
print_status "Checking Docker Compose availability..."
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed"
    exit 1
fi

print_status "Docker Compose is available"

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f docker-compose.single.yml down 2>/dev/null || true

# Clean up volumes (optional)
read -p "Do you want to clean up existing volumes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Cleaning up existing volumes..."
    docker-compose -f docker-compose.single.yml down -v
    docker system prune -f
else
    print_warning "Keeping existing volumes (data will be preserved)"
fi

# Verify single compose file exists
if [ ! -f "docker-compose.single.yml" ]; then
    print_error "docker-compose.single.yml not found!"
    print_error "Please ensure the single compose file exists"
    exit 1
fi

print_status "Single compose file found: docker-compose.single.yml"

# Start with single compose file
print_status "Starting containers with single compose file..."
docker-compose -f docker-compose.single.yml up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 20

# Check if MySQL is healthy
MAX_ATTEMPTS=30
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    if docker exec casn-mysql mysqladmin ping -h 127.0.0.1 -uroot -prootpassword123 --silent 2>/dev/null; then
        print_status "MySQL is ready!"
        break
    fi
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        print_error "MySQL failed to start after $MAX_ATTEMPTS attempts"
        docker logs casn-mysql
        exit 1
    fi
    
    print_status "Waiting for MySQL... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    sleep 5
    ATTEMPT=$((ATTEMPT + 1))
done

# Check if app is healthy
MAX_ATTEMPTS=30
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
        print_status "Application is ready!"
        break
    fi
    
    if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
        print_error "Application failed to start after $MAX_ATTEMPTS attempts"
        docker logs casn-app
        exit 1
    fi
    
    print_status "Waiting for application... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    sleep 5
    ATTEMPT=$((ATTEMPT + 1))
done

# Verify database has data
print_status "Verifying database has all required data..."
AUTHOR_COUNT=$(docker exec casn-mysql mysql -u casn_user -pcasn_password123 casn -se "SELECT COUNT(*) FROM Author;" 2>/dev/null || echo "0")
ANALYSIS_COUNT=$(docker exec casn-mysql mysql -u casn_user -pcasn_password123 casn -se "SELECT COUNT(*) FROM Analysis;" 2>/dev/null || echo "0")

if [ "$AUTHOR_COUNT" -eq "31" ] && [ "$ANALYSIS_COUNT" -eq "39" ]; then
    print_status "✅ Database verification successful!"
    print_status "   Authors: $AUTHOR_COUNT (expected: 31)"
    print_status "   Analyses: $ANALYSIS_COUNT (expected: 39)"
else
    print_warning "⚠️  Database verification warning:"
    print_warning "   Authors: $AUTHOR_COUNT (expected: 31)"
    print_warning "   Analyses: $ANALYSIS_COUNT (expected: 39)"
    print_warning "   This might be normal for first deployment"
fi

# Test API endpoints
print_status "Testing API endpoints..."
if curl -s http://localhost:3001/api/articles > /dev/null; then
    print_status "✅ Articles API is working"
else
    print_warning "⚠️  Articles API test failed"
fi

# Final status
echo ""
echo "🎉 CASN Single Compose Deployment Complete!"
echo "=============================================="
echo ""
echo "📊 Deployment Summary:"
echo "   • Single compose file deployment"
echo "   • Authors: $AUTHOR_COUNT"
echo "   • Analyses: $ANALYSIS_COUNT"
echo "   • Application URL: http://localhost:3001"
echo ""
echo "🔗 Quick Links:"
echo "   • Homepage: http://localhost:3001"
echo "   • Authors: http://localhost:3001/autorzy"
echo "   • Analyses: http://localhost:3001/analizy"
echo "   • Health Check: http://localhost:3001/api/health"
echo ""
echo "📋 Useful Commands:"
echo "   • View logs: docker-compose -f docker-compose.single.yml logs -f"
echo "   • Stop: docker-compose -f docker-compose.single.yml down"
echo "   • Restart: docker-compose -f docker-compose.single.yml restart"
echo "   • Check DB: docker exec casn-mysql mysql -u casn_user -pcasn_password123 casn"
echo ""
print_status "Deployment script completed successfully!"

# Show container status
echo ""
print_status "Container Status:"
docker-compose -f docker-compose.single.yml ps