#!/bin/bash

# Automated ESLint Fixing Script
# This script runs ESLint with --fix to automatically resolve fixable issues

set -e

echo "🔧 Starting automated ESLint fixing..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get initial problem count
print_status "Checking initial ESLint problems..."
INITIAL_COUNT=$(npm run lint 2>&1 | grep -o "✖ [0-9]* problems" | grep -o "[0-9]*" || echo "0")
print_status "Initial problems: $INITIAL_COUNT"

# Run ESLint with --fix to automatically fix issues
print_status "Running ESLint --fix to automatically resolve fixable issues..."
npm run lint:fix

# Get count after auto-fix
print_status "Checking problems after auto-fix..."
AFTER_FIX_COUNT=$(npm run lint 2>&1 | grep -o "✖ [0-9]* problems" | grep -o "[0-9]*" || echo "0")
print_success "Problems after auto-fix: $AFTER_FIX_COUNT"

# Calculate improvement
IMPROVEMENT=$((INITIAL_COUNT - AFTER_FIX_COUNT))
if [ "$IMPROVEMENT" -gt 0 ]; then
    print_success "Auto-fixed $IMPROVEMENT problems!"
fi

# Show remaining issues summary
echo ""
print_status "Remaining ESLint issues summary:"
npm run lint | grep -E "(✖|problems|error|warning)" | tail -5

echo ""
print_warning "Manual fixes may be needed for remaining issues."
print_status "Common manual fixes needed:"
echo "  - Replace 'any' types with specific TypeScript types"
echo "  - Add proper type annotations"
echo "  - Remove unused imports/variables"
echo "  - Convert require() to import statements"
echo "  - Fix @ts-ignore to @ts-expect-error"

echo ""
print_success "Automated fixing complete!"
print_status "Run 'npm run lint' to see current status"