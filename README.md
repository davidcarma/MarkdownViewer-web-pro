# Markdown Editor Pro

A fully-featured, modern Markdown editor with live preview, auto-save, and fullscreen editing built with HTML, CSS, and JavaScript.

## System reference (recommended)

See **`SYSTEM.md`** for the **current** architecture, invariants, storage model, scroll-sync design, and the offline/deployment checklist.

## Features

### Core Functionality
- **Real-time Preview**: See your markdown rendered as you type
- **Split Pane Layout**: Editor and preview side-by-side with resizable divider
- **IndexedDB Storage**: Large-capacity browser storage (50MB - several GB) for multiple files
- **File Browser**: Browse and manage all your saved files with a beautiful modal interface
- **Auto-Save**: Your work is automatically saved to IndexedDB as you type (never lose data again!)
- **File Persistence**: Resume exactly where you left off across browser sessions
- **Fullscreen Editing**: Distraction-free editing mode with smooth transitions
- **Syntax Highlighting**: Code blocks are highlighted using highlight.js
- **File Operations**: New, Open, and Save markdown files with smart workflow
- **Word Document Import**: Import and convert Word documents (.docx) to Markdown automatically
- **Drag & Drop Support**: Drop markdown files or Word documents directly onto the editor
- **Image Paste Support**: Paste images from clipboard as embedded inline images
- **Image Widget System**: Collapse long data URLs into moveable image objects
- **Mermaid Diagrams**: Full support for Mermaid flowcharts, sequence diagrams, and more

### Editor Features
- **Format Toolbar**: Quick access to common markdown formatting
- **Keyboard Shortcuts**: 
  - `Ctrl/Cmd + N`: New file
  - `Ctrl/Cmd + O`: Open file
  - `Ctrl/Cmd + S`: Save file (download)
  - `Ctrl/Cmd + L`: Save to localStorage
  - `Ctrl/Cmd + Z`: Undo (native browser undo)
  - `Ctrl/Cmd + Y`: Redo (native browser redo)
  - `Ctrl/Cmd + B`: Bold text
  - `Ctrl/Cmd + I`: Italic text
  - `Escape`: Exit fullscreen mode
  - `Tab`: Indent text
  - `Shift + Tab`: Unindent text
- **Auto-completion**: Automatic closing of brackets, quotes, and parentheses
- **Smart Indentation**: Proper tab handling for code blocks and lists
- **Line Numbers & Statistics**: Real-time word count, character count, and line count
- **Cursor Position**: Shows current line and column

### UI/UX Features
- **Dark/Light Theme**: Toggle between themes with persistent preference
- **Fullscreen Mode**: Click the eye button for immersive editing with mode switching
- **Smooth Transitions**: All UI changes are beautifully animated
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern Interface**: Clean, professional design with intuitive controls
- **Smart Notifications**: Toast notifications for all operations (saves, loads, errors)
- **Visual Feedback**: Drag-over effects, image processing indicators, and auto-save status
- **Embedded Images**: Pasted images are converted to data URLs for self-contained documents
- **Image Widgets**: Collapsible image objects that can be moved, deleted, and expanded
- **Dual View Modes**: Switch between widget view and raw markdown view
- **Copy HTML**: Export rendered HTML to clipboard
- **Print Support**: Optimized print styles for preview content
- **Storage Management**: Monitor localStorage usage and export/import data

### Advanced Features
- **Scroll Synchronization**: Preview scrolls with editor
- **Mermaid Diagrams**: Full support for flowcharts, sequence diagrams, Gantt charts, and more
- **Advanced Error Handling**: Robust Mermaid parsing with helpful error messages
- **Format Buttons**: Quick formatting for:
  - Headers (H1, H2, H3)
  - Bold, Italic, Code
  - Lists (Bullet, Numbered)
  - Quotes, Links, Images
  - Tables
  - Mermaid Diagrams
- **GitHub Flavored Markdown**: Full GFM support including tables and code blocks
- **Accessibility**: Keyboard navigation and screen reader support
- **Data Persistence**: Future-ready architecture for multi-file support

## Usage

### Getting Started
1. **Open the Editor**: Open `index.html` in any modern web browser
2. **Start Writing**: Begin typing markdown in the left pane
3. **Auto-Save**: Your work is automatically saved to **IndexedDB** (debounced). A small **localStorage** buffer is used only for small docs/compatibility.
4. **Live Preview**: See the rendered output in the right pane
5. **Fullscreen Mode**: Click the eye 👁 button for distraction-free editing

