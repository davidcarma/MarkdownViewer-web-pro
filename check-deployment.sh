#!/bin/bash

echo "==================================="
echo "Deployment File Verification"
echo "==================================="
echo ""

error=0

echo "📦 Checking vendored libraries (lib/)..."
for file in \
    lib/highlight.min.js \
    lib/highlight.min.css \
    lib/markdown-it.min.js \
    lib/marked.min.js \
    lib/mermaid.min.js \
    lib/katex.min.js \
    lib/katex.min.css \
    lib/katex-auto-render.min.js \
    lib/mammoth.min.js; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  ✅ $file ($size)"
    else
        echo "  ❌ MISSING: $file"
        error=1
    fi
done

echo ""
echo "📁 Checking KaTeX fonts (lib/fonts/)..."
if [ -d "lib/fonts" ]; then
    font_count=$(ls -1 lib/fonts/KaTeX_*.woff2 2>/dev/null | wc -l | tr -d ' ')
    if [ "$font_count" -eq 20 ]; then
        echo "  ✅ lib/fonts/ (20 fonts found)"
    else
        echo "  ⚠️  lib/fonts/ (only $font_count fonts found, expected 20)"
        error=1
    fi
else
    echo "  ❌ MISSING: lib/fonts/ directory"
    error=1
fi

echo ""
echo "📄 Checking app files..."
for file in \
    "index.html" \
    "build-info.js" \
    "css/base.css" \
    "css/buttons.css" \
    "css/editor.css" \
    "css/modals.css" \
    "css/preview.css" \
    "css/responsive.css" \
    "css/toolbar.css" \
    "css/variables.css" \
    "js/app.js" \
    "js/core.js" \
    "js/drag-drop.js" \
    "js/events.js" \
    "js/file-browser.js" \
    "js/file-operations.js" \
    "js/drive-auth.js" \
    "js/drive-storage.js" \
    "js/file-system.js" \
    "js/image-paste.js" \
    "js/indexeddb-manager.js" \
    "js/minimap.js" \
    "js/notifications.js" \
    "js/pane-resizer.js" \
    "js/simple-image-collapse-v2.js" \
    "js/storage-manager.js" \
    "js/syntax-highlight.js"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ MISSING: $file"
        error=1
    fi
done

echo ""
echo "🔒 Checking for external runtime dependencies (scripts/styles from http(s)://)..."

# Whitelist: Google Identity Services (Drive integration; app degrades if unavailable)
GIS_WHITELIST="accounts.google.com/gsi/client"
if grep -RInE "<script[^>]+src=[\"']https?://|<link[^>]+href=[\"']https?://" index.html >/dev/null 2>&1; then
    BAD_LINES=$(grep -nE "<script[^>]+src=[\"']https?://|<link[^>]+href=[\"']https?://" index.html | grep -v "$GIS_WHITELIST" || true)
    if [ -n "$BAD_LINES" ]; then
        echo "  ❌ External script/style asset found in index.html (only $GIS_WHITELIST is allowed)"
        echo "$BAD_LINES" | head -n 20
        error=1
    else
        echo "  ✅ Only whitelisted external script (Google GIS) in index.html"
    fi
else
    echo "  ✅ No external script/style assets in index.html"
fi

if grep -RInE "@import[[:space:]]+url\\([\"']?https?://" css >/dev/null 2>&1; then
    echo "  ❌ External CSS @import found (NO CDNs allowed)"
    grep -RIn "@import[[:space:]]+url\\([\"']?https?://" css | head -n 20
    error=1
else
    echo "  ✅ No external CSS @import statements"
fi

if grep -RInE "script\\.src[[:space:]]*=[[:space:]]*[\"']https?://" js index.html >/dev/null 2>&1; then
    echo "  ❌ External dynamic script injection found (NO CDNs allowed)"
    grep -RIn "script\.src[[:space:]]*=[[:space:]]*[\"']https\?://" js index.html | head -n 20
    error=1
else
    echo "  ✅ No external dynamic script injection"
fi

echo ""
if [ $error -eq 0 ]; then
    echo "✨ All files present! Ready to deploy."
    echo ""
    echo "📤 Deploy structure:"
    echo "   • index.html"
    echo "   • build-info.js"
    echo "   • css/        (app stylesheets)"
    echo "   • js/         (app scripts)"
    echo "   • lib/        (vendored libraries + fonts)"
else
    echo "❌ Some files are missing! Check above for details."
fi
