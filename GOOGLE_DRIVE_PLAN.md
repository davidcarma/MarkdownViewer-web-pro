# Google Drive Integration Plan

## Goal

Add client-side Google Drive save/load to Markdown Pro (static GitHub Pages site).
No server, no Node backend - pure browser OAuth using Google Identity Services (GIS) + Drive REST API.

## How it works

1. User clicks "Connect Drive" - Google OAuth popup appears
2. Token stored in memory (never sent anywhere)
3. App can create/read/update `.md` files in a chosen Drive folder
4. Auto-save on edit (debounced), just like the existing IndexedDB save

## What already exists

- `js/storage-manager.js` - current local/IndexedDB storage layer - Drive becomes a second backend here
- `js/file-operations.js` - open/save file logic - Drive files slot in alongside local files
- `~/code/GoogleDocAPIFE/` - prior experiment with `gapi` + Drive, reuse the auth pattern from there

## Files to create

| File | Purpose |
|---|---|
| `js/drive-auth.js` | GIS OAuth flow, token management, connect/disconnect |
| `js/drive-storage.js` | Drive REST calls: list, read, create, update files in a folder |
| `js/drive-picker.js` | Google Picker UI for browsing/selecting Drive files |

## Changes to existing files

- `js/storage-manager.js` - add Drive as optional storage backend alongside IndexedDB
- `js/file-operations.js` - add "Open from Drive" / "Save to Drive" actions
- `index.html` - add GIS + GAPI script tags, Drive button in toolbar
- `css/toolbar.css` - style the Drive connect button (green when connected)

## Google Cloud setup (one-time)

1. Go to console.cloud.google.com
2. Create OAuth 2.0 Client ID - type: **Web application**
3. Add authorized JS origins: `https://davidcarma.github.io`
4. Add authorized redirect URIs: `https://davidcarma.github.io/MarkdownViewer-web-pro/`
5. Enable: **Google Drive API** and **Google Picker API**
6. Paste the Client ID into `js/drive-auth.js`

## Auth approach

Use the newer **GIS (Google Identity Services)** token model - no redirect, popup only:

```js
const client = google.accounts.oauth2.initTokenClient({
  client_id: 'YOUR_CLIENT_ID',
  scope: 'https://www.googleapis.com/auth/drive.file',
  callback: (response) => { /* store token, enable Drive UI */ }
});
client.requestAccessToken();
```

Scope: `drive.file` only - app can only see files it created. Safe, minimal, no access to the user's entire Drive.

## Save flow

```
User edits markdown
  -> debounce 2s
  -> if Drive connected AND file has a driveFileId
       -> PATCH /drive/v3/files/{id} (update content)
  -> else
       -> POST /drive/v3/files (create new file, store returned id)
```

## Folder strategy

- On first save, create a `MarkdownPro/` folder in Drive root (if not exists)
- All files saved there by default
- User can pick a different folder via Picker

## Reference

- GIS docs: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Drive REST API: https://developers.google.com/drive/api/v3/reference/files
- Prior experiment: `~/code/GoogleDocAPIFE/app.js` + `config.js`