### File Operations
- **New File**: Use Ctrl/Cmd+N - Shows dialog with options: Save on Browser (default), Download, Cancel, or Delete
- **Open Files**: Use Ctrl/Cmd+O - Opens file browser to browse and select from saved files, or open from disk
- **File Browser**: Browse all saved files, search by name, view metadata, and manage files
- **Save to Computer**: Use Ctrl/Cmd+S to download your markdown file
- **Save to Browser**: Files are automatically saved to IndexedDB (much larger capacity than localStorage)
- **Format Text**: Use the toolbar buttons or keyboard shortcuts

### Advanced Features
- **Drag & Drop**: Simply drag markdown files or Word documents from your file system
- **Word Import**: Click the Word import button or drag & drop .docx files for automatic conversion
- **Paste Images**: Copy any image and paste (Ctrl/Cmd+V) directly into the editor
- **Mermaid Diagrams**: Create flowcharts with code blocks marked as `mermaid`
- **Fullscreen Editing**: Switch between edit and preview modes in fullscreen

## File Structure

```
Markdown Viewer/
├── index.html                    # Main HTML file
├── css/                          # Modular CSS files
│   ├── base.css                  # Base styles and layout
│   ├── buttons.css               # Button styling
│   ├── editor.css                # Editor pane styles
│   ├── modals.css                # Modal dialogs
│   ├── preview.css               # Preview pane styles
│   ├── responsive.css            # Mobile responsiveness
│   ├── toolbar.css               # Toolbar styling
│   └── variables.css             # CSS custom properties
├── js/                           # Modular JavaScript files
│   ├── app.js                    # Application initialization
│   ├── core.js                   # Core editor functionality
│   ├── events.js                 # Event handling
│   ├── file-operations.js        # File open/save operations
│   ├── file-browser.js           # File browser modal interface
│   ├── indexeddb-manager.js      # IndexedDB storage management
│   ├── storage-manager.js        # localStorage management (backward compatibility)
│   ├── drag-drop.js              # Drag & drop functionality
│   ├── image-paste.js            # Image paste handling
│   ├── notifications.js         # Toast notifications
│   ├── pane-resizer.js          # Split pane resizing
│   ├── syntax-highlight.js      # Editor syntax highlighting
│   └── simple-image-collapse-v2.js # Image widget system
├── test/                         # Test files
│   ├── debug-mermaid.html        # Mermaid testing
│   └── test-mermaid.md           # Test markdown files
├── archive/                      # Archived old versions
├── marked.min.js                 # Markdown parsing library
├── highlight.min.js              # Syntax highlighting library
├── mermaid.min.js                # Mermaid diagram library
├── mammoth.min.js                # Word document conversion library
├── highlight.min.css             # Syntax highlighting styles
├── README.md                     # This file
├── LOCALSTORAGE.md               # localStorage documentation
└── todo.md                       # Development roadmap
```

## Dependencies

All dependencies are included locally for offline functionality:

- **markdown-it**: Markdown parser with source line tracking (primary renderer)
- **Marked.js**: Legacy/auxiliary parser (kept vendored)
- **Highlight.js**: Syntax highlighting for code blocks
- **Mermaid.js**: Diagram and flowchart rendering
- **Mammoth.js**: Word document to HTML/Markdown conversion

### Hard project rule: NO external runtime dependencies

- **No CDNs**: Do not load runtime JS/CSS/fonts from `http(s)://` (no `<script src="https://...">`, `<link href="https://...">`, or CSS `@import url(https://...)`).
- **Vendored libraries only**: Any third-party runtime dependency must be committed into this repo and referenced via relative paths.
- **Offline-first**: The app should run locally with **zero network access** (no background fetches to external APIs for core functionality).

This is enforced by `check-deployment.sh` (it fails if any external runtime assets are detected).

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge
- Any modern browser with ES6+ support

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New file (offers to save current work) |
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save file (download) |
| `Ctrl/Cmd + L` | Save to localStorage |
| `Ctrl/Cmd + Z` | Undo (native browser) |
| `Ctrl/Cmd + Y` | Redo (native browser) |
| `Ctrl/Cmd + E` | Export to PDF |
| `Ctrl/Cmd + P` | Print |
| `Ctrl/Cmd + B` | Bold selected text |
| `Ctrl/Cmd + I` | Italic selected text |
| `Escape` | Exit fullscreen mode |
| `Tab` | Indent line/selection |
| `Shift + Tab` | Unindent line/selection |

## IndexedDB Storage System

This editor features a powerful IndexedDB storage system that automatically saves your work with much larger capacity than localStorage:

### ✅ **What's Saved Automatically:**
- **File Content**: Your markdown text as you type (with full image data URLs)
- **Cursor Position**: Exact position for seamless resume
- **File Name**: Document title and metadata
- **Modified State**: Track unsaved changes
- **File Metadata**: Creation date, modification date, file size, word count, line count

### 🔄 **How It Works:**
1. **Auto-Save**: Saves to IndexedDB every 1 second after you stop typing (debounced)
2. **Session Restore**: Automatically loads your most recently modified file when you return
3. **Smart Workflow**: Clear document dialog offers 4 options: Save on Browser (default), Download, Cancel, or Delete
4. **Visual Feedback**: Uses a subtle LED indicator (footer) to show save activity/state
5. **Migration**: On load, migrates localStorage → IndexedDB **non-destructively by default** (does not clear localStorage unless explicitly requested)

### 🗂️ **File Management:**
- **Multiple Files**: Store many files in IndexedDB (50MB - several GB capacity)
- **File Browser**: Beautiful modal interface to browse, search, open, and delete files
- **User-Controlled**: You decide when to create new files or load existing ones
- **Data Persistence**: Works completely offline, no server required
- **Search Functionality**: Search files by name or content in the file browser

### 💾 **Storage Features:**
- **Large Capacity**: IndexedDB provides 50MB to several GB (vs 5-10MB for localStorage)
- **Multiple Files**: Store and manage multiple markdown files
- **File Browser**: Browse all saved files with metadata (date, size, etc.)
- **Error Handling**: Graceful handling of storage quota limits
- **Cross-Session**: Your work persists across browser sessions
- **Backward Compatible**: Falls back to localStorage if IndexedDB unavailable
- **Automatic Migration**: On first load, automatically migrates files from localStorage to IndexedDB and clears localStorage to free up space

### 📱 **Important Note About Syncing:**
IndexedDB data does **NOT** automatically sync across devices. Each browser/device maintains its own copy. For cross-device access:
- Use the download feature to save files to your computer
- Future versions will include cloud sync options
- Consider using a browser extension version for Chrome sync

### 🎯 **Clear Document Dialog:**
When creating a new file, you'll see a dialog with 4 options:
- **Save on Browser** (default): Saves current file to IndexedDB
- **Download**: Downloads the file to your computer
- **Cancel**: Keeps current document open
- **Delete**: Removes the file from IndexedDB storage

### 🔄 **Migration from localStorage:**
The editor automatically migrates files from localStorage to IndexedDB on first load:
- **One-Time Migration**: Runs automatically when you first open the editor
- **Smart Deduplication**: Skips files already in IndexedDB (unless localStorage version is newer)
- **Non-Destructive by Default**: localStorage is kept as a backup unless you explicitly clear it
- **Manual Cleanup**: Use `migrateToIndexedDB(true)` in console to migrate and clear localStorage

## Drag & Drop Feature

The editor supports intuitive drag and drop functionality for opening markdown files and Word documents:

### How it Works
1. **Drag a File**: Select any supported file (`.md`, `.txt`, `.markdown`, `.docx`) from your file system
2. **Drop on Editor**: Drag the file over the editor pane (left side) - you'll see a visual indicator
3. **Smart Handling**: If you have unsaved changes, you'll get a dialog with three options:
   - **Cancel**: Keep current file, don't load the dropped file
   - **Save Current & Load New**: Save your current work first, then load the dropped file
   - **Replace Without Saving**: Discard current changes and load the dropped file
4. **Automatic Conversion**: Word documents are automatically converted to Markdown during the drop process

### Supported File Types
- `.md` (Markdown files)
- `.txt` (Plain text files) 
- `.markdown` (Markdown files with full extension)
- `.docx` (Microsoft Word documents - automatically converted to Markdown)
- Files with `text/markdown`, `text/plain`, or Word document MIME types

### Visual Feedback
- **Drag Over**: The editor pane highlights with a blue dashed border and shows "Drop file here"
- **Success**: Green notification confirms the file was loaded or converted successfully
- **Error**: Red notification shows if there's an issue (unsupported file type, conversion error, etc.)
- **Word Conversion**: Special notifications for Word document conversion progress and results

## Image Paste Feature

The editor supports pasting images directly from your clipboard with automatic embedding:

