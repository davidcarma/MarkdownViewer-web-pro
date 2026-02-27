# Compact/Expand Feature

## Overview

The Markdown Viewer now includes a **Compact/Expand** toggle system with auto-detection that allows you to:

- **Expand Mode** (default): Normal multi-line markdown editing
- **Compact Mode**: Single-line JSON-escaped string format for easy embedding in JSON
- **Auto-Detection**: Automatically detects when you paste escaped content and offers to unescape it

## How to Use

### Manual Toggle
1. **Find the Toggle Button**: Look for the list icon (三) in the toolbar
2. **Switch to Compact Mode**: Click the toggle button to convert your markdown to a single-line escaped string
3. **Switch back to Expand Mode**: Click the button again (now with an expand arrow) to restore multi-line editing

### Auto-Detection (NEW!)
1. **Paste Escaped Content**: When you paste content with escaped characters like `\n`, `\"`, `\\`
2. **Get Smart Notification**: A notification will appear asking if you want to unescape it
3. **One-Click Fix**: Click "Unescape" to automatically convert it to proper markdown

### Manual Unescape
- **Unescape Button**: Use the dedicated unescape button (document with arrows) in the toolbar
- **Keyboard Shortcut**: Press `Ctrl+U` (or `Cmd+U` on Mac) to unescape current content

## Use Cases

### For JSON Embedding
When you need to embed markdown content as a JSON value:

```json
{
  "instructions": "# ARTICLE EXTRACTION TASK\n\n## PRIMARY OBJECTIVE\nFor each article in this page, gather the **full text complete, verbatim and UNTRUNCATED**.\n\n## **GROUND TRUTH SOURCES** (CRITICAL)\n**PRIMARY SOURCE**: The **attached source page image** - this is your GROUND TRUTH\n**SECONDARY SOURCE**: The OCR text data from context - use to supplement the image"
}
```

### For Copy-Paste Operations
- Compact the markdown to get a JSON-safe string
- Copy the escaped string from the editor
- Paste it into your JSON configuration, API payload, etc.
- The preview continues to show the rendered markdown for verification

## Features

### Automatic Escaping
The compact mode automatically handles:
- Quote escaping (`"` → `\"`)
- Newline escaping (`\n` → `\\n`)
- Backslash escaping (`\` → `\\\\`)
- Tab escaping (`\t` → `\\t`)
- Other JSON control characters

### Live Preview in Both Modes
- **Expand mode**: Preview updates in real-time as you type normal markdown
- **Compact mode**: Preview updates in real-time by dynamically unescaping your edits
- This lets you verify the content while working with the escaped string and see changes immediately

### Visual Indicators
- Button icon changes between list and expand arrow
- Editor pane title shows "(Compact)" when in compact mode
- Active button highlighting

## Example Workflows

### Creating Escaped Strings
1. **Start with regular markdown**:
   ```markdown
   # My Article
   
   This is a **bold** statement with "quotes" and
   multiple lines.
   ```

2. **Click compact toggle** - editor shows:
   ```
   "# My Article\n\nThis is a **bold** statement with \"quotes\" and\nmultiple lines."
   ```

3. **Copy the escaped string** for use in JSON

4. **Click expand toggle** - returns to normal multi-line editing

### Handling Pasted Escaped Strings (YOUR USE CASE!)
1. **Paste escaped content** like your example:
   ```
   # ARTICLE EXTRACTION TASK\n\n## PRIMARY OBJECTIVE\nFor each article...
   ```

2. **Auto-notification appears**: "🔧 Escaped content detected! Would you like to unescape it?"

3. **Click "Unescape"** - content becomes properly formatted:
   ```markdown
   # ARTICLE EXTRACTION TASK
   
   ## PRIMARY OBJECTIVE
   For each article...
   ```

4. **Preview renders perfectly** with proper headings, formatting, and line breaks!

## Notes

- **Real-time preview**: Works in both modes - even when editing escaped strings in compact mode!
- **No data loss**: Switching modes preserves your content and edits
- **Live editing**: You can edit the escaped string directly and see the preview update immediately
- **Perfect workflow**: Copy escaped strings from APIs/JSON, paste, auto-unescape, edit, then compact for export
- **All markdown features**: Work in both modes including headings, formatting, links, etc.
