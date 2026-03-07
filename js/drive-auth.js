/**
 * Google Drive authentication via Google Identity Services (GIS).
 * Access token is persisted in localStorage (with expiry) so the connection
 * survives page refresh until the token expires. Disconnect or token expiry
 * clears the stored token. Graceful degradation if window.google is unavailable.
 *
 * Security: Only the OAuth access token and expiry are stored; no refresh token.
 * The host "signs" the app: whoever hosts the site creates an OAuth 2.0 client
 * in Google Cloud Console and adds their site URL to Authorized JavaScript origins.
 * End users only see Google's "Allow this app?" consent.
 *
 * Local testing: add your origin (e.g. http://localhost:3000) to the same OAuth
 * client. Do not use file://; run a local server (e.g. npm run serve) instead.
 */
(function () {
    'use strict';

    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const DRIVE_CLIENT_ID = '1024951916599-b6ku30grv851i9hcssn4ml9u1dqq84de.apps.googleusercontent.com';
    const STORAGE_KEY_LAST_EMAIL = 'markdownpro-drive-last-email';
    const STORAGE_KEY_LAST_AT = 'markdownpro-drive-last-at';
    const STORAGE_KEY_RECONNECT = 'markdownpro-drive-reconnect';
    const STORAGE_KEY_ACCESS_TOKEN = 'markdownpro-drive-access-token';
    const STORAGE_KEY_TOKEN_EXPIRES_AT = 'markdownpro-drive-token-expires-at';
    const TOKEN_EXPIRY_SKEW_MS = 60000;

    class DriveAuth {
        constructor() {
            this.token = null;
            this.userEmail = null;
            this.tokenClient = null;
            this._connecting = false;
            this._lastError = null;
            this._loadPersistedIdentity();
            this._loadPersistedSession();
        }

        _loadPersistedIdentity() {
            try {
                const email = localStorage.getItem(STORAGE_KEY_LAST_EMAIL);
                if (email) this.userEmail = email;
            } catch (_) {}
        }

        _persistIdentity(email) {
            try {
                if (email) {
                    localStorage.setItem(STORAGE_KEY_LAST_EMAIL, email);
                    localStorage.setItem(STORAGE_KEY_LAST_AT, new Date().toISOString());
                }
            } catch (_) {}
        }

        _loadPersistedSession() {
            try {
                const token = localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN);
                const expiresAtRaw = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
                const expiresAt = expiresAtRaw ? parseInt(expiresAtRaw, 10) : 0;
                if (token && expiresAt && Date.now() < expiresAt) {
                    this.token = token;
                    return;
                }
            } catch (_) {}
            this._clearPersistedSession();
        }

        _persistSession(accessToken, expiresInSeconds) {
            try {
                if (!accessToken) {
                    this._clearPersistedSession();
                    return;
                }
                const ttlSeconds = Math.max(parseInt(expiresInSeconds, 10) || 3600, 120);
                const expiresAt = Date.now() + (ttlSeconds * 1000) - TOKEN_EXPIRY_SKEW_MS;
                localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN, accessToken);
                localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRES_AT, String(expiresAt));
            } catch (_) {}
        }

        _clearPersistedSession() {
            try {
                localStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
                localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
            } catch (_) {}
        }

        _setReconnectPreference(enabled) {
            try {
                if (enabled) localStorage.setItem(STORAGE_KEY_RECONNECT, '1');
                else localStorage.removeItem(STORAGE_KEY_RECONNECT);
            } catch (_) {}
        }

        shouldAttemptReconnect() {
            try {
                return localStorage.getItem(STORAGE_KEY_RECONNECT) === '1';
            } catch (_) {
                return false;
            }
        }

        getLastConnectedEmail() {
            try {
                return localStorage.getItem(STORAGE_KEY_LAST_EMAIL) || null;
            } catch (_) {
                return null;
            }
        }

        isAvailable() {
            return !!(typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2);
        }

        isConnected() {
            return !!this.token;
        }

        isConnecting() {
            return !!this._connecting;
        }

        getToken() {
            return this.token;
        }

        getUserEmail() {
            return this.userEmail || null;
        }

        disconnect() {
            this.token = null;
            this.userEmail = null;
            this.tokenClient = null;
            this._connecting = false;
            this._lastError = null;
            this._clearPersistedSession();
            this._setReconnectPreference(false);
        }

        /** Call when the token is rejected (e.g. 401). Clears in-memory and stored token so reconnect is required. */
        invalidateSession() {
            this.token = null;
            this._clearPersistedSession();
        }

        getLastError() {
            return this._lastError || null;
        }

        connect() {
            return this._requestToken({ interactive: true });
        }

        silentConnect() {
            return this._requestToken({ interactive: false });
        }

        _requestToken({ interactive }) {
            if (!this.isAvailable()) {
                return Promise.resolve({ ok: false });
            }
            if (this.token) {
                return Promise.resolve({ ok: true });
            }
            if (this._connecting) {
                return Promise.resolve({ ok: false });
            }
            if (DRIVE_CLIENT_ID === 'YOUR_CLIENT_ID' || !DRIVE_CLIENT_ID.trim()) {
                if (typeof console !== 'undefined') {
                    console.warn('Drive: Set DRIVE_CLIENT_ID in js/drive-auth.js to enable Google Drive.');
                }
                return Promise.resolve({ ok: false });
            }

            this._connecting = true;

            return new Promise((resolve) => {
                let settled = false;
                const settle = (ok) => {
                    if (settled) return;
                    settled = true;
                    this._connecting = false;
                    resolve({ ok: !!ok });
                };
                // If the popup is blocked or the user closes it without choosing, the callback may never run. Clear after 90s.
                const timeout = setTimeout(() => {
                    this._lastError = this._lastError || 'Timed out (popup blocked or closed without signing in?)';
                    settle(false);
                }, 90000);
                try {
                    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: DRIVE_CLIENT_ID,
                        scope: DRIVE_SCOPE,
                        error_callback: (error) => {
                            clearTimeout(timeout);
                            const reason =
                                (error && (error.message || error.type || error.error || error.details)) ||
                                'Google sign-in failed before authorisation completed';
                            this._lastError = String(reason);
                            settle(false);
                        },
                        callback: (response) => {
                            clearTimeout(timeout);
                            if (response && response.access_token) {
                                this._lastError = null;
                                this.token = response.access_token;
                                this._persistSession(response.access_token, response.expires_in);
                                // Do not call Drive "about" here. The drive.file scope is enough
                                // for file operations, but it can still 403 on metadata endpoints
                                // like /about, which creates noisy console errors after a valid login.
                                this._setReconnectPreference(true);
                                this._persistIdentity(this.userEmail);
                                settle(true);
                            } else {
                                const responseDetail = response
                                    ? (response.error_description || response.error || JSON.stringify(response))
                                    : '';
                                this._lastError = responseDetail || 'Sign-in was cancelled or failed';
                                settle(false);
                            }
                        }
                    });
                    this.tokenClient.requestAccessToken(
                        interactive
                            ? { prompt: 'consent' }
                            : { prompt: '' }
                    );
                } catch (err) {
                    clearTimeout(timeout);
                    if (typeof console !== 'undefined') {
                        console.warn('Drive auth error:', err);
                    }
                    this._lastError = err && err.message ? err.message : 'Sign-in failed';
                    settle(false);
                }
            });
        }

        ensureToken(callback) {
            if (!this.isAvailable() || !this.token) {
                if (typeof callback === 'function') callback(null);
                return;
            }
            if (typeof callback === 'function') callback(this.token);
        }
    }

    window.DriveAuth = DriveAuth;
})();
