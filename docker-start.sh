#!/bin/bash

# CASN Docker Setup Startup Script
set -e

echo "🚀 Starting CASN Docker Setup..."

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp docker-compose.env.example .env
    echo "⚠️  Please update the .env file with your configuration before running the application."
fi

# Build and start the services
echo "🔨 Building and starting services..."
docker-compose up --build -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 30

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Services are running!"
    echo ""
    echo "🌐 Application is available at:"
    echo "   - Main app: http://localhost:3000"
    echo "   - Nginx proxy: http://localhost:80 (if enabled)"
    echo ""
    echo "📊 Database access:"
    echo "   - Host: localhost"
    echo "   - Port: 3306"
    echo "   - Database: casn"
    echo "   - User: casn_user"
    echo ""
    echo "📋 Useful commands:"
    echo "   - View logs: docker-compose logs -f"
    echo "   - Stop services: docker-compose down"
    echo "   - Restart services: docker-compose restart"
else
    echo "❌ Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi