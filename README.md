# Markdown Editor

A fully-featured, modern Markdown editor with live preview built with HTML, CSS, and JavaScript.

## Features

### Core Functionality
- **Real-time Preview**: See your markdown rendered as you type
- **Split Pane Layout**: Editor and preview side-by-side with resizable divider
- **Syntax Highlighting**: Code blocks are highlighted using highlight.js
- **File Operations**: New, Open, and Save markdown files
- **Drag & Drop Support**: Drop markdown files directly onto the editor
- **Image Paste Support**: Paste images from clipboard as embedded inline images
- **Image Widget System**: Collapse long data URLs into moveable image objects
- **Auto-save Indication**: Visual feedback for unsaved changes

### Editor Features
- **Format Toolbar**: Quick access to common markdown formatting
- **Keyboard Shortcuts**: 
  - `Ctrl/Cmd + N`: New file
  - `Ctrl/Cmd + O`: Open file
  - `Ctrl/Cmd + S`: Save file
  - `Ctrl/Cmd + B`: Bold text
  - `Ctrl/Cmd + I`: Italic text
  - `Tab`: Indent text
  - `Shift + Tab`: Unindent text
- **Auto-completion**: Automatic closing of brackets, quotes, and parentheses
- **Smart Indentation**: Proper tab handling for code blocks and lists
- **Line Numbers & Statistics**: Real-time word count, character count, and line count
- **Cursor Position**: Shows current line and column

### UI/UX Features
- **Dark/Light Theme**: Toggle between themes with persistent preference
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Modern Interface**: Clean, professional design with intuitive controls
- **Smart File Handling**: Confirmation dialog for unsaved changes when dropping files
- **Visual Feedback**: Drag-over effects, image processing indicators, and success/error notifications
- **Embedded Images**: Pasted images are converted to data URLs for self-contained documents
- **Image Widgets**: Collapsible image objects that can be moved, deleted, and expanded
- **Dual View Modes**: Switch between widget view and raw markdown view
- **Copy HTML**: Export rendered HTML to clipboard
- **Print Support**: Optimized print styles for preview content

### Advanced Features
- **Scroll Synchronization**: Preview scrolls with editor
- **Format Buttons**: Quick formatting for:
  - Headers (H1, H2, H3)
  - Bold, Italic, Code
  - Lists (Bullet, Numbered)
  - Quotes, Links, Images
  - Tables
- **GitHub Flavored Markdown**: Full GFM support including tables and code blocks
- **Accessibility**: Keyboard navigation and screen reader support

## Usage

1. **Open the Editor**: Open `index.html` in any modern web browser
2. **Start Writing**: Begin typing markdown in the left pane
3. **Live Preview**: See the rendered output in the right pane
4. **Format Text**: Use the toolbar buttons or keyboard shortcuts
5. **Save Your Work**: Use Ctrl/Cmd+S or the save button
6. **Open Files**: Use Ctrl/Cmd+O or the open button to load existing markdown files
7. **Drag & Drop**: Simply drag a markdown file from your file system and drop it onto the editor pane
8. **Paste Images**: Copy any image to clipboard and paste (Ctrl/Cmd+V) directly into the editor

## File Structure

```
Md viewer/
├── index.html          # Main HTML file
├── styles.css          # CSS styling and themes
├── script.js           # JavaScript functionality
├── marked.min.js       # Markdown parsing library
├── highlight.min.js    # Syntax highlighting library
├── highlight.min.css   # Syntax highlighting styles
└── README.md          # This file
```

## Dependencies

All dependencies are included locally (downloaded via curl):

- **Marked.js**: Fast markdown parser and compiler
- **Highlight.js**: Syntax highlighting for code blocks

## Browser Support

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge
- Any modern browser with ES6+ support

## Keyboard Shortcuts Reference

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New file |
| `Ctrl/Cmd + O` | Open file |
| `Ctrl/Cmd + S` | Save file |
| `Ctrl/Cmd + B` | Bold selected text |
| `Ctrl/Cmd + I` | Italic selected text |
| `Tab` | Indent line/selection |
| `Shift + Tab` | Unindent line/selection |

## Drag & Drop Feature

The editor supports intuitive drag and drop functionality for opening markdown files:

### How it Works
1. **Drag a File**: Select any markdown file (`.md`, `.txt`, `.markdown`) from your file system
2. **Drop on Editor**: Drag the file over the editor pane (left side) - you'll see a visual indicator
3. **Smart Handling**: If you have unsaved changes, you'll get a dialog with three options:
   - **Cancel**: Keep current file, don't load the dropped file
   - **Save Current & Load New**: Save your current work first, then load the dropped file
   - **Replace Without Saving**: Discard current changes and load the dropped file

### Supported File Types
- `.md` (Markdown files)
- `.txt` (Plain text files) 
- `.markdown` (Markdown files with full extension)
- Files with `text/markdown` or `text/plain` MIME types

### Visual Feedback
- **Drag Over**: The editor pane highlights with a blue dashed border and shows "Drop markdown file here"
- **Success**: Green notification confirms the file was loaded
- **Error**: Red notification shows if there's an issue (wrong file type, read error, etc.)

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

The editor uses CSS custom properties (variables) for easy theming. You can modify the color scheme by editing the CSS variables in `styles.css`.

## License

This project is open source and available under the MIT License.
