# KaTeX Deployment Checklist

## Files to Upload

Make sure ALL these files are uploaded to your server:

### Root Directory Files:
- ✅ `index.html` (updated with local KaTeX references)
- ✅ `katex.min.css` (23KB)
- ✅ `katex.min.js` (271KB)
- ✅ `katex-auto-render.min.js` (3.4KB)
- ✅ `test-math.html` (for testing)

### Fonts Directory:
Upload the entire `fonts/` directory with all 23 font files:
- ✅ KaTeX_AMS-Regular.woff2
- ✅ KaTeX_Caligraphic-Bold.woff2
- ✅ KaTeX_Caligraphic-Regular.woff2
- ✅ KaTeX_Fraktur-Bold.woff2
- ✅ KaTeX_Fraktur-Regular.woff2
- ✅ KaTeX_Main-Bold.woff2
- ✅ KaTeX_Main-BoldItalic.woff2
- ✅ KaTeX_Main-Italic.woff2
- ✅ KaTeX_Main-Regular.woff2
- ✅ KaTeX_Math-BoldItalic.woff2
- ✅ KaTeX_Math-Italic.woff2
- ✅ KaTeX_SansSerif-Bold.woff2
- ✅ KaTeX_SansSerif-Italic.woff2
- ✅ KaTeX_SansSerif-Regular.woff2
- ✅ KaTeX_Script-Regular.woff2
- ✅ KaTeX_Size1-Regular.woff2
- ✅ KaTeX_Size2-Regular.woff2
- ✅ KaTeX_Size3-Regular.woff2
- ✅ KaTeX_Size4-Regular.woff2
- ✅ KaTeX_Typewriter-Regular.woff2

### JavaScript Directory:
- ✅ `js/core.js` (updated with math rendering)

### CSS Directory:
- ✅ `css/preview.css` (updated with math styles)

## Server Structure Should Look Like:

```
/
├── index.html
├── katex.min.css
├── katex.min.js
├── katex-auto-render.min.js
├── test-math.html
├── fonts/
│   ├── KaTeX_AMS-Regular.woff2
│   ├── KaTeX_Caligraphic-Bold.woff2
│   ├── KaTeX_Caligraphic-Regular.woff2
│   ├── ... (all 23 font files)
│   └── KaTeX_Typewriter-Regular.woff2
├── js/
│   ├── core.js
│   └── ... (other js files)
└── css/
    ├── preview.css
    └── ... (other css files)
```

## Testing Steps

### 1. Test KaTeX Loading
Visit: `https://markdownpro.eyesondash.com/test-math.html`
- Open browser console (F12)
- Should see: "KaTeX loaded: true"
- Should see: "renderMathInElement loaded: true"
- Math equations should be rendered

### 2. Test Main Application
Visit: `https://markdownpro.eyesondash.com/`
- Open browser console (F12)
- Check for any 404 errors on KaTeX files
- Type this in the editor:

```markdown
Test inline math: $E = mc^2$

Test block math:
$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$
```

### 3. Check Network Tab
In browser DevTools (F12) → Network tab:
- ✅ `katex.min.css` should load (Status: 200)
- ✅ `katex.min.js` should load (Status: 200)
- ✅ `katex-auto-render.min.js` should load (Status: 200)
- ✅ Font files should load as needed (Status: 200)

## Common Issues & Solutions

### Issue: Math not rendering
**Solution:** Check browser console for errors. Look for:
- "Failed to load resource" → Files not uploaded
- "renderMathInElement is not defined" → Script load order issue
- Font errors → `fonts/` directory not uploaded

### Issue: Fonts showing incorrectly
**Solution:** Ensure `fonts/` directory is in the same location as `katex.min.css`

### Issue: 404 errors
**Solution:** Check file paths match exactly:
- `./fonts/KaTeX_*.woff2` (case-sensitive!)
- Files must be at root level alongside `index.html`

## Quick Debug Commands

Open browser console on your site and run:
```javascript
// Check if KaTeX is loaded
console.log('katex:', typeof katex);
console.log('renderMathInElement:', typeof renderMathInElement);

// Try rendering manually
const testDiv = document.createElement('div');
testDiv.innerHTML = 'Test: $x^2$';
document.body.appendChild(testDiv);
if (typeof renderMathInElement !== 'undefined') {
    renderMathInElement(testDiv, {
        delimiters: [{left: '$', right: '$', display: false}]
    });
}
```

## Expected Console Output
When working correctly, you should see:
```
KaTeX loaded: true
renderMathInElement loaded: true
🚀 Markdown Editor initialized successfully!
```

And NO errors about missing files.