### How it Works
1. **Copy Image**: Copy any image from anywhere (screenshots, web images, image files, etc.)
2. **Paste in Editor**: Click in the editor and press `Ctrl/Cmd+V` (or right-click → Paste)
3. **Automatic Processing**: The image is automatically converted to a data URL and embedded
4. **Instant Preview**: See the image immediately in the preview pane

### Supported Image Types
- PNG images
- JPEG/JPG images  
- GIF images (including animated)
- WebP images
- BMP images
- SVG images

### Features
- **Data URL Embedding**: Images are converted to base64 data URLs, making documents self-contained
- **Automatic Naming**: Pasted images get timestamped filenames (e.g., `pasted-image-2024-08-15T07-04-32-123Z.png`)
- **Visual Feedback**: Processing indicator shows while image is being converted
- **Error Handling**: Clear notifications for any paste issues
- **Multiple Images**: Paste multiple images at once - each will be inserted sequentially
- **Cursor Positioning**: Images are inserted at your current cursor position

### Visual Indicators
- **Processing**: "📷 Processing image..." indicator appears while converting
- **Success**: Green notification confirms successful paste
- **Error**: Red notification shows if there's an issue with the image

### Technical Details
- Images are embedded as `![filename](data:image/type;base64,...)` markdown
- No external dependencies - images are fully contained in the document
- Works with any image source (clipboard, screenshots, copied web images)
- Preserves original image quality and format

## Image Widget System

The editor features an innovative widget system that collapses long data URLs into manageable, interactive image objects:

### Widget Features
- **Collapsed Display**: Long base64 data URLs are hidden and replaced with compact image widgets
- **Visual Preview**: Each widget shows a thumbnail of the image with filename
- **Drag & Drop**: Move images around by dragging widgets to different lines
- **Quick Actions**: Expand to raw markdown or delete images with one click
- **Dual View**: Toggle between widget view and raw markdown view

### Widget Controls
- **🔍 Expand**: Click to switch to raw markdown view and select the image data
- **🗑️ Delete**: Remove the image with confirmation dialog
- **📝/🖼️ Toggle**: Switch between raw markdown and widget views

### How Widgets Work
1. **Automatic Detection**: When you paste an image or open a file with embedded images, widgets are created automatically
2. **Clean Editor**: Instead of seeing long data URLs, you see compact, moveable image objects
3. **Easy Management**: Drag widgets up/down to reposition images in your document
4. **Non-Destructive**: Widgets are just a visual representation - the actual markdown is preserved

### Widget Interaction
- **Move Images**: Click and drag any widget to move it to a different line
- **View Raw Data**: Click the expand button to see the full markdown syntax
- **Delete Images**: Click the delete button to remove images entirely
- **Toggle Views**: Use the toggle button in the editor header to switch between widget and raw views

This system makes working with embedded images much more manageable, especially when dealing with multiple images or large documents.

## Word Document Import

The editor supports importing Microsoft Word documents (.docx) and automatically converting them to Markdown:

### How to Import Word Documents

1. **Using the Import Button**: Click the Word document import button (W icon) in the toolbar
2. **Drag & Drop**: Simply drag a .docx file from your file system onto the editor
3. **File Selection**: Browse and select a Word document from the file dialog

### Conversion Features

- **Automatic Format Conversion**: Word formatting is automatically converted to Markdown syntax
- **Preserved Elements**: 
  - Headings (H1-H6) → Markdown headings (`#`, `##`, etc.)
  - Bold and italic text → `**bold**` and `*italic*`
  - Lists (bulleted and numbered) → Markdown lists
  - Links → `[text](url)` format
  - Tables → Markdown table format
  - Code blocks → Triple backtick code blocks
  - Blockquotes → `> quoted text`
- **Smart Filename Handling**: Original filename is preserved with `.md` extension
- **Warning Notifications**: Any formatting issues are reported after conversion

### Supported Word Features

The import function handles most common Word document elements:

- **Text Formatting**: Bold, italic, inline code
- **Document Structure**: Headings, paragraphs, line breaks
- **Lists**: Bulleted lists, numbered lists, nested lists
- **Links**: Hyperlinks with proper URL preservation
- **Tables**: Full table structure with headers and cells
- **Quotes**: Blockquotes and indented text
- **Images**: Embedded images (converted to base64 data URLs)

### Technical Details

- **Conversion Engine**: Uses mammoth.js library for reliable Word to HTML conversion
- **Processing Pipeline**: Word → HTML → Markdown for clean output
- **Error Handling**: Graceful handling of unsupported elements
- **Preservation**: Original document structure and hierarchy maintained
- **Integration**: Seamlessly integrates with existing editor features (auto-save, image collapse, etc.)

