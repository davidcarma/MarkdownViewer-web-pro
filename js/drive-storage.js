/**
 * Google Drive REST v3 API wrapper for Markdown Pro.
 * List, read, create, update, delete files and folders under Markdown-pro/.
 */
(function () {
    'use strict';

    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
    const ROOT_FOLDER_NAME = 'Markdown-pro';
    const MIME_FOLDER = 'application/vnd.google-apps.folder';
    const MIME_MARKDOWN = 'text/markdown';
    const STORAGE_KEY_ROOT_FOLDER_ID = 'markdownpro_drive_root_folder_id';

    class DriveStorage {
        constructor(driveAuth) {
            this.driveAuth = driveAuth;
            this._rootFolderId = null;
        }

        getToken() {
            return this.driveAuth && this.driveAuth.getToken();
        }

        _headers() {
            const token = this.getToken();
            if (!token) return null;
            return {
                Authorization: 'Bearer ' + token
            };
        }

        async _fetch(url, options = {}) {
            const headers = this._headers();
            if (!headers) return Promise.reject(new Error('Not connected to Drive'));
            const merged = {
                ...options,
                headers: { ...headers, ...(options.headers || {}) }
            };
            const res = await fetch(url, merged);
            if (res.status === 401 && this.driveAuth) {
                this.driveAuth.invalidateSession();
            }
            return res;
        }

        _getStoredRootFolderId() {
            try {
                return localStorage.getItem(STORAGE_KEY_ROOT_FOLDER_ID) || null;
            } catch (_) {
                return null;
            }
        }

        _setStoredRootFolderId(id) {
            try {
                if (id) localStorage.setItem(STORAGE_KEY_ROOT_FOLDER_ID, id);
                else localStorage.removeItem(STORAGE_KEY_ROOT_FOLDER_ID);
            } catch (_) {}
        }

        /**
         * With drive.file scope we cannot list the user's root folder (403).
         * We create the Markdown-pro folder once and persist its ID so we never need to list root.
         */
        async ensureRootFolder() {
            if (this._rootFolderId) return this._rootFolderId;
            const token = this.getToken();
            if (!token) throw new Error('Not connected to Drive');

            const storedId = this._getStoredRootFolderId();
            if (storedId) {
                const ok = await this._validateFolderId(storedId);
                if (ok) {
                    this._rootFolderId = storedId;
                    return this._rootFolderId;
                }
                this._setStoredRootFolderId(null);
            }

            // Reuse an accessible Markdown-pro folder if one already exists.
            // With drive.file we cannot enumerate My Drive root reliably, but we can
            // search among files/folders this app can already access. This helps us
            // recover older Markdown-pro roots instead of creating a fresh empty one.
            const existingFolderId = await this._findExistingRootFolder();
            if (existingFolderId) {
                this._rootFolderId = existingFolderId;
                this._setStoredRootFolderId(existingFolderId);
                return this._rootFolderId;
            }

            const createRes = await this._fetch(DRIVE_API + '/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: ROOT_FOLDER_NAME,
                    mimeType: MIME_FOLDER
                })
            });
            if (!createRes.ok) {
                const err = new Error('Drive create folder failed: ' + createRes.status);
                err.status = createRes.status;
                throw err;
            }
            const createData = await createRes.json();
            this._rootFolderId = createData.id;
            this._setStoredRootFolderId(this._rootFolderId);
            return this._rootFolderId;
        }

        async _findExistingRootFolder() {
            const q = [
                "name = '" + ROOT_FOLDER_NAME.replace(/'/g, "\\'") + "'",
                "mimeType = '" + MIME_FOLDER + "'",
                'trashed = false'
            ].join(' and ');
            const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,modifiedTime,createdTime)&orderBy=modifiedTime desc&spaces=drive';
            const res = await this._fetch(url);
            if (!res.ok) return null;

            const data = await res.json();
            const candidates = data.files || [];
            if (candidates.length === 0) return null;

            // Prefer a candidate that already has visible children, which is more likely
            // to be the user's existing Markdown-pro root rather than a newly created empty one.
            for (const candidate of candidates) {
                const childCount = await this._countChildren(candidate.id);
                if (childCount > 0) {
                    return candidate.id;
                }
            }

            return candidates[0].id;
        }

        async _countChildren(folderId) {
            const q = "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false";
            const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id)&pageSize=1&spaces=drive';
            const res = await this._fetch(url);
            if (!res.ok) return 0;
            const data = await res.json();
            return (data.files || []).length;
        }

        async _validateFolderId(folderId) {
            const url = DRIVE_API + '/files/' + encodeURIComponent(folderId) + '?fields=id,name,mimeType,trashed';
            const res = await this._fetch(url);
            if (res.status === 404 || res.status === 403) return false;
            if (!res.ok) return false;
            const data = await res.json();
            return !!(data && data.id && data.mimeType === MIME_FOLDER && !data.trashed);
        }

        clearRootFolderCache() {
            this._rootFolderId = null;
            this._setStoredRootFolderId(null);
        }

        async listFiles(folderId, retryOnRootReset = true) {
            const q = "'" + (folderId || 'root').replace(/'/g, "\\'") + "' in parents and trashed = false";
            const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,mimeType,modifiedTime)&orderBy=name&spaces=drive';
            const res = await this._fetch(url);
            if (!res.ok) {
                const isCachedRoot = !!folderId && (folderId === this._rootFolderId || folderId === this._getStoredRootFolderId());
                if (retryOnRootReset && isCachedRoot && (res.status === 403 || res.status === 404)) {
                    this.clearRootFolderCache();
                    const freshRootId = await this.ensureRootFolder();
                    return this.listFiles(freshRootId, false);
                }
                const err = new Error('Drive list failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            const data = await res.json();
            const files = (data.files || []).map((f) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || '',
                modifiedTime: f.modifiedTime || null,
                isFolder: f.mimeType === MIME_FOLDER
            }));
            return files;
        }

        async createFolder(parentId, name) {
            const res = await this._fetch(DRIVE_API + '/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    mimeType: MIME_FOLDER,
                    parents: [parentId]
                })
            });
            if (!res.ok) {
                const err = new Error('Drive create folder failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            const data = await res.json();
            return { id: data.id, name: data.name };
        }

        async readFile(fileId) {
            const url = DRIVE_API + '/files/' + encodeURIComponent(fileId) + '?alt=media';
            const res = await this._fetch(url);
            if (!res.ok) {
                const err = new Error('Drive read failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            return res.text();
        }

        async createFile(parentId, name, content) {
            const boundary = '-------mdpro_' + Math.random().toString(36).slice(2);
            const meta = JSON.stringify({
                name: name,
                parents: [parentId],
                mimeType: MIME_MARKDOWN
            });
            const body =
                '--' + boundary + '\r\n' +
                'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
                meta + '\r\n' +
                '--' + boundary + '\r\n' +
                'Content-Type: ' + MIME_MARKDOWN + '\r\n\r\n' +
                (content || '') + '\r\n' +
                '--' + boundary + '--';

            const res = await this._fetch(DRIVE_UPLOAD + '/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/related; boundary=' + boundary
                },
                body: body
            });
            if (!res.ok) {
                const err = new Error('Drive create file failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            const data = await res.json();
            return { id: data.id, name: data.name };
        }

        async updateFile(fileId, content) {
            const url = DRIVE_UPLOAD + '/files/' + encodeURIComponent(fileId) + '?uploadType=media';
            const res = await this._fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': MIME_MARKDOWN },
                body: content || ''
            });
            if (!res.ok) {
                const err = new Error('Drive update failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
        }

        async deleteFile(fileId) {
            const url = DRIVE_API + '/files/' + encodeURIComponent(fileId);
            const res = await this._fetch(url, { method: 'DELETE' });
            if (!res.ok && res.status !== 204) {
                const err = new Error('Drive delete failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
        }
    }

    window.DriveStorage = DriveStorage;
})();
