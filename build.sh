#!/bin/bash

# Build script for Markdown Pro
# Generates build-info.js for a target git commit hash.
# Usage:
#   bash build.sh
#   bash build.sh <commit-ish>

echo "🔨 Building Markdown Pro..."

TARGET_COMMIT="${1:-HEAD}"

# Get git commit hash (short version)
GIT_HASH=$(git rev-parse --short "$TARGET_COMMIT")
GIT_HASH_FULL=$(git rev-parse "$TARGET_COMMIT")
BUILD_DATE=$(date +"%Y-%m-%d %H:%M:%S")

echo "📦 Build: $GIT_HASH"
echo "📅 Date: $BUILD_DATE"

# Generate build-info.js with target commit hash
cat > build-info.js << EOF
// Auto-generated build information
// This file is updated automatically on deploy push
window.BUILD_INFO = {
    hash: '$GIT_HASH',
    hashFull: '$GIT_HASH_FULL',
    date: '$BUILD_DATE',
    version: '1.0.0'
};
EOF

echo "✅ Generated build-info.js"
echo ""
echo "📤 To deploy:"
echo "   1. git add build-info.js"
echo "   2. git commit -m 'Update build to $GIT_HASH'"
echo "   3. git push origin main"
echo ""
echo "💡 Or use the quick deploy command:"
echo "   ./build.sh && git add . && git commit -m 'Build $GIT_HASH' && git push"