### Known Limitations

- Complex formatting (custom styles, advanced layouts) may be simplified
- Some Word-specific features (comments, track changes) are not preserved
- Very large documents may take longer to process
- Requires modern browser with ES6+ support for optimal performance

## Mermaid Diagram Support

The editor includes full support for Mermaid diagrams, allowing you to create flowcharts, sequence diagrams, and more directly in your markdown:

### Supported Diagram Types
- **Flowcharts**: `graph TD`, `graph LR`, `flowchart TD`
- **Sequence Diagrams**: `sequenceDiagram`
- **Gantt Charts**: `gantt`
- **Class Diagrams**: `classDiagram`
- **State Diagrams**: `stateDiagram`
- **Journey Maps**: `journey`
- **Pie Charts**: `pie`
- **Git Graphs**: `gitgraph`
- **Entity Relationship**: `erDiagram`

### Usage
Create a code block with `mermaid` as the language:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

### Features
- **Real-Time Rendering**: See diagrams immediately in the preview
- **Error Handling**: Helpful error messages for invalid syntax
- **Export Support**: Diagrams are included in PDF and HTML exports
- **Responsive**: Diagrams scale appropriately for different screen sizes

## Fullscreen Editing Mode

Click the eye (👁) button to enter fullscreen mode for distraction-free editing:

### Features
- **Mode Switching**: Toggle between edit-only and preview-only modes
- **Smooth Transitions**: Beautiful animations for all mode changes
- **Floating Controls**: Clean interface with floating mode toggle buttons
- **Keyboard Exit**: Press `Escape` to exit fullscreen
- **Full Immersion**: All toolbars and status bars are hidden

### Controls in Fullscreen
- **✏️ Edit Mode**: Show only the editor for focused writing
- **👁 Preview Mode**: Show only the preview for reading
- **❌ Exit**: Return to normal dual-pane view
- **Keyboard**: Use `Escape` key to exit quickly

## Markdown Syntax Support

The editor supports full GitHub Flavored Markdown including:

- Headers (`#`, `##`, `###`, etc.)
- **Bold** and *italic* text
- `Inline code` and code blocks
- Lists (ordered and unordered)
- > Blockquotes
- [Links](https://example.com)
- ![Images](https://example.com/image.jpg)
- Tables
- Horizontal rules
- Strikethrough text
- Task lists
- And more!

## Customization

The editor uses CSS custom properties (variables) for easy theming. You can modify the color scheme by editing the CSS variables in `css/variables.css`.

### Modular Architecture
- **CSS Modules**: Separate files for different components
- **JavaScript Modules**: Clean separation of concerns
- **Extensible Design**: Easy to add new features
- **Future-Ready**: Architecture supports planned enhancements

## Development Roadmap

See `todo.md` for our comprehensive development roadmap including:

- **✅ Phase 1 Complete**: IndexedDB storage and file browser implemented
- **Phase 2**: Folder management and organization  
- **Phase 3**: Advanced editing features
- **Phase 4**: Cross-device sync and cloud integration
- **Phase 5**: Collaboration and sharing
- **Phase 6**: Customization and extensions

## Technical Documentation

- **`LOCALSTORAGE.md`**: Detailed localStorage implementation docs (legacy, now using IndexedDB)
- **`todo.md`**: Complete development roadmap and future plans
- **`test/`**: Test files and debugging tools

## Recent Updates

### Version 2.0 - IndexedDB & File Browser
- ✅ **IndexedDB Storage**: Upgraded from localStorage to IndexedDB for much larger capacity (50MB - several GB)
- ✅ **File Browser**: Beautiful modal interface to browse, search, and manage all saved files
- ✅ **Multiple Files**: Store and manage multiple markdown files in browser storage
- ✅ **Enhanced Clear Dialog**: New file dialog with 4 options: Save on Browser (default), Download, Cancel, Delete
- ✅ **Improved File Management**: Search files, view metadata, delete files, and open from browser or disk

## Browser Support

- **Chrome/Chromium**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Full support  
- **Edge**: Full support
- **Mobile Browsers**: Responsive design works on all modern mobile browsers
- **Requirements**: ES6+ support, localStorage, modern CSS features

## Performance

- **Offline-First**: Works completely offline
- **Fast Loading**: All dependencies included locally
- **Efficient Storage**: Debounced auto-save prevents performance issues
- **Responsive**: Smooth performance on all device types
- **Memory Efficient**: Modular architecture reduces memory footprint

## License

This project is open source and available under the MIT License.
