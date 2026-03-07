/**
 * Drive Browser modal: browse Markdown-pro folder and subfolders, open/save files.
 */
(function () {
    'use strict';

    const MIME_FOLDER = 'application/vnd.google-apps.folder';

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    class DriveBrowser {
        constructor(editor, driveAuth, driveStorage) {
            this.editor = editor;
            this.driveAuth = driveAuth;
            this.driveStorage = driveStorage;
            this.currentModal = null;
            this.breadcrumb = [];
            this.currentFolderId = null;
            this.currentFiles = [];
            this._container = null;
            this._onClose = null;
        }

        reset() {
            this.currentFolderId = null;
            this.breadcrumb = [];
            this.currentFiles = [];
        }

        async refreshList() {
            if (!this.currentFolderId || !this.driveStorage) return;
            this.currentFiles = await this.driveStorage.listFiles(this.currentFolderId);
        }

        // Render drive content into a given container element (used by file-browser tabs).
        // Reuses the same .file-item / .file-list-container classes as the local browser
        // so the layout and sizing are identical.
        renderInto(container, onClose) {
            this._container = container;
            this._onClose = onClose;

            const breadcrumbHtml = this.breadcrumb.map((b, i) => {
                const isLast = i === this.breadcrumb.length - 1;
                return isLast
                    ? '<span class="drive-breadcrumb-current">' + escapeHtml(b.name) + '</span>'
                    : '<button type="button" class="drive-breadcrumb-link" data-index="' + i + '">' + escapeHtml(b.name) + '</button><span class="drive-breadcrumb-sep">/</span>';
            }).join('');

            const folders = this.currentFiles.filter((f) => f.isFolder);
            const mdFiles = this.currentFiles.filter((f) => !f.isFolder && /\.md$/i.test(f.name));
            const listHtml = folders.map((f) => this._renderFileItem(f, true)).join('')
                + mdFiles.map((f) => this._renderFileItem(f, false)).join('');
            const isEmpty = folders.length === 0 && mdFiles.length === 0;

            // Mirrors the structure of the local file browser body exactly
            container.innerHTML =
                '<div class="file-browser-toolbar">' +
                    '<div class="drive-breadcrumb">' + (breadcrumbHtml || 'Markdown-pro') + '</div>' +
                    '<div class="file-browser-actions">' +
                        '<button type="button" class="btn btn-sm btn-secondary" id="driveNewFolderInline">+ Folder</button>' +
                    '</div>' +
                '</div>' +
                '<div class="file-list-container">' +
                    '<div class="file-list" id="driveFileListInline">' + listHtml + '</div>' +
                    (isEmpty ? '<div class="empty-state">No markdown files here.<br>Use "Save current file here" to add one.</div>' : '') +
                '</div>' +
                '<div class="drive-save-footer">' +
                    '<button type="button" class="btn btn-primary btn-sm" id="driveSaveHereInline">Save current file here</button>' +
                '</div>';

            container.querySelector('#driveNewFolderInline')?.addEventListener('click', () => this._onCreateFolder());
            container.querySelector('#driveSaveHereInline')?.addEventListener('click', () => this._onSaveHere());

            container.querySelector('.drive-breadcrumb')?.addEventListener('click', (e) => {
                const link = e.target.closest('.drive-breadcrumb-link');
                if (!link) return;
                const index = parseInt(link.getAttribute('data-index'), 10);
                if (!isNaN(index)) this._navigateToBreadcrumb(index);
            });

            container.querySelector('#driveFileListInline')?.addEventListener('click', async (e) => {
                const item = e.target.closest('.drive-file-item');
                if (!item) return;
                const id = item.getAttribute('data-id');
                const name = item.getAttribute('data-name');
                if (e.target.closest('[data-action="open"]')) {
                    e.preventDefault();
                    await this._openFile(id, name);
                } else if (e.target.closest('[data-action="delete"]')) {
                    e.preventDefault();
                    e.stopPropagation();
                    await this._deleteFile(id, name);
                } else if (item.classList.contains('drive-folder-item')) {
                    await this._navigateToFolder(id, name);
                }
            });
        }

        // Build a drive item using the same .file-item structure as local files
        _renderFileItem(item, isFolder) {
            const name = escapeHtml(item.name || '');
            const id = escapeHtml(item.id || '');
            if (isFolder) {
                return '<div class="file-item drive-file-item drive-folder-item" data-id="' + id + '" data-name="' + name + '" role="button" tabindex="0">' +
                    '<div class="file-item-icon">📁</div>' +
                    '<div class="file-item-info"><div class="file-item-name">' + name + '</div></div>' +
                    '</div>';
            }
            return '<div class="file-item drive-file-item" data-id="' + id + '" data-name="' + name + '">' +
                '<div class="file-item-icon">📄</div>' +
                '<div class="file-item-info"><div class="file-item-name">' + name + '</div></div>' +
                '<div class="file-item-actions">' +
                    '<button type="button" class="btn-icon-small" data-action="open" title="Open">Open</button>' +
                    '<button type="button" class="btn-icon-small btn-danger" data-action="delete" title="Delete">Delete</button>' +
                '</div>' +
                '</div>';
        }

        // Standalone modal (kept for backward compat; not used from toolbar anymore)
        async showBrowser() {
            if (!this.driveStorage || !this.driveAuth || !this.driveAuth.isConnected()) {
                this.editor.showNotification?.('Connect to Google Drive first', 'error');
                return;
            }
            try {
                const rootId = await this.driveStorage.ensureRootFolder();
                this.breadcrumb = [{ id: rootId, name: 'Markdown-pro' }];
                this.currentFolderId = rootId;
                await this.refreshList();

                const modal = document.createElement('div');
                modal.className = 'modal-overlay drive-browser-overlay';
                modal.innerHTML = '<div class="modal-dialog drive-browser-modal" style="max-width:700px;max-height:85vh;display:flex;flex-direction:column;">' +
                    '<div class="modal-header"><h3>Google Drive</h3><button class="btn-close-modal" aria-label="Close">&times;</button></div>' +
                    '<div class="drive-browser-body-wrapper" style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:0;"></div>' +
                    '</div>';
                document.body.appendChild(modal);
                this.currentModal = modal;
                this.addStyles();
                modal.querySelector('.btn-close-modal')?.addEventListener('click', () => this.close());
                modal.addEventListener('click', (e) => { if (e.target === modal) this.close(); });
                const wrapper = modal.querySelector('.drive-browser-body-wrapper');
                this.renderInto(wrapper, () => this.close());
            } catch (err) {
                console.error('Drive browser error:', err);
                this.editor.showNotification?.('Could not open Drive folder: ' + (err.message || 'error'), 'error');
            }
        }

        async _navigateToFolder(folderId, folderName) {
            this.breadcrumb.push({ id: folderId, name: folderName });
            this.currentFolderId = folderId;
            await this.refreshList();
            if (this._container) this.renderInto(this._container, this._onClose);
        }

        _navigateToBreadcrumb(index) {
            const seg = this.breadcrumb[index];
            if (!seg) return;
            this.breadcrumb = this.breadcrumb.slice(0, index + 1);
            this.currentFolderId = seg.id;
            this.refreshList().then(() => {
                if (this._container) this.renderInto(this._container, this._onClose);
            });
        }

        async _onCreateFolder() {
            const name = window.prompt('New folder name:');
            if (!name || !name.trim()) return;
            try {
                await this.driveStorage.createFolder(this.currentFolderId, name.trim());
                this.editor.showNotification?.('Folder created', 'success');
                await this.refreshList();
                if (this._container) this.renderInto(this._container, this._onClose);
            } catch (err) {
                this.editor.showNotification?.('Could not create folder: ' + (err.message || 'error'), 'error');
            }
        }

        async _openFile(fileId, fileName) {
            try {
                const content = await this.driveStorage.readFile(fileId);
                this.editor.editor.value = content;
                this.editor.currentFileName = fileName;
                this.editor.currentDriveFileId = fileId;
                this.editor.setDocumentTitle?.(fileName);
                this.editor.lastSavedContent = content;
                this.editor.setModified?.(false);
                this.editor.updatePreview?.();
                this.editor.updateStats?.();
                this.editor.editor?.focus();

                const fileIdSlug = (fileName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-md';
                if (this.editor.indexedDBManager) {
                    await this.editor.indexedDBManager.saveFile({
                        id: fileIdSlug, name: fileName, content,
                        cursorPosition: 0, isModified: false,
                        created: new Date().toISOString(), modified: new Date().toISOString(),
                        size: content.length,
                        wordCount: (content.trim().split(/\s+/).length) || 0,
                        lineCount: (content.split('\n').length) || 0,
                        driveFileId: fileId
                    });
                }
                setTimeout(() => this.editor.resetScrollState?.(), 50);
                this.editor.showNotification?.('Opened from Drive: ' + fileName, 'success');
                this._onClose?.();
            } catch (err) {
                this.editor.showNotification?.('Could not open file: ' + (err.message || 'error'), 'error');
            }
        }

        async _deleteFile(fileId, fileName) {
            if (!window.confirm('Delete "' + fileName + '" from Drive? This cannot be undone.')) return;
            try {
                await this.driveStorage.deleteFile(fileId);
                this.editor.showNotification?.('Deleted from Drive', 'success');
                await this.refreshList();
                if (this._container) this.renderInto(this._container, this._onClose);
            } catch (err) {
                this.editor.showNotification?.('Could not delete: ' + (err.message || 'error'), 'error');
            }
        }

        async _onSaveHere() {
            let content = this.editor.editor?.value ?? '';
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                try { content = this.editor.imageCollapse.getPreviewContent(); } catch (_) {}
            }
            const fileName = this.editor.currentFileName || 'Untitled.md';
            const name = /\.md$/i.test(fileName) ? fileName : fileName + '.md';
            try {
                const existing = this.currentFiles.find((f) => !f.isFolder && f.name === name);
                if (existing) {
                    await this.driveStorage.updateFile(existing.id, content);
                    this.editor.currentDriveFileId = existing.id;
                    this.editor.showNotification?.('Updated on Drive: ' + name, 'success');
                } else {
                    const created = await this.driveStorage.createFile(this.currentFolderId, name, content);
                    this.editor.currentDriveFileId = created.id;
                    this.editor.showNotification?.('Saved to Drive: ' + name, 'success');
                    const fileIdSlug = (fileName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-md';
                    if (this.editor.indexedDBManager) {
                        await this.editor.indexedDBManager.saveFile({
                            id: fileIdSlug, name,
                            content, cursorPosition: this.editor.editor?.selectionStart ?? 0,
                            isModified: false,
                            created: new Date().toISOString(), modified: new Date().toISOString(),
                            size: content.length,
                            wordCount: (content.trim().split(/\s+/).length) || 0,
                            lineCount: (content.split('\n').length) || 0,
                            driveFileId: created.id
                        });
                    }
                    this.editor.lastSavedContent = content;
                    this.editor.setModified?.(false);
                }
                await this.refreshList();
                if (this._container) this.renderInto(this._container, this._onClose);
            } catch (err) {
                this.editor.showNotification?.('Could not save to Drive: ' + (err.message || 'error'), 'error');
            }
        }

        close() {
            if (this.currentModal && this.currentModal.parentNode) {
                this.currentModal.parentNode.removeChild(this.currentModal);
            }
            this.currentModal = null;
        }

        addStyles() {
            if (document.getElementById('drive-browser-styles')) return;
            const style = document.createElement('style');
            style.id = 'drive-browser-styles';
            style.textContent = `
                /* Drive breadcrumb navigation inside the file-browser-toolbar */
                .drive-breadcrumb { display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem; font-size: 0.88rem; flex: 1; min-width: 0; }
                .drive-breadcrumb-link { background: none; border: none; cursor: pointer; color: var(--accent-color); padding: 0 0.15rem; font-size: inherit; }
                .drive-breadcrumb-link:hover { text-decoration: underline; }
                .drive-breadcrumb-current { color: var(--text-primary); font-weight: 500; padding: 0 0.15rem; }
                .drive-breadcrumb-sep { color: var(--text-secondary); padding: 0 0.05rem; }
                /* Folder items are clickable like a button */
                .drive-folder-item { cursor: pointer; }
                /* Save footer */
                .drive-save-footer { padding: 0.6rem 1rem; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; flex-shrink: 0; }
            `;
            document.head.appendChild(style);
        }
    }

    window.DriveBrowser = DriveBrowser;
})();
