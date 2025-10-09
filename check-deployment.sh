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
