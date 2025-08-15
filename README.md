# Markdown Editor

A fully-featured, modern Markdown editor with live preview built with HTML, CSS, and JavaScript.

## Features

### Core Functionality
- **Real-time Preview**: See your markdown rendered as you type
- **Split Pane Layout**: Editor and preview side-by-side with resizable divider
- **Syntax Highlighting**: Code blocks are highlighted using highlight.js
- **File Operations**: New, Open, and Save markdown files
- **Drag & Drop Support**: Drop markdown files directly onto the editor
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
- **Visual Feedback**: Drag-over effects and success/error notifications
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
