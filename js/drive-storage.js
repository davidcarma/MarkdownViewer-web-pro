/**
 * Google Drive REST v3 API wrapper for Markdown Pro.
 * List, read, create, update, delete files and folders under Markdown-pro/.
 *
 * Drive keys items by ID. Same name in one parent can exist many times.
 * createFolder / createFile are get-or-create; duplicate siblings are merged.
 */
(function () {
    'use strict';

    const DRIVE_API = 'https://www.googleapis.com/drive/v3';
    const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
    const ROOT_FOLDER_NAME = 'Markdown-pro';
    const MIME_FOLDER = 'application/vnd.google-apps.folder';
    const MIME_MARKDOWN = 'text/markdown';
    const STORAGE_KEY_ROOT_FOLDER_ID = 'markdownpro_drive_root_folder_id';
    const STORAGE_KEY_ROOT_FOLDER_LOCK = 'markdownpro_drive_root_folder_lock';
    const ROOT_FOLDER_LOCK_TTL_MS = 15000;
    const ROOT_FOLDER_LOCK_WAIT_MS = 20000;
    const ROOT_RECONCILE_TTL_MS = 10000;
    const identity = (typeof window !== 'undefined' && window.DriveIdentity) ? window.DriveIdentity : {};

    function escapeDriveQueryValue(value) {
        if (identity.escapeDriveQueryValue) return identity.escapeDriveQueryValue(value);
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function selectCanonicalItem(items, preferredId) {
        if (identity.selectCanonicalItem) return identity.selectCanonicalItem(items, preferredId);
        return (items && items[0]) || null;
    }

    function sameParent(a, b) {
        if (identity.sameParent) return identity.sameParent(a, b);
        return true;
    }

    class DriveStorage {
        constructor(driveAuth) {
            this.driveAuth = driveAuth;
            this._rootFolderId = null;
            this._rootFolderPromise = null;
            this._lastReconcileAt = 0;
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

        async _fetch(url, options = {}, _retried) {
            const headers = this._headers();
            if (!headers) return Promise.reject(new Error('Not connected to Drive'));
            const merged = {
                ...options,
                headers: { ...headers, ...(options.headers || {}) }
            };
            const res = await fetch(url, merged);
            if (res.status === 401 && this.driveAuth && !_retried) {
                this.driveAuth.invalidateSession();
                if (typeof this.driveAuth.refreshToken === 'function') {
                    const refreshed = await this.driveAuth.refreshToken();
                    if (refreshed && refreshed.ok) {
                        return this._fetch(url, options, true);
                    }
                }
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

        _getRootFolderLock() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_ROOT_FOLDER_LOCK);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                return parsed && parsed.owner && parsed.expiresAt ? parsed : null;
            } catch (_) {
                return null;
            }
        }

        _setRootFolderLock(lock) {
            try {
                if (lock) localStorage.setItem(STORAGE_KEY_ROOT_FOLDER_LOCK, JSON.stringify(lock));
                else localStorage.removeItem(STORAGE_KEY_ROOT_FOLDER_LOCK);
            } catch (_) {}
        }

        _isRootFolderLockActive(lock) {
            return !!(lock && lock.expiresAt && lock.expiresAt > Date.now());
        }

        _sleep(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
        }

        async _withRootFolderLock(task) {
            const owner = 'mdpro-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            const deadline = Date.now() + ROOT_FOLDER_LOCK_WAIT_MS;

            while (Date.now() < deadline) {
                const current = this._getRootFolderLock();
                if (!this._isRootFolderLockActive(current)) {
                    const lock = { owner, expiresAt: Date.now() + ROOT_FOLDER_LOCK_TTL_MS };
                    this._setRootFolderLock(lock);
                    const confirmed = this._getRootFolderLock();
                    if (confirmed && confirmed.owner === owner) {
                        try {
                            return await task();
                        } finally {
                            const latest = this._getRootFolderLock();
                            if (latest && latest.owner === owner) {
                                this._setRootFolderLock(null);
                            }
                        }
                    }
                }
                await this._sleep(250);
            }

            return task();
        }

        async _queryFiles(q, fileFields) {
            const files = [];
            let pageToken = '';
            const fields = 'nextPageToken,files(' + (fileFields || 'id,name,mimeType,modifiedTime') + ')';
            do {
                let url = DRIVE_API + '/files?q=' + encodeURIComponent(q) +
                    '&fields=' + encodeURIComponent(fields) +
                    '&pageSize=100&spaces=drive';
                if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
                const res = await this._fetch(url);
                if (!res.ok) {
                    const err = new Error('Drive query failed: ' + res.status);
                    err.status = res.status;
                    throw err;
                }
                const data = await res.json();
                files.push.apply(files, data.files || []);
                pageToken = data.nextPageToken || '';
            } while (pageToken);
            return files;
        }

        _namedChildQuery(parentId, name, mimeType) {
            const parts = [
                "name = '" + escapeDriveQueryValue(name) + "'",
                "'" + escapeDriveQueryValue(parentId) + "' in parents",
                'trashed = false'
            ];
            if (mimeType === MIME_FOLDER) {
                parts.push("mimeType = '" + MIME_FOLDER + "'");
            } else if (mimeType) {
                parts.push("mimeType = '" + escapeDriveQueryValue(mimeType) + "'");
            } else {
                parts.push("mimeType != '" + MIME_FOLDER + "'");
            }
            return parts.join(' and ');
        }

        async _findNamedChildren(parentId, name, mimeType) {
            try {
                return await this._queryFiles(
                    this._namedChildQuery(parentId, name, mimeType),
                    'id,name,mimeType,modifiedTime,createdTime,parents'
                );
            } catch (err) {
                if (err && (err.status === 403 || err.status === 404)) return [];
                throw err;
            }
        }

        /**
         * With drive.file scope we cannot list the user's root folder (403).
         * We create the Markdown-pro folder once and persist its ID so we never need to list root.
         * A stored ID is not uniqueness: still search for same-parent duplicates.
         */
        async ensureRootFolder() {
            if (this._rootFolderPromise) return this._rootFolderPromise;

            this._rootFolderPromise = this._ensureRootFolderImpl();
            try {
                return await this._rootFolderPromise;
            } finally {
                this._rootFolderPromise = null;
            }
        }

        async _ensureRootFolderImpl() {
            const token = this.getToken();
            if (!token) throw new Error('Not connected to Drive');

            const storedId = this._rootFolderId || this._getStoredRootFolderId();
            if (storedId) {
                const ok = await this._validateFolderId(storedId);
                if (ok) {
                    this._rootFolderId = storedId;
                    this._setStoredRootFolderId(storedId);
                    await this._reconcileRootDuplicates(storedId);
                    return this._rootFolderId;
                }
                this._rootFolderId = null;
                this._setStoredRootFolderId(null);
            }

            return this._withRootFolderLock(async () => {
                const lockedStoredId = this._getStoredRootFolderId();
                if (lockedStoredId) {
                    const ok = await this._validateFolderId(lockedStoredId);
                    if (ok) {
                        this._rootFolderId = lockedStoredId;
                        await this._reconcileRootDuplicates(lockedStoredId);
                        return this._rootFolderId;
                    }
                    this._setStoredRootFolderId(null);
                }

                const rootResolution = await this._resolveRootFolderCandidates();
                if (rootResolution) {
                    this._rootFolderId = rootResolution.id;
                    this._setStoredRootFolderId(rootResolution.id);
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
                await this._reconcileRootDuplicates(createData.id, true);
                return this._rootFolderId;
            });
        }

        async _reconcileRootDuplicates(preferredId, force) {
            if (!force && this._lastReconcileAt && (Date.now() - this._lastReconcileAt) < ROOT_RECONCILE_TTL_MS) {
                return preferredId;
            }
            const canonical = await this._resolveRootFolderCandidates(preferredId);
            this._lastReconcileAt = Date.now();
            if (canonical && canonical.id) {
                this._rootFolderId = canonical.id;
                this._setStoredRootFolderId(canonical.id);
                return canonical.id;
            }
            return preferredId;
        }

        async _resolveRootFolderCandidates(preferredId) {
            const candidates = await this._getRootFolderCandidates();
            if (candidates.length === 0) return null;

            const canonical = selectCanonicalItem(candidates, preferredId || this._getStoredRootFolderId());
            if (!canonical) return null;

            const duplicates = candidates.filter((candidate) => {
                return candidate.id !== canonical.id && sameParent(candidate, canonical);
            });
            if (duplicates.length > 0) {
                await this._mergeDuplicateFolders(canonical, duplicates);
            }
            return canonical;
        }

        async _getRootFolderCandidates() {
            const q = [
                "name = '" + escapeDriveQueryValue(ROOT_FOLDER_NAME) + "'",
                "mimeType = '" + MIME_FOLDER + "'",
                'trashed = false'
            ].join(' and ');
            let candidates = [];
            try {
                candidates = await this._queryFiles(q, 'id,name,mimeType,modifiedTime,createdTime,parents');
            } catch (_) {
                return [];
            }
            if (candidates.length === 0) return [];

            const withChildren = [];
            for (const candidate of candidates) {
                withChildren.push({
                    ...candidate,
                    childCount: await this._countChildren(candidate.id)
                });
            }
            return withChildren;
        }

        async _mergeDuplicateFolders(canonical, duplicates) {
            for (const duplicate of duplicates) {
                await this._absorbFolder(canonical.id, duplicate.id);
            }
        }

        async _absorbFolder(canonicalId, duplicateId) {
            if (!canonicalId || !duplicateId || canonicalId === duplicateId) return;
            const duplicateChildren = await this.listFiles(duplicateId, false);
            if (duplicateChildren.length === 0) {
                await this.deleteFile(duplicateId);
                return;
            }

            for (const child of duplicateChildren) {
                if (child.isFolder) {
                    const destFolders = await this._findNamedChildren(canonicalId, child.name, MIME_FOLDER);
                    if (destFolders.length > 0) {
                        const dest = selectCanonicalItem(destFolders);
                        await this._absorbFolder(dest.id, child.id);
                        continue;
                    }
                    await this._moveItemToFolder(child.id, canonicalId);
                    continue;
                }

                const destFiles = await this._findNamedChildren(canonicalId, child.name, null);
                if (destFiles.length > 0) {
                    const dest = selectCanonicalItem(destFiles);
                    const extras = destFiles.filter((item) => item.id !== dest.id);
                    if (this._newerItem(child, dest) === child) {
                        try {
                            const content = await this.readFile(child.id);
                            await this.updateFile(dest.id, content);
                        } catch (_) {}
                    }
                    await this.deleteFile(child.id);
                    if (extras.length > 0) await this._mergeDuplicateFiles(dest, extras);
                    continue;
                }
                await this._moveItemToFolder(child.id, canonicalId);
            }

            const leftover = await this.listFiles(duplicateId, false);
            if (leftover.length === 0) {
                await this.deleteFile(duplicateId);
            }
        }

        _newerItem(a, b) {
            const ta = Date.parse((a && a.modifiedTime) || '') || 0;
            const tb = Date.parse((b && b.modifiedTime) || '') || 0;
            if (ta !== tb) return ta >= tb ? a : b;
            return a;
        }

        async _mergeDuplicateFiles(canonical, duplicates) {
            for (const duplicate of duplicates) {
                if (duplicate && duplicate.id && duplicate.id !== canonical.id) {
                    await this.deleteFile(duplicate.id);
                }
            }
        }

        async _moveItemToFolder(itemId, newParentId) {
            const metaRes = await this._fetch(DRIVE_API + '/files/' + encodeURIComponent(itemId) + '?fields=id,parents');
            if (!metaRes.ok) {
                const err = new Error('Drive get parents failed: ' + metaRes.status);
                err.status = metaRes.status;
                throw err;
            }
            const meta = await metaRes.json();
            const parentIds = (meta.parents || []).filter(Boolean);
            if (parentIds.length === 1 && parentIds[0] === newParentId) return;
            const removeParents = parentIds.join(',');
            const query = '?addParents=' + encodeURIComponent(newParentId) + (removeParents ? '&removeParents=' + encodeURIComponent(removeParents) : '');
            const moveRes = await this._fetch(DRIVE_API + '/files/' + encodeURIComponent(itemId) + query, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!moveRes.ok) {
                const err = new Error('Drive move failed: ' + moveRes.status);
                err.status = moveRes.status;
                throw err;
            }
        }

        async _countChildren(folderId) {
            const q = "'" + escapeDriveQueryValue(folderId) + "' in parents and trashed = false";
            try {
                const url = DRIVE_API + '/files?q=' + encodeURIComponent(q) + '&fields=files(id)&pageSize=1&spaces=drive';
                const res = await this._fetch(url);
                if (!res.ok) return 0;
                const data = await res.json();
                return (data.files || []).length;
            } catch (_) {
                return 0;
            }
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
            this._lastReconcileAt = 0;
            this._setStoredRootFolderId(null);
        }

        sanitizeFolderName(name) {
            let n = String(name || '').trim().replace(/[\\/]/g, '-').replace(/[\x00-\x1f]/g, '');
            if (!n) throw new Error('Folder name is required');
            if (n.length > 120) n = n.slice(0, 120);
            return n;
        }

        /**
         * Never list Google's My Drive root (403 with drive.file).
         * Unknown or dead folder IDs fall back to Markdown-pro only when asked.
         */
        async resolveWorkingFolder(folderId, options = {}) {
            const rootId = await this.ensureRootFolder();
            if (!folderId || folderId === 'root') return rootId;
            const ok = await this._validateFolderId(folderId);
            if (ok) return folderId;
            if (options.fallbackToRoot) return rootId;
            throw new Error('That Drive folder is no longer available');
        }

        async listFiles(folderId, retryOnRootReset = true) {
            const workingId = (!folderId || folderId === 'root')
                ? await this.ensureRootFolder()
                : folderId;
            const q = "'" + escapeDriveQueryValue(workingId) + "' in parents and trashed = false";
            let raw;
            try {
                raw = await this._queryFiles(q, 'id,name,mimeType,modifiedTime');
            } catch (err) {
                const isCachedRoot = workingId === this._rootFolderId || workingId === this._getStoredRootFolderId();
                if (retryOnRootReset && isCachedRoot && err && (err.status === 403 || err.status === 404)) {
                    this.clearRootFolderCache();
                    const freshRootId = await this.ensureRootFolder();
                    return this.listFiles(freshRootId, false);
                }
                throw err;
            }
            return raw.map((f) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || '',
                modifiedTime: f.modifiedTime || null,
                isFolder: f.mimeType === MIME_FOLDER
            }));
        }

        async createFolder(parentId, name) {
            const folderName = this.sanitizeFolderName(name);
            const parent = await this.resolveWorkingFolder(parentId);
            const existing = await this._findNamedChildren(parent, folderName, MIME_FOLDER);
            if (existing.length > 0) {
                const canonical = selectCanonicalItem(existing);
                const extras = existing.filter((item) => item.id !== canonical.id);
                if (extras.length > 0) await this._mergeDuplicateFolders(canonical, extras);
                return { id: canonical.id, name: canonical.name || folderName, existed: true };
            }

            const res = await this._fetch(DRIVE_API + '/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: folderName,
                    mimeType: MIME_FOLDER,
                    parents: [parent]
                })
            });
            if (!res.ok) {
                const raced = await this._findNamedChildren(parent, folderName, MIME_FOLDER);
                if (raced.length > 0) {
                    const canonical = selectCanonicalItem(raced);
                    return { id: canonical.id, name: canonical.name || folderName, existed: true };
                }
                const err = new Error('Drive create folder failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            const data = await res.json();
            const after = await this._findNamedChildren(parent, folderName, MIME_FOLDER);
            if (after.length > 1) {
                const canonical = selectCanonicalItem(after, data.id);
                const extras = after.filter((item) => item.id !== canonical.id);
                await this._mergeDuplicateFolders(canonical, extras);
                return { id: canonical.id, name: canonical.name || folderName, existed: extras.some((item) => item.id === data.id) };
            }
            return { id: data.id, name: data.name || folderName, existed: false };
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
            const parent = await this.resolveWorkingFolder(parentId);
            const existing = await this._findNamedChildren(parent, name, null);
            if (existing.length > 0) {
                const canonical = selectCanonicalItem(existing);
                const extras = existing.filter((item) => item.id !== canonical.id);
                if (extras.length > 0) await this._mergeDuplicateFiles(canonical, extras);
                await this.updateFile(canonical.id, content);
                return { id: canonical.id, name: canonical.name || name, existed: true };
            }

            const created = await this._postMarkdownFile(parent, name, content);
            const after = await this._findNamedChildren(parent, name, null);
            if (after.length > 1) {
                const canonical = selectCanonicalItem(after, created.id);
                const extras = after.filter((item) => item.id !== canonical.id);
                if (canonical.id !== created.id) {
                    await this.updateFile(canonical.id, content);
                }
                await this._mergeDuplicateFiles(canonical, extras);
                return { id: canonical.id, name: canonical.name || name, existed: true };
            }
            return { id: created.id, name: created.name || name, existed: false };
        }

        async _postMarkdownFile(parent, name, content) {
            const boundary = '-------mdpro_' + Math.random().toString(36).slice(2);
            const meta = JSON.stringify({
                name: name,
                parents: [parent],
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
                const raced = await this._findNamedChildren(parent, name, null);
                if (raced.length > 0) {
                    const canonical = selectCanonicalItem(raced);
                    await this.updateFile(canonical.id, content);
                    return { id: canonical.id, name: canonical.name || name };
                }
                const err = new Error('Drive create file failed: ' + res.status);
                err.status = res.status;
                throw err;
            }
            return res.json();
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
