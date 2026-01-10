#!/bin/bash

# CASN Release Creation Script
# Usage: ./scripts/create-release.sh <version> [message]

set -e

VERSION=$1
MESSAGE=${2:-"Release version $VERSION"}

if [ -z "$VERSION" ]; then
    echo "❌ Error: Version is required"
    echo "Usage: $0 <version> [message]"
    echo "Example: $0 v1.2.3 'Add new features'"
    exit 1
fi

# Validate version format
if [[ ! $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "❌ Error: Version must be in format v1.2.3"
    exit 1
fi

echo "🚀 Creating release $VERSION"

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: Not on main branch (currently on: $CURRENT_BRANCH)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: Working directory is not clean. Commit or stash changes first."
    git status --short
    exit 1
fi

# Check if tag already exists
if git tag --list | grep -q "^$VERSION$"; then
    echo "❌ Error: Tag $VERSION already exists"
    exit 1
fi

# Create annotated tag
echo "📝 Creating annotated tag: $VERSION"
git tag -a "$VERSION" -m "$MESSAGE"

# Push tag to trigger release workflow
echo "⬆️  Pushing tag to GitHub..."
git push origin "$VERSION"

echo ""
echo "✅ Release $VERSION created successfully!"
echo ""
echo "📋 What happens next:"
echo "   • GitHub Actions will build and push Docker image"
echo "   • Release workflow will create GitHub release with changelog"
echo "   • Production deployment will be triggered (if configured)"
echo ""
echo "🔗 Check progress:"
echo "   • GitHub Actions: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
echo "   • Releases: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/releases"