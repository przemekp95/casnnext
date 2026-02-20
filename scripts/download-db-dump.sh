#!/bin/bash

# Script to download database dump from GitHub releases
# Usage: ./scripts/download-db-dump.sh [tag]
# If no tag is provided, it will try to get the latest release

set -e

REPO="${REPO:-przemekp95/casnnext}"
OUTPUT_FILE="casn.sql"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Downloading database dump from GitHub releases...${NC}"

# Function to get latest release tag
get_latest_release() {
    curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | cut -d'"' -f4
}

# Function to download specific release asset
download_asset() {
    local tag=$1
    local asset_url="https://github.com/$REPO/releases/download/$tag/$OUTPUT_FILE"

    echo -e "${YELLOW}Downloading from: $asset_url${NC}"

    if curl -L -o "$OUTPUT_FILE" "$asset_url" 2>/dev/null; then
        local size=$(stat -c%s "$OUTPUT_FILE" 2>/dev/null || stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo "unknown")
        echo -e "${GREEN}✓ Database dump downloaded successfully ($size bytes)${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to download database dump${NC}"
        return 1
    fi
}

# Main logic
if [ $# -eq 0 ]; then
    echo "No tag specified, getting latest release..."
    TAG=$(get_latest_release)
    if [ -z "$TAG" ]; then
        echo -e "${RED}✗ Could not get latest release information${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Latest release: $TAG${NC}"
else
    TAG=$1
    echo -e "${YELLOW}Using specified tag: $TAG${NC}"
fi

# Download the asset
if download_asset "$TAG"; then
    echo -e "${GREEN}Database dump is ready for seeding${NC}"
else
    echo -e "${RED}Failed to download database dump${NC}"
    echo -e "${YELLOW}Make sure the release exists and contains the $OUTPUT_FILE asset${NC}"
    exit 1
fi
