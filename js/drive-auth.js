/**
 * Google Drive authentication via Google Identity Services (GIS).
 *
 * Uses the authorization code flow: the browser gets an auth code via a Google
 * popup, then exchanges it directly at Google's token endpoint for an access
 * token and a long-lived refresh token. Both are stored in localStorage so the
 * session persists across page reloads, tab closes, and browser restarts -
 * indefinitely, until the user explicitly disconnects or revokes access.
 *
 * The client_secret is embedded here. For a public OAuth client with the
 * narrow drive.file scope this is an accepted trade-off (same pattern used by
 * open-source desktop/Electron apps). An attacker who extracts it still cannot
 * access any user's Drive without that user authorizing the app first.
 */
(function () {
    'use strict';

    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const DRIVE_CLIENT_ID = '1024951916599-iindkjk3tnmdffir4qm9ahe1hnfrlmi4.apps.googleusercontent.com';
    const DRIVE_CLIENT_SECRET = 'GOCSPX-PLACEHOLDER';
    const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

    const STORAGE_KEY_LAST_EMAIL = 'markdownpro-drive-last-email';
    const STORAGE_KEY_LAST_AT = 'markdownpro-drive-last-at';
    const STORAGE_KEY_RECONNECT = 'markdownpro-drive-reconnect';
    const STORAGE_KEY_ACCESS_TOKEN = 'markdownpro-drive-access-token';
    const STORAGE_KEY_TOKEN_EXPIRES_AT = 'markdownpro-drive-token-expires-at';
    const STORAGE_KEY_REFRESH_TOKEN = 'markdownpro-drive-refresh-token';

    const TOKEN_EXPIRY_SKEW_MS = 60000;
    const TOKEN_EXPIRED_GRACE_MS = 600000;
    const REFRESH_RETRY_ATTEMPTS = 3;
    const REFRESH_RETRY_BASE_MS = 1500;

    class DriveAuth {
        constructor() {
            this.token = null;
            this.userEmail = null;
            this._codeClient = null;
            this._connecting = false;
            this._refreshing = false;
            this._lastError = null;
            this._expiryTimer = null;
            this._boundVisibilityHandler = null;
            this._boundFocusHandler = null;
            this._needsImmediateRefresh = false;
            this._loadPersistedIdentity();
            this._loadPersistedSession();
            if (this.token) this._startExpiryWatch();
            this._setupVisibilityHandlers();
        }

        // -- Persistence helpers --

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
                if (token && expiresAt) {
                    const now = Date.now();
                    if (now < expiresAt) {
                        this.token = token;
                        return;
                    }
                    if (now < expiresAt + TOKEN_EXPIRED_GRACE_MS) {
                        this.token = token;
                        this._needsImmediateRefresh = true;
                        return;
                    }
                }
            } catch (_) {}
            this._clearPersistedAccessToken();
        }

        _persistSession(accessToken, expiresInSeconds) {
            try {
                if (!accessToken) {
                    this._clearPersistedAccessToken();
                    return;
                }
                const ttlSeconds = Math.max(parseInt(expiresInSeconds, 10) || 3600, 120);
                const expiresAt = Date.now() + (ttlSeconds * 1000) - TOKEN_EXPIRY_SKEW_MS;
                localStorage.setItem(STORAGE_KEY_ACCESS_TOKEN, accessToken);
                localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRES_AT, String(expiresAt));
            } catch (_) {}
        }

        _clearPersistedAccessToken() {
            try {
                localStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
                localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
            } catch (_) {}
        }

        _getStoredRefreshToken() {
            try {
                return localStorage.getItem(STORAGE_KEY_REFRESH_TOKEN) || null;
            } catch (_) {
                return null;
            }
        }

        _persistRefreshToken(refreshToken) {
            try {
                if (refreshToken) localStorage.setItem(STORAGE_KEY_REFRESH_TOKEN, refreshToken);
                else localStorage.removeItem(STORAGE_KEY_REFRESH_TOKEN);
            } catch (_) {}
        }

        _clearAllPersistedTokens() {
            this._clearPersistedAccessToken();
            this._persistRefreshToken(null);
        }

        _getExpiresAt() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
                return raw ? parseInt(raw, 10) : 0;
            } catch (_) {
                return 0;
            }
        }

        // -- Expiry watch (background timer + visibility handlers) --

        _startExpiryWatch() {
            this._stopExpiryWatch();
            this._expiryTimer = setInterval(() => {
                if (!this.token && !this._getStoredRefreshToken() && !this.shouldAttemptReconnect()) {
                    this._stopExpiryWatch();
                    return;
                }
                if (!this.token) {
                    this._tryAutoRefresh();
                    return;
                }
                const expiresAt = this._getExpiresAt();
                if (!expiresAt) return;
                const remaining = expiresAt - Date.now();
                if (remaining <= 300000) {
                    this._tryAutoRefresh();
                }
            }, 30000);
        }

        _stopExpiryWatch() {
            if (this._expiryTimer) {
                clearInterval(this._expiryTimer);
                this._expiryTimer = null;
            }
        }

        _setupVisibilityHandlers() {
            this._boundVisibilityHandler = () => {
                if (document.visibilityState === 'visible') this._onTabReactivated();
            };
            this._boundFocusHandler = () => this._onTabReactivated();
            document.addEventListener('visibilitychange', this._boundVisibilityHandler);
            window.addEventListener('focus', this._boundFocusHandler);
        }

        _teardownVisibilityHandlers() {
            if (this._boundVisibilityHandler) {
                document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
                this._boundVisibilityHandler = null;
            }
            if (this._boundFocusHandler) {
                window.removeEventListener('focus', this._boundFocusHandler);
                this._boundFocusHandler = null;
            }
        }

        _onTabReactivated() {
            if (!this.token && !this._getStoredRefreshToken()) return;
            const expiresAt = this._getExpiresAt();
            const remaining = expiresAt ? expiresAt - Date.now() : -1;
            if (!this.token || remaining <= 300000) {
                this._tryAutoRefresh();
            }
        }

        async _tryAutoRefresh() {
            if (this._refreshing || this._connecting) return;
            this._refreshing = true;
            try {
                await this.refreshToken();
            } finally {
                this._refreshing = false;
            }
        }

        // -- Direct token exchange with Google's endpoint --

        _hasCodeFlowCredentials() {
            return !!(DRIVE_CLIENT_SECRET && DRIVE_CLIENT_SECRET !== 'GOCSPX-PLACEHOLDER');
        }

        async _exchangeCode(code) {
            const res = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: DRIVE_CLIENT_ID,
                    client_secret: DRIVE_CLIENT_SECRET,
                    redirect_uri: 'postmessage',
                    grant_type: 'authorization_code'
                })
            });
            const data = await res.json();
            if (data.error) {
                throw new Error(data.error_description || data.error);
            }
            return data;
        }

        async _refreshViaEndpoint(refreshToken) {
            const res = await fetch(TOKEN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: refreshToken,
                    client_id: DRIVE_CLIENT_ID,
                    client_secret: DRIVE_CLIENT_SECRET,
                    grant_type: 'refresh_token'
                })
            });
            const data = await res.json();
            if (data.error) {
                const err = new Error(data.error_description || data.error);
                err.code = data.error;
                throw err;
            }
            return data;
        }

        // -- Token refresh --

        async refreshToken() {
            const storedRefresh = this._getStoredRefreshToken();

            if (this._hasCodeFlowCredentials() && storedRefresh) {
                return this._refreshWithRetry(storedRefresh);
            }

            return this._refreshViaGIS();
        }

        async _refreshWithRetry(storedRefresh) {
            const previousToken = this.token;
            for (let i = 0; i < REFRESH_RETRY_ATTEMPTS; i++) {
                try {
                    const data = await this._refreshViaEndpoint(storedRefresh);
                    this._lastError = null;
                    this._needsImmediateRefresh = false;
                    this.token = data.access_token;
                    this._persistSession(data.access_token, data.expires_in);
                    if (data.refresh_token) this._persistRefreshToken(data.refresh_token);
                    this._startExpiryWatch();
                    this._notifyAuthChange();
                    return { ok: true };
                } catch (err) {
                    if (err.code === 'invalid_grant') {
                        this._persistRefreshToken(null);
                        this.token = null;
                        this._clearPersistedAccessToken();
                        this._lastError = 'Refresh token revoked. Please reconnect.';
                        this._notifyAuthChange();
                        return { ok: false };
                    }
                    if (i < REFRESH_RETRY_ATTEMPTS - 1) {
                        await new Promise((r) => setTimeout(r, REFRESH_RETRY_BASE_MS * Math.pow(2, i)));
                    }
                }
            }
            if (previousToken) this.token = previousToken;
            this._lastError = 'Token refresh failed after retries';
            return { ok: false };
        }

        async _refreshViaGIS() {
            const previousToken = this.token;
            this.token = null;
            const result = await this._requestTokenViaGIS({ interactive: false });
            if (!result.ok && previousToken) {
                this.token = previousToken;
            }
            return result;
        }

        _notifyAuthChange() {
            try {
                window.dispatchEvent(new CustomEvent('drive-auth-changed', {
                    detail: { connected: this.isConnected() }
                }));
            } catch (_) {}
        }

        // -- Reconnect preference --

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

        hasRefreshToken() {
            return !!this._getStoredRefreshToken();
        }

        needsImmediateRefresh() {
            return !!this._needsImmediateRefresh;
        }

        getLastConnectedEmail() {
            try {
                return localStorage.getItem(STORAGE_KEY_LAST_EMAIL) || null;
            } catch (_) {
                return null;
            }
        }

        // -- Public API --

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
            this._codeClient = null;
            this._connecting = false;
            this._refreshing = false;
            this._lastError = null;
            this._needsImmediateRefresh = false;
            this._stopExpiryWatch();
            this._teardownVisibilityHandlers();
            this._clearAllPersistedTokens();
            this._setReconnectPreference(false);
            this._notifyAuthChange();
        }

        invalidateSession() {
            this.token = null;
            this._clearPersistedAccessToken();
            this._notifyAuthChange();
        }

        getLastError() {
            return this._lastError || null;
        }

        // -- Connect (interactive) --

        async connect() {
            if (this._hasCodeFlowCredentials() && this._getStoredRefreshToken()) {
                const result = await this.refreshToken();
                if (result.ok) return result;
            }

            if (this._hasCodeFlowCredentials()) {
                return this._connectViaCodeFlow();
            }

            return this._connectViaGIS();
        }

        async _connectViaCodeFlow() {
            if (!this.isAvailable()) return { ok: false };
            if (this.token) return { ok: true };
            if (this._connecting) return { ok: false };

            this._connecting = true;

            return new Promise((resolve) => {
                let settled = false;
                const settle = (ok) => {
                    if (settled) return;
                    settled = true;
                    this._connecting = false;
                    resolve({ ok: !!ok });
                };

                const timeout = setTimeout(() => {
                    this._lastError = 'Timed out (popup blocked or closed without signing in?)';
                    settle(false);
                }, 90000);

                try {
                    this._codeClient = window.google.accounts.oauth2.initCodeClient({
                        client_id: DRIVE_CLIENT_ID,
                        scope: DRIVE_SCOPE,
                        ux_mode: 'popup',
                        error_callback: (error) => {
                            clearTimeout(timeout);
                            const reason =
                                (error && (error.message || error.type || error.error || error.details)) ||
                                'Google sign-in failed before authorisation completed';
                            this._lastError = String(reason);
                            settle(false);
                        },
                        callback: async (response) => {
                            clearTimeout(timeout);
                            if (response && response.code) {
                                try {
                                    const data = await this._exchangeCode(response.code);
                                    this._lastError = null;
                                    this._needsImmediateRefresh = false;
                                    this.token = data.access_token;
                                    this._persistSession(data.access_token, data.expires_in);
                                    if (data.refresh_token) this._persistRefreshToken(data.refresh_token);
                                    this._setReconnectPreference(true);
                                    this._persistIdentity(this.userEmail);
                                    this._startExpiryWatch();
                                    this._notifyAuthChange();
                                    settle(true);
                                } catch (err) {
                                    this._lastError = err.message || 'Token exchange failed';
                                    settle(false);
                                }
                            } else {
                                const detail = response
                                    ? (response.error_description || response.error || JSON.stringify(response))
                                    : '';
                                this._lastError = detail || 'Sign-in was cancelled or failed';
                                settle(false);
                            }
                        }
                    });
                    this._codeClient.requestCode();
                } catch (err) {
                    clearTimeout(timeout);
                    this._lastError = err && err.message ? err.message : 'Sign-in failed';
                    settle(false);
                }
            });
        }

        // -- GIS implicit flow fallback (used when client_secret is not configured) --

        async _connectViaGIS() {
            if (this.shouldAttemptReconnect()) {
                const silent = await this._requestTokenViaGIS({ interactive: false });
                if (silent.ok) return silent;
            }
            return this._requestTokenViaGIS({ interactive: true });
        }

        silentConnect() {
            if (this._hasCodeFlowCredentials() && this._getStoredRefreshToken()) {
                return this.refreshToken();
            }
            return this._requestTokenViaGIS({ interactive: false });
        }

        _requestTokenViaGIS({ interactive }) {
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
                const timeoutMs = interactive ? 90000 : 15000;
                const timeout = setTimeout(() => {
                    this._lastError = this._lastError || (interactive
                        ? 'Timed out (popup blocked or closed without signing in?)'
                        : 'Silent token request timed out');
                    settle(false);
                }, timeoutMs);
                try {
                    const tokenClient = window.google.accounts.oauth2.initTokenClient({
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
                                this._needsImmediateRefresh = false;
                                this.token = response.access_token;
                                this._persistSession(response.access_token, response.expires_in);
                                this._setReconnectPreference(true);
                                this._persistIdentity(this.userEmail);
                                this._startExpiryWatch();
                                this._notifyAuthChange();
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
                    tokenClient.requestAccessToken(
                        interactive ? { prompt: 'consent' } : { prompt: '' }
                    );
                } catch (err) {
                    clearTimeout(timeout);
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
