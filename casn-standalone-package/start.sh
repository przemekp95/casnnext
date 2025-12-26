# CASN Standalone Start Script

#!/bin/bash

# CASN Standalone Server Startup Script
# This script starts the CASN application in standalone mode

set -e

echo "Starting CASN Standalone Server..."
echo "=================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "WARNING: .env file not found!"
    echo "Please copy .env.example to .env and configure your database settings."
    echo ""
    echo "cp .env.example .env"
    echo "nano .env"
    echo ""
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js 20+ to run this application."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "ERROR: Node.js version 20+ required!"
    echo "Current version: $(node -v)"
    echo "Please upgrade Node.js to version 20 or higher."
    exit 1
fi

echo "Node.js version: $(node -v) ✓"

# Load environment variables
source .env

# Set default port if not specified
PORT=${PORT:-3000}

echo "Configuration:"
echo "  - Port: $PORT"
echo "  - Database: $DB_NAME (host: $DB_HOST)"
echo "  - Environment: ${NODE_ENV:-development}"
echo ""

# Start the server
echo "Starting CASN server on port $PORT..."
echo "Access your application at: http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

node server.js