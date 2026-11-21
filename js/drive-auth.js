/** Drive uses GIS short-lived access tokens, scoped to this tab session. */
(function () {
    'use strict';

    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const DRIVE_CLIENT_ID = '1024951916599-iindkjk3tnmdffir4qm9ahe1hnfrlmi4.apps.googleusercontent.com';
    const STORAGE_KEY_LAST_EMAIL = 'markdownpro-drive-last-email';
    const STORAGE_KEY_LAST_AT = 'markdownpro-drive-last-at';
    const STORAGE_KEY_RECONNECT = 'markdownpro-drive-reconnect';
    const STORAGE_KEY_ACCESS_TOKEN = 'markdownpro-drive-access-token';
    const STORAGE_KEY_TOKEN_EXPIRES_AT = 'markdownpro-drive-token-expires-at';
    const STORAGE_KEY_REFRESH_TOKEN = 'markdownpro-drive-refresh-token';

    const TOKEN_EXPIRY_SKEW_MS = 60000;
    class DriveAuth {
        constructor() {
            this.token = null;
            this.userEmail = null;
            this._authGeneration = 0;
            this._connecting = false;
            this._refreshing = false;
            this._lastError = null;
            this._expiryTimer = null;
            this._boundVisibilityHandler = null;
            this._boundFocusHandler = null;
            // Discard credentials left by the old authorization-code flow; never migrate them.
            try {
                for (const key of [STORAGE_KEY_REFRESH_TOKEN, STORAGE_KEY_ACCESS_TOKEN,
                    STORAGE_KEY_TOKEN_EXPIRES_AT, STORAGE_KEY_RECONNECT]) localStorage.removeItem(key);
            } catch (_) {}
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
                const token = sessionStorage.getItem(STORAGE_KEY_ACCESS_TOKEN);
                const expiresAtRaw = sessionStorage.getItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
                const expiresAt = expiresAtRaw ? parseInt(expiresAtRaw, 10) : 0;
                if (token && expiresAt) {
                    const now = Date.now();
                    if (now < expiresAt) {
                        this.token = token;
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
                sessionStorage.setItem(STORAGE_KEY_ACCESS_TOKEN, accessToken);
                sessionStorage.setItem(STORAGE_KEY_TOKEN_EXPIRES_AT, String(expiresAt));
            } catch (_) {}
        }

        _clearPersistedAccessToken() {
            try {
                sessionStorage.removeItem(STORAGE_KEY_ACCESS_TOKEN);
                sessionStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
            } catch (_) {}
        }

        _getExpiresAt() {
            try {
                const raw = sessionStorage.getItem(STORAGE_KEY_TOKEN_EXPIRES_AT);
                return raw ? parseInt(raw, 10) : 0;
            } catch (_) {
                return 0;
            }
        }

        // -- Expiry watch (background timer + visibility handlers) --

        _startExpiryWatch() {
            this._stopExpiryWatch();
            this._expiryTimer = setInterval(() => {
                if (!this.token && !this.shouldAttemptReconnect()) {
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
            if (!this.token && !this.shouldAttemptReconnect()) return;
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

        async refreshToken() {
            return this._requestTokenViaGIS({ interactive: false, renew: true });
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
                if (enabled) sessionStorage.setItem(STORAGE_KEY_RECONNECT, '1');
                else sessionStorage.removeItem(STORAGE_KEY_RECONNECT);
            } catch (_) {}
        }

        shouldAttemptReconnect() {
            try {
                return sessionStorage.getItem(STORAGE_KEY_RECONNECT) === '1';
            } catch (_) {
                return false;
            }
        }

        hasRefreshToken() {
            return false; // GIS token clients do not issue refresh tokens.
        }

        needsImmediateRefresh() {
            return this.isConnected() && this._getExpiresAt() <= Date.now() + 300000;
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
            this._authGeneration++;
            this._connecting = false;
            this._refreshing = false;
            this._lastError = null;
            this._stopExpiryWatch();
            this._teardownVisibilityHandlers();
            this._clearPersistedAccessToken();
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
            if (this.shouldAttemptReconnect()) {
                const generation = this._authGeneration;
                const silent = await this._requestTokenViaGIS({ interactive: false });
                if (silent.ok || generation !== this._authGeneration) return silent;
            }
            return this._requestTokenViaGIS({ interactive: true });
        }

        silentConnect() {
            return this._requestTokenViaGIS({ interactive: false });
        }

        _requestTokenViaGIS({ interactive, renew = false }) {
            if (!this.isAvailable()) {
                return Promise.resolve({ ok: false });
            }
            if (this.token && !renew) {
                return Promise.resolve({ ok: true });
            }
            if (this._connecting) {
                return Promise.resolve({ ok: false });
            }
            if (DRIVE_CLIENT_ID === 'YOUR_CLIENT_ID' || !DRIVE_CLIENT_ID.trim()) {
                return Promise.resolve({ ok: false });
            }

            const generation = this._authGeneration;
            this._connecting = true;

            return new Promise((resolve) => {
                let settled = false;
                const settle = (ok) => {
                    if (settled) return;
                    settled = true;
                    if (generation === this._authGeneration) this._connecting = false;
                    resolve({ ok: !!ok });
                };
                const timeoutMs = interactive ? 90000 : 15000;
                const timeout = setTimeout(() => {
                    if (generation !== this._authGeneration) return settle(false);
                    this._lastError = this._lastError || (interactive
                        ? 'Timed out (popup blocked or closed without signing in?)'
                        : 'Silent token request timed out');
                    settle(false);
                }, timeoutMs);
                try {
                    const tokenClient = window.google.accounts.oauth2.initTokenClient({
                        client_id: DRIVE_CLIENT_ID,
                        scope: DRIVE_SCOPE,
                        include_granted_scopes: false,
                        error_callback: (error) => {
                            clearTimeout(timeout);
                            if (settled || generation !== this._authGeneration) return settle(false);
                            const reason =
                                (error && (error.message || error.type || error.error || error.details)) ||
                                'Google sign-in failed before authorisation completed';
                            this._lastError = String(reason);
                            settle(false);
                        },
                        callback: (response) => {
                            clearTimeout(timeout);
                            if (settled || generation !== this._authGeneration) return settle(false);
                            if (response && response.access_token) {
                                this._lastError = null;
                                this.token = response.access_token;
                                this._persistSession(response.access_token, response.expires_in);
                                this._setReconnectPreference(true);
                                this._persistIdentity(this.userEmail);
                                if (!this._boundFocusHandler) this._setupVisibilityHandlers();
                                this._startExpiryWatch();
                                this._notifyAuthChange();
                                settle(true);
                            } else {
                                const responseDetail = response
                                    ? (response.error_description || response.error)
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
