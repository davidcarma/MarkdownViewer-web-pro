# Google Drive Integration Plan

## Goal

Add client-side Google Drive save/load to Markdown Pro (static GitHub Pages site).
Browser-side OAuth using Google Identity Services (GIS) + Drive REST API. Uses the
authorization code flow with refresh tokens so sessions persist indefinitely. No
backend server required - the browser calls Google's token endpoint directly.

## Architecture

```
First-time connect:
  Browser --> GIS initCodeClient (popup) --> authorization code
  Browser --> Google token endpoint (code + client_id + client_secret)
  Google  --> { access_token, refresh_token, expires_in }
  Browser stores both tokens in localStorage

Token refresh (on expiry, page load, or tab reactivation):
  Browser --> Google token endpoint (refresh_token + client_id + client_secret)
  Google  --> { access_token, expires_in }
  Browser updates stored access token
```

No server, no proxy. The client_secret is embedded in drive-auth.js. This is the
same pattern used by open-source desktop/Electron apps with the drive.file scope -
an attacker who extracts the secret still cannot access any user's Drive without
that user authorizing the app first.

## How it works

1. User clicks "Connect Drive" - Google OAuth popup appears (authorization code flow)
2. Auth code is exchanged for tokens directly at Google's token endpoint
3. Access token (1 hour) and refresh token (permanent) stored in localStorage
4. App can create/read/update `.md` files in a chosen Drive folder
5. Access token is silently refreshed before expiry
6. Session persists across page reloads, tab closes, and browser restarts

## What already exists

- `js/storage-manager.js` - current local/IndexedDB storage layer - Drive becomes a second backend here
- `js/file-operations.js` - open/save file logic - Drive files slot in alongside local files

## Files

| File | Purpose |
|---|---|
| `js/drive-auth.js` | GIS code flow, direct token exchange/refresh, token persistence |
| `js/drive-storage.js` | Drive REST calls: list, read, create, update files in a folder |
| `js/drive-picker.js` | Google Picker UI for browsing/selecting Drive files |

## Changes to existing files

- `js/app.js` - Drive init, reconnect flow, toolbar button
- `index.html` - GIS script tag, Drive button in toolbar
- `css/toolbar.css` - Drive connect button styles

## Google Cloud setup (one-time)

1. console.cloud.google.com > APIs & Services > Credentials
2. OAuth 2.0 Client ID - type: **Web application**
3. Authorized JS origins: `https://markdownpro.eyesondash.com`, `https://davidcarma.github.io`
4. Enabled APIs: **Google Drive API**, **Google Picker API**
5. Client ID is in `js/drive-auth.js` (public, safe to commit)
6. Client secret is in `js/drive-auth.js` `DRIVE_CLIENT_SECRET` constant - paste it from the OAuth client credentials page

## Auth approach

Uses the GIS **authorization code** model with direct browser-side token exchange:

```js
const codeClient = google.accounts.oauth2.initCodeClient({
    client_id: DRIVE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    ux_mode: 'popup',
    callback: async (response) => {
        // Exchange auth code directly at Google's token endpoint
        const tokens = await exchangeCode(response.code);
        // tokens.access_token + tokens.refresh_token stored in localStorage
    }
});
codeClient.requestCode();
```

Scope: `drive.file` only - app can only see files it created. Safe, minimal, no access to the user's entire Drive.

Fallback: if `DRIVE_CLIENT_SECRET` is not set, the implicit grant flow via
`initTokenClient` is used as a degraded fallback (1-hour sessions, unreliable
silent refresh).

## Token refresh

- Background timer checks every 30 seconds; refreshes when within 5 minutes of expiry
- `visibilitychange` and `focus` handlers trigger immediate refresh when tab reactivates
- Grace period: expired access tokens kept for up to 10 minutes in case they still work
- Retry: refresh attempts retry 3 times with exponential backoff
- Refresh tokens are permanent (until user revokes in Google account settings)

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

- On first save, create a `Markdown-pro/` folder in Drive (if not exists)
- All files saved there by default
- Duplicate folders are detected and merged automatically

## Reference

- GIS code model docs: https://developers.google.com/identity/oauth2/web/guides/use-code-model
- GIS token model docs: https://developers.google.com/identity/oauth2/web/guides/use-token-model
- Drive REST API: https://developers.google.com/drive/api/v3/reference/files
