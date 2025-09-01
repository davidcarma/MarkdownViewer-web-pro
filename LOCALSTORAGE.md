# LocalStorage Implementation

## Data Structure

The Markdown Editor uses localStorage with a comprehensive data structure designed for future expansion to support multiple files and folders.

### Storage Key
```
markdown-editor-data
```

### Data Schema (v1.0)

```json
{
  "version": "1.0",
  "lastActiveFile": "untitled-md",
  "files": {
    "untitled-md": {
      "id": "untitled-md",
      "name": "Untitled.md",
      "content": "# Your markdown content...",
      "cursorPosition": 150,
      "isModified": false,
      "created": "2024-01-15T10:30:00.000Z",
      "modified": "2024-01-15T10:45:00.000Z",
      "size": 1024,
      "wordCount": 150,
      "lineCount": 25
    }
  },
  "settings": {
    "theme": "light",
    "autoSave": true,
    "saveInterval": 500
  },
  "metadata": {
    "created": "2024-01-15T10:30:00.000Z",
    "lastAccessed": "2024-01-15T10:45:00.000Z"
  }
}
```

## Features

### Current (v1.0)
- ✅ Auto-save on every change (debounced 500ms)
- ✅ File persistence between sessions
- ✅ Cursor position restoration
- ✅ File metadata tracking
- ✅ Storage quota monitoring
- ✅ Data export/import for backup

### Future Roadmap (v2.0+)
- 📁 **Multiple Files Support**
  - File browser interface
  - Recent files list
  - File search/filter

- 📂 **Folder Management**
  - Nested folder structure
  - Drag & drop organization
  - Folder-based navigation

- 🔄 **Advanced Features**
  - File templates
  - Auto-backup to external services
  - File sharing (via export links)
  - Version history/snapshots

## File ID Generation

Files are identified by slugified versions of their names:
- `"My Document.md"` → `"my-document-md"`
- `"Project Notes.md"` → `"project-notes-md"`
- `"Untitled.md"` → `"untitled-md"`

## Chrome Sync Compatibility

✅ **Chrome sync works with localStorage!** Your files will automatically sync across Chrome instances when you're signed into the same Google account.

### Sync Behavior:
- Files sync when you close/open Chrome
- Changes propagate within ~30 seconds
- Works across desktop and mobile Chrome
- Respects Chrome's storage quota limits

## Storage Limits

### Browser Quotas:
- **Chrome/Edge**: ~10MB per domain
- **Firefox**: ~10MB per domain  
- **Safari**: ~5-7MB per domain

### Monitoring:
```javascript
const info = editor.getStorageInfo();
console.log(`Using ${info.usedFormatted} of ${info.quotaFormatted} (${info.percentage}%)`);
```

## API Reference

### LocalStorageManager Methods

```javascript
// Core operations
saveCurrentFile(fileName, content, cursorPosition, isModified)
getCurrentFile()
autoSave(fileName, content, cursorPosition, isModified)

// File management (future)
getAllFiles()
deleteFile(fileId)  
renameFile(fileId, newName)

// Utilities
getStorageInfo()
exportData()
importData(jsonData)
clearAllData()
```

### Integration

The storage manager is automatically initialized in `core.js`:

```javascript
this.storageManager = new LocalStorageManager();
```

And files are auto-saved on every change:

```javascript
// Auto-save triggers:
- Text input/change
- Cursor movement  
- File name changes
- File operations
```

## Security & Privacy

- ✅ All data stays client-side
- ✅ No server communication
- ✅ Works offline completely  
- ✅ User controls all data
- ✅ Easy export/import for backup

## Migration Strategy

Future versions will include migration logic:

```javascript
if (data.version === "1.0") {
  // Migrate to v2.0 structure
  data = migrateToV2(data);
}
```

This ensures backward compatibility as new features are added.
