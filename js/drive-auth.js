/**
 * Google Drive authentication via Google Identity Services (GIS).
 * Token kept in memory only. Graceful degradation if window.google is unavailable.
 *
 * The host "signs" the app: whoever hosts the site creates an OAuth 2.0 client in
 * Google Cloud Console and adds their site URL to Authorized JavaScript origins.
 * That tells Google this origin is allowed to use the client. End users only see
 * Google's "Allow this app?" consent; they never touch the Console.
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

    class DriveAuth {
        constructor() {
            this.token = null;
            this.userEmail = null;
            this.tokenClient = null;
            this._connecting = false;
            this._lastError = null;
            this._loadPersistedIdentity();
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
                } else {
                    localStorage.removeItem(STORAGE_KEY_LAST_EMAIL);
                    localStorage.removeItem(STORAGE_KEY_LAST_AT);
                }
            } catch (_) {}
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
            // Keep persisted last email so we can show "Reconnect as x@..."; clear only if you want full sign-out UX later.
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
                                this._fetchUserEmail()
                                    .then(() => {
                                        this._persistIdentity(this.userEmail);
                                        settle(true);
                                    })
                                    .catch(() => {
                                        this._persistIdentity(this.userEmail);
                                        settle(true);
                                    });
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

        _fetchUserEmail() {
            if (!this.token) return Promise.resolve();
            return fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                headers: { Authorization: 'Bearer ' + this.token }
            })
                .then((res) => res.ok ? res.json() : null)
                .then((data) => {
                    if (data && data.user && data.user.emailAddress) {
                        this.userEmail = data.user.emailAddress;
                    }
                })
                .catch(() => {});
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
