#!/bin/bash

echo "==================================="
echo "KaTeX Deployment File Verification"
echo "==================================="
echo ""

error=0

# Check root KaTeX files
echo "📦 Checking root KaTeX files..."
for file in katex.min.css katex.min.js katex-auto-render.min.js; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  ✅ $file ($size)"
    else
        echo "  ❌ MISSING: $file"
        error=1
    fi
done

echo ""
echo "📦 Checking vendored runtime JS libraries (NO CDNs)..."
for file in marked.min.js highlight.min.js mermaid.min.js mammoth.min.js; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        echo "  ✅ $file ($size)"
    else
        echo "  ❌ MISSING: $file"
        error=1
    fi
done

echo ""
echo "📁 Checking fonts directory..."
if [ -d "fonts" ]; then
    font_count=$(ls -1 fonts/KaTeX_*.woff2 2>/dev/null | wc -l | tr -d ' ')
    if [ "$font_count" -eq 20 ]; then
        echo "  ✅ fonts/ directory (20 fonts found)"
    else
        echo "  ⚠️  fonts/ directory (only $font_count fonts found, expected 20)"
        error=1
    fi
else
    echo "  ❌ MISSING: fonts/ directory"
    error=1
fi

echo ""
echo "📄 Checking updated files..."
for file in "js/core.js" "css/preview.css" "index.html"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ MISSING: $file"
        error=1
    fi
done

echo ""
echo "🔒 Checking for external runtime dependencies (scripts/styles from http(s)://)..."

# Disallow external script/link assets in HTML
if grep -RInE "<script[^>]+src=[\"']https?://|<link[^>]+href=[\"']https?://" index.html >/dev/null 2>&1; then
    echo "  ❌ External script/style asset found in index.html (NO CDNs allowed)"
    grep -nE "<script[^>]+src=[\"']https?://|<link[^>]+href=[\"']https?://" index.html | head -n 20
    error=1
else
    echo "  ✅ No external script/style assets in index.html"
fi

# Disallow CSS @import from external sources
if grep -RInE "@import[[:space:]]+url\\([\"']?https?://" css >/dev/null 2>&1; then
    echo "  ❌ External CSS @import found (NO CDNs allowed)"
    grep -RIn "@import[[:space:]]+url\\([\"']?https?://" css | head -n 20
    error=1
else
    echo "  ✅ No external CSS @import statements"
fi

# Disallow dynamic script injection from external sources in JS/HTML
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
    echo "📤 To deploy, upload these to your server:"
    echo "   • katex.min.css"
    echo "   • katex.min.js"
    echo "   • katex-auto-render.min.js"
    echo "   • fonts/ (entire directory)"
    echo "   • js/core.js"
    echo "   • css/preview.css"
    echo "   • index.html"
else
    echo "❌ Some files are missing! Check above for details."
fi

echo ""
echo "Test locally by opening: test-math.html"
