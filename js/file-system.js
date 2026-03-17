/**
 * Finder-style file system: single controller and view for open/save/new.
 * Replaces fragmented modal flows with one unified source rail, tree, and file list.
 */
(function () {
    'use strict';

    const SOURCE_BROWSER = 'browser';
    const SOURCE_DRIVE = 'drive';
    const SOURCE_RECENT = 'recent';

    function escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncateMiddle(text, startChars = 24, endChars = 10) {
        if (!text) return '';
        const value = String(text);
        if (value.length <= startChars + endChars + 3) return value;
        return value.slice(0, startChars) + '...' + value.slice(-endChars);
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return diffMins + 'm ago';
        if (diffHours < 24) return diffHours + 'h ago';
        if (diffDays < 7) return diffDays + 'd ago';
        return date.toLocaleDateString();
    }

    function formatSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    class FileSystemController {
        constructor(editor) {
            this.editor = editor;
        }

        getSources() {
            const list = [
                { id: SOURCE_BROWSER, label: 'This Device', icon: 'device' },
                { id: SOURCE_RECENT, label: 'Recent', icon: 'recent' }
            ];
            if (this.editor.driveAuth && this.editor.driveAuth.isAvailable() && this.editor.driveAuth.isConnected()) {
                list.splice(1, 0, { id: SOURCE_DRIVE, label: 'Google Drive', icon: 'drive' });
            }
            return list;
        }

        async getTreeItems(source, parentId) {
            if (source === SOURCE_BROWSER || source === SOURCE_RECENT) {
                return [{ id: 'root', name: 'My files', isFolder: true }];
            }
            if (source === SOURCE_DRIVE && this.editor.driveStorage) {
                const rootId = await this.editor.driveStorage.ensureRootFolder();
                if (!parentId || parentId === 'root') {
                    return [{ id: rootId, name: 'Markdown-pro', isFolder: true }];
                }
                const items = await this.editor.driveStorage.listFiles(parentId);
                return items.filter((f) => f.isFolder).map((f) => ({ id: f.id, name: f.name, isFolder: true }));
            }
            return [];
        }

        async getFileList(source, folderId) {
            if (source === SOURCE_BROWSER && this.editor.indexedDBManager && this.editor.indexedDBManager.isSupported) {
                const files = await this.editor.indexedDBManager.getAllFiles();
                return files.map((f) => ({
                    id: f.id,
                    name: f.name || 'Untitled.md',
                    size: f.size || (f.content && f.content.length) || 0,
                    modified: f.modified || f.created,
                    source: SOURCE_BROWSER,
                    content: f.content,
                    cursorPosition: f.cursorPosition,
                    driveFileId: f.driveFileId,
                    wordCount: f.wordCount,
                    lineCount: f.lineCount
                }));
            }
            if (source === SOURCE_RECENT && this.editor.indexedDBManager && this.editor.indexedDBManager.isSupported) {
                const files = await this.editor.indexedDBManager.getAllFiles();
                const sorted = [...files].sort((a, b) => {
                    const da = new Date(a.modified || a.created || 0).getTime();
                    const db = new Date(b.modified || b.created || 0).getTime();
                    return db - da;
                });
                return sorted.slice(0, 50).map((f) => ({
                    id: f.id,
                    name: f.name || 'Untitled.md',
                    size: f.size || (f.content && f.content.length) || 0,
                    modified: f.modified || f.created,
                    source: SOURCE_BROWSER,
                    content: f.content,
                    cursorPosition: f.cursorPosition,
                    driveFileId: f.driveFileId,
                    wordCount: f.wordCount,
                    lineCount: f.lineCount
                }));
            }
            if (source === SOURCE_DRIVE && this.editor.driveStorage && folderId) {
                const rootId = await this.editor.driveStorage.ensureRootFolder();
                const effectiveId = folderId === 'root' ? rootId : folderId;
                const items = await this.editor.driveStorage.listFiles(effectiveId);
                const folders = items.filter((f) => f.isFolder).map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: 0,
                    modified: f.modifiedTime,
                    source: SOURCE_DRIVE,
                    isFolder: true,
                    isDrive: true
                }));
                const files = items.filter((f) => !f.isFolder && /\.md$/i.test(f.name)).map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: 0,
                    modified: f.modifiedTime,
                    source: SOURCE_DRIVE,
                    isDrive: true
                }));
                return folders.concat(files);
            }
            return [];
        }

        getEditorContent() {
            let content = this.editor.editor?.value ?? '';
            try {
                if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                    content = this.editor.imageCollapse.getPreviewContent();
                }
            } catch (_) {}
            return content;
        }

        async openBrowserFile(file) {
            if (!file || !file.content) return;
            if (this.editor.setActiveDocumentId) this.editor.setActiveDocumentId(file.id);
            this.editor.editor.value = file.content;
            this.editor.currentFileName = file.name || 'Untitled.md';
            this.editor.currentDriveFileId = file.driveFileId || null;
            this.editor.setDocumentTitle(this.editor.currentFileName);
            this.editor.lastSavedContent = file.content;
            this.editor.setModified(false);
            if (file.cursorPosition != null) {
                setTimeout(() => {
                    this.editor.editor.setSelectionRange(file.cursorPosition, file.cursorPosition);
                }, 100);
            }
            this.editor.updatePreview?.();
            this.editor.updateStats?.();
            this.editor.editor?.focus();
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) this.editor.imageCollapse.initialize();
            this.editor.showNotification?.('Opened: ' + (file.name || 'Untitled.md'), 'success');
            setTimeout(() => this.editor.resetScrollState?.(), 50);
        }

        async openDriveFile(fileId, fileName) {
            const content = await this.editor.driveStorage.readFile(fileId);
            this.editor.editor.value = content;
            this.editor.currentFileName = fileName;
            this.editor.currentDriveFileId = fileId;
            this.editor.setDocumentTitle(fileName);
            this.editor.lastSavedContent = content;
            this.editor.setModified(false);
            this.editor.updatePreview?.();
            this.editor.updateStats?.();
            this.editor.editor?.focus();
            const slug = (fileName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-md';
            if (this.editor.indexedDBManager) {
                await this.editor.indexedDBManager.saveFile({
                    id: slug, name: fileName, content,
                    cursorPosition: 0, isModified: false,
                    created: new Date().toISOString(), modified: new Date().toISOString(),
                    size: content.length,
                    wordCount: (content.trim().split(/\s+/).length) || 0,
                    lineCount: (content.split('\n').length) || 0,
                    driveFileId: fileId
                });
                if (this.editor.setActiveDocumentId) this.editor.setActiveDocumentId(slug);
            }
            setTimeout(() => this.editor.resetScrollState?.(), 50);
            this.editor.showNotification?.('Opened from Drive: ' + fileName, 'success');
        }

        async saveCurrentToBrowser() {
            return this.editor.fileBrowser ? await this.editor.fileBrowser.saveCurrentFile() : false;
        }

        async saveCurrentToDriveFolder(folderId) {
            const content = this.getEditorContent();
            const name = /\.md$/i.test(this.editor.currentFileName || '') ? this.editor.currentFileName : (this.editor.currentFileName || 'Untitled') + '.md';
            const slug = (this.editor.currentFileName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-md';
            const rootId = await this.editor.driveStorage.ensureRootFolder();
            const effectiveId = folderId === 'root' ? rootId : folderId;
            const existing = await this.editor.driveStorage.listFiles(effectiveId).then((items) => items.find((f) => !f.isFolder && f.name === name));
            if (existing) {
                await this.editor.driveStorage.updateFile(existing.id, content);
                this.editor.currentDriveFileId = existing.id;
            } else {
                const created = await this.editor.driveStorage.createFile(effectiveId, name, content);
                this.editor.currentDriveFileId = created.id;
            }
            if (this.editor.indexedDBManager) {
                await this.editor.indexedDBManager.saveFile({
                    id: slug, name: this.editor.currentFileName || name, content,
                    cursorPosition: this.editor.editor?.selectionStart ?? 0, isModified: false,
                    created: new Date().toISOString(), modified: new Date().toISOString(),
                    size: content.length,
                    wordCount: (content.trim().split(/\s+/).length) || 0,
                    lineCount: (content.split('\n').length) || 0,
                    driveFileId: this.editor.currentDriveFileId
                });
            }
            this.editor.lastSavedContent = content;
            this.editor.setModified(false);
            if (this.editor.setActiveDocumentId) this.editor.setActiveDocumentId(slug);
        }

        async deleteBrowserFile(file) {
            if (!this.editor.indexedDBManager) return;
            await this.editor.indexedDBManager.deleteFile(file.id);
            const currentId = this.editor.fileBrowser?.generateFileId(this.editor.currentFileName);
            if (file.id === currentId) {
                this.editor.editor.value = '';
                this.editor.lastSavedContent = '';
                this.editor.setDocumentTitle('Untitled.md');
                this.editor.currentDriveFileId = null;
                this.editor.setModified(false);
                this.editor.updatePreview?.();
                this.editor.updateStats?.();
                this.editor.replaceLocalStorageFile?.();
                setTimeout(() => this.editor.resetScrollState?.(), 50);
            }
        }

        async moveBrowserFileToDrive(file, folderId) {
            if (!file || !this.editor.driveStorage) {
                throw new Error('Google Drive is not available');
            }
            const currentActiveId = this.editor.getActiveDocumentId?.();
            const currentGeneratedId = this.editor.fileBrowser?.generateFileId(this.editor.currentFileName || '');
            const isActiveFile = file.id === currentActiveId || (!!currentGeneratedId && file.id === currentGeneratedId);
            const name = isActiveFile && (this.editor.currentFileName || '').trim()
                ? this.editor.currentFileName
                : (file.name || 'Untitled.md');
            const content = isActiveFile
                ? this.getEditorContent()
                : (file.content || '');
            const targetFolderId = folderId || await this.editor.driveStorage.ensureRootFolder();
            const existing = await this.editor.driveStorage.listFiles(targetFolderId).then((items) => items.find((f) => !f.isFolder && f.name === name));

            let driveFileId = null;
            if (existing) {
                await this.editor.driveStorage.updateFile(existing.id, content);
                driveFileId = existing.id;
            } else {
                const created = await this.editor.driveStorage.createFile(targetFolderId, name, content);
                driveFileId = created.id;
            }

            if (this.editor.indexedDBManager) {
                await this.editor.indexedDBManager.deleteFile(file.id);
            }

            if (isActiveFile) {
                this.editor.currentDriveFileId = driveFileId;
                this.editor.currentFileName = name;
                this.editor.setDocumentTitle?.(name);
                this.editor.lastSavedContent = content;
                this.editor.setModified?.(false);
                this.editor.setActiveDocumentId?.(null);
            }

            return { id: driveFileId, name: name };
        }

        async deleteDriveFile(fileId) {
            await this.editor.driveStorage.deleteFile(fileId);
        }

        hasUnsavedChanges() {
            return !!(this.editor.isModified &&
                typeof this.editor.lastSavedContent === 'string' &&
                this.editor.editor &&
                this.editor.editor.value !== this.editor.lastSavedContent);
        }

        hasDocumentToClear() {
            const content = this.editor.editor?.value || '';
            const hasContent = content.trim().length > 0;
            const currentName = (this.editor.currentFileName || '').trim();
            const hasNamedDocument = !!currentName && currentName !== 'Untitled.md';
            const hasDriveLink = !!this.editor.currentDriveFileId;
            const hasActiveDocument = !!this.editor.getActiveDocumentId?.();
            return hasContent || hasNamedDocument || hasDriveLink || hasActiveDocument;
        }

        triggerDownload() {
            const content = this.getEditorContent();
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.editor.currentFileName || 'Untitled.md';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.editor.showNotification?.('Downloaded: ' + (this.editor.currentFileName || 'Untitled.md'), 'success');
        }
    }

    class FinderView {
        constructor(editor) {
            this.editor = editor;
            this.controller = new FileSystemController(editor);
            this.modal = null;
            this.mode = 'open';
            this.currentSource = SOURCE_BROWSER;
            this.currentFolderId = 'root';
            this.selectedFile = null;
            this.driveBreadcrumb = [];
            this._escapeHandler = null;
        }

        _closeFileMenus(exceptMenu) {
            if (!this.modal) return;
            this.modal.querySelectorAll('.finder-file-menu.is-open').forEach((menu) => {
                if (exceptMenu && menu === exceptMenu) return;
                menu.classList.remove('is-open');
            });
        }

        show(options = {}) {
            this.mode = options.mode || 'open';
            this.currentSource = options.initialSource || (this.editor.driveAuth?.isConnected() ? SOURCE_DRIVE : SOURCE_BROWSER);
            this.currentFolderId = 'root';
            this.selectedFile = null;

            const sources = this.controller.getSources();
            if (!sources.some((s) => s.id === this.currentSource)) {
                this.currentSource = sources[0]?.id || SOURCE_BROWSER;
            }

            if (this.mode === 'new') {
                if (this.controller.hasDocumentToClear()) {
                    this._showWithNewPrompt();
                } else {
                    this._doNewFile();
                }
                return;
            }

            this._render(sources);
        }

        _showWithNewPrompt() {
            const sources = this.controller.getSources();
            this._render(sources, true);
        }

        _render(sources, showNewPrompt) {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }

            const promptHtml = showNewPrompt
                ? `<div class="finder-prompt">
                    <p>Clear the current document?</p>
                    <div class="finder-prompt-actions">
                        <button type="button" class="btn btn-primary btn-sm" data-prompt-action="save-new">Save and Clear</button>
                        <button type="button" class="btn btn-danger btn-sm" data-prompt-action="discard">Clear without Saving</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-prompt-action="cancel">Cancel</button>
                    </div>
                  </div>`
                : '';

            const sourceRailHtml = sources.map((s) => {
                const active = s.id === this.currentSource ? ' active' : '';
                const icon = s.id === SOURCE_DRIVE ? 'drive' : s.id === SOURCE_RECENT ? 'recent' : 'device';
                return `<button type="button" class="finder-source-item finder-source-item-${escapeHtml(icon)}${active}" data-source="${escapeHtml(s.id)}">
                    <span class="finder-source-icon">${icon === 'drive' ? '&#128190;' : icon === 'recent' ? '&#128336;' : '&#128187;'}</span>
                    <span class="finder-source-copy">
                        <span class="finder-source-name">${escapeHtml(s.label)}</span>
                        <span class="finder-source-note">${icon === 'drive' ? 'Cloud sync' : icon === 'recent' ? 'Quick access' : 'Local drafts'}</span>
                    </span>
                </button>`;
            }).join('');

            const title = this.mode === 'open' ? 'Open Files' : this.mode === 'save' ? 'Save Files' : 'Files';
            const subtitle = this.mode === 'save'
                ? 'Choose a destination and save the current document'
                : this.mode === 'new'
                    ? 'Start clean without losing your current work'
                    : 'Browse local and Google Drive markdown files';
            const connectionLabel = this.editor.driveAuth?.isConnected()
                ? 'Drive connected'
                : 'Browser only';
            this.modal = document.createElement('div');
            this.modal.className = 'finder-overlay';
            this.modal.innerHTML = `
                <div class="finder-window">
                    <div class="finder-header">
                        <div class="finder-header-copy">
                            <h2 class="finder-title">${escapeHtml(title)}</h2>
                            <div class="finder-subtitle">${escapeHtml(subtitle)}</div>
                        </div>
                        <div class="finder-header-meta">
                            <span class="finder-connection-pill${this.editor.driveAuth?.isConnected() ? ' is-connected' : ''}">${escapeHtml(connectionLabel)}</span>
                        </div>
                        <button type="button" class="finder-close" aria-label="Close">&times;</button>
                    </div>
                    ${promptHtml}
                    <div class="finder-body">
                        <nav class="finder-source-rail">
                            <div class="finder-pane-label">Locations</div>
                            ${sourceRailHtml}
                        </nav>
                        <div class="finder-tree-pane">
                            <div class="finder-pane-label">Folders</div>
                            <div id="finderTree"></div>
                        </div>
                        <div class="finder-main">
                            <div class="finder-command-bar">
                                <button type="button" class="btn btn-sm btn-primary" id="finderNewFile">New File</button>
                                ${this.currentSource === SOURCE_DRIVE ? '<button type="button" class="btn btn-sm btn-secondary" id="finderNewFolder">New Folder</button>' : ''}
                                <button type="button" class="btn btn-sm btn-secondary" id="finderImport">Import from Disk</button>
                                ${this.mode === 'save' ? '<button type="button" class="btn btn-sm btn-primary" id="finderSaveHere">Save current file here</button>' : ''}
                                <input type="text" class="finder-search" id="finderSearch" placeholder="Search..." autocomplete="off">
                            </div>
                            <div class="finder-file-list" id="finderFileList"></div>
                        </div>
                    </div>
                    <div class="finder-status-bar" id="finderStatus"></div>
                </div>`;

            document.body.appendChild(this.modal);

            if (this.currentSource === SOURCE_DRIVE && this.editor.driveStorage) {
                this.editor.driveStorage.ensureRootFolder().then((rootId) => {
                    this.driveBreadcrumb = [{ id: rootId, name: 'Markdown-pro' }];
                    this.currentFolderId = rootId;
                    this._refreshTree();
                    this._refreshFileList();
                    this._refreshStatus();
                }).catch((err) => {
                    this.currentSource = SOURCE_BROWSER;
                    this._refreshSources(sources);
                    this._refreshTree();
                    this._refreshFileList();
                    this.editor.showNotification?.(
                        'Could not load Google Drive. ' + (err && err.message ? err.message : 'Please reconnect.'),
                        'error'
                    );
                });
            }

            this.modal.querySelector('.finder-close').addEventListener('click', () => this.close());
            this.modal.addEventListener('click', (e) => {
                const fileMenu = e.target.closest ? e.target.closest('.finder-file-menu') : null;
                if (!fileMenu) this._closeFileMenus();
                if (e.target === this.modal) this.close();
            });
            this._escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    this.close();
                    document.removeEventListener('keydown', this._escapeHandler);
                }
            };
            document.addEventListener('keydown', this._escapeHandler);

            this.modal.querySelectorAll('.finder-source-item').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    this.currentSource = btn.getAttribute('data-source');
                    this.currentFolderId = 'root';
                    this.driveBreadcrumb = [];
                    if (this.currentSource === SOURCE_DRIVE && this.editor.driveStorage) {
                        try {
                            const rootId = await this.editor.driveStorage.ensureRootFolder();
                            this.driveBreadcrumb = [{ id: rootId, name: 'Markdown-pro' }];
                            this.currentFolderId = rootId;
                        } catch (err) {
                            this.currentSource = SOURCE_BROWSER;
                            this.editor.showNotification?.(
                                'Could not load Google Drive. ' + (err && err.message ? err.message : 'Please reconnect.'),
                                'error'
                            );
                        }
                    }
                    this._refreshSources(sources);
                    this._refreshTree();
                    this._refreshFileList();
                    this._refreshCommandBar();
                });
            });

            if (showNewPrompt) {
                this.modal.querySelector('[data-prompt-action="save-new"]').addEventListener('click', async () => {
                    const ok = await this.editor.smartSave?.();
                    if (ok) {
                        this._doNewFile();
                    }
                });
                this.modal.querySelector('[data-prompt-action="discard"]').addEventListener('click', () => this._doNewFile());
                this.modal.querySelector('[data-prompt-action="cancel"]').addEventListener('click', () => this.close());
            }

            this.modal.querySelector('#finderNewFile').addEventListener('click', () => {
                this.show({ mode: 'new', initialSource: this.currentSource });
            });

            const newFolderBtn = this.modal.querySelector('#finderNewFolder');
            if (newFolderBtn) {
                newFolderBtn.addEventListener('click', () => this._onNewFolder());
            }

            this.modal.querySelector('#finderImport').addEventListener('click', () => {
                this.close();
                if (this.editor.fileInput) this.editor.fileInput.click();
            });

            const saveHereBtn = this.modal.querySelector('#finderSaveHere');
            if (saveHereBtn) {
                saveHereBtn.addEventListener('click', () => this._onSaveHere());
            }

            const searchInput = this.modal.querySelector('#finderSearch');
            if (searchInput) {
                searchInput.addEventListener('input', () => this._refreshFileList());
            }

            this._refreshTree();
            this._refreshFileList();
            this._refreshStatus();
        }

        _refreshSources(sources) {
            this.modal.querySelectorAll('.finder-source-item').forEach((btn) => {
                const id = btn.getAttribute('data-source');
                btn.classList.toggle('active', id === this.currentSource);
            });
        }

        async _refreshTree() {
            const treeEl = this.modal.querySelector('#finderTree');
            if (!treeEl) return;
            if (this.currentSource === SOURCE_RECENT) {
                treeEl.innerHTML = '<div class="finder-tree-item active">Recent files</div>';
                return;
            }
            if (this.currentSource === SOURCE_DRIVE && this.driveBreadcrumb.length > 0) {
                const subfolders = await this.controller.getTreeItems(this.currentSource, this.currentFolderId);
                const breadcrumbHtml = this.driveBreadcrumb.map((b, i) => {
                    const active = b.id === this.currentFolderId ? ' active' : '';
                    return `<button type="button" class="finder-tree-item${active}" data-folder-id="${escapeHtml(b.id)}" data-breadcrumb-index="${i}">
                        <span class="finder-tree-chevron"></span>
                        <span class="finder-tree-icon">&#128193;</span>
                        <span>${escapeHtml(b.name)}</span>
                    </button>`;
                }).join('');
                const subHtml = subfolders.map((item) => {
                    const active = item.id === this.currentFolderId ? ' active' : '';
                    return `<button type="button" class="finder-tree-item${active}" data-folder-id="${escapeHtml(item.id)}">
                        <span class="finder-tree-chevron">&#11208;</span>
                        <span class="finder-tree-icon">&#128193;</span>
                        <span>${escapeHtml(item.name)}</span>
                    </button>`;
                }).join('');
                treeEl.innerHTML = breadcrumbHtml + subHtml;
                treeEl.querySelectorAll('.finder-tree-item').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const folderId = btn.getAttribute('data-folder-id');
                        const idx = btn.getAttribute('data-breadcrumb-index');
                        this.currentFolderId = folderId;
                        if (idx != null) {
                            const i = parseInt(idx, 10);
                            this.driveBreadcrumb = this.driveBreadcrumb.slice(0, i + 1);
                        }
                        this._refreshTree();
                        this._refreshFileList();
                        this._refreshStatus();
                    });
                });
                return;
            }
            const items = await this.controller.getTreeItems(this.currentSource, this.currentFolderId);
            if (this.currentSource === SOURCE_DRIVE && this.currentFolderId !== 'root' && this.driveBreadcrumb.length === 0) {
                this.driveBreadcrumb = [{ id: this.currentFolderId, name: 'Markdown-pro' }];
            }
            treeEl.innerHTML = items.map((item) => {
                const active = (item.id === this.currentFolderId || (item.id !== 'root' && this.currentFolderId === item.id)) ? ' active' : '';
                return `<button type="button" class="finder-tree-item${active}" data-folder-id="${escapeHtml(item.id)}">
                    <span class="finder-tree-chevron"></span>
                    <span class="finder-tree-icon">&#128193;</span>
                    <span>${escapeHtml(item.name)}</span>
                </button>`;
            }).join('');
            treeEl.querySelectorAll('.finder-tree-item').forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.currentFolderId = btn.getAttribute('data-folder-id');
                    if (this.currentSource === SOURCE_DRIVE && this.driveBreadcrumb.length === 0) {
                        this.driveBreadcrumb = [{ id: this.currentFolderId, name: 'Markdown-pro' }];
                    }
                    this._refreshTree();
                    this._refreshFileList();
                    this._refreshStatus();
                });
            });
        }

        async _refreshFileList() {
            const listEl = this.modal.querySelector('#finderFileList');
            if (!listEl) return;
            const query = (this.modal.querySelector('#finderSearch') && this.modal.querySelector('#finderSearch').value) || '';
            let files = await this.controller.getFileList(this.currentSource, this.currentFolderId);
            if (query.trim()) {
                const q = query.toLowerCase();
                files = files.filter((f) => (f.name || '').toLowerCase().includes(q));
            }
            if (files.length === 0) {
                listEl.innerHTML = '<div class="finder-empty"><p>No files here.</p><p>Use New File or Import from Disk.</p></div>';
                return;
            }
            const headerHtml = `<div class="finder-list-header">
                <div>Name</div>
                <div>Preview</div>
                <div>Modified</div>
                <div>Source</div>
            </div>`;
            const rowsHtml = files.map((f) => {
                const meta = f.source === SOURCE_DRIVE
                    ? formatDate(f.modified)
                    : formatDate(f.modified) + ' · ' + formatSize(f.size);
                const isFolder = !!f.isFolder;
                const canMoveToDrive = !isFolder &&
                    f.source !== SOURCE_DRIVE &&
                    !!(this.editor.driveAuth?.isConnected() && this.editor.driveStorage);
                const actionHtml = isFolder
                    ? ''
                    : `<div class="finder-file-actions">
                        ${canMoveToDrive ? `<div class="finder-file-menu">
                            <button type="button" class="finder-file-move" data-action="move-menu" title="Move options" aria-label="Move options">
                                &#8599;
                            </button>
                            <div class="finder-file-popup-menu">
                                <button type="button" class="finder-file-popup-item" data-action="move-to-drive" title="Move file to Google Drive root">
                                    Move to Google Drive
                                </button>
                            </div>
                        </div>` : ''}
                        <button type="button" class="finder-file-delete" data-action="delete" title="Delete file" aria-label="Delete file">
                            &times;
                        </button>
                    </div>`;
                const rowClass = isFolder ? ' is-folder' : ' is-file';
                const iconBadgeClass = isFolder ? ' is-folder' : (f.source === SOURCE_DRIVE ? ' is-drive' : ' is-browser');
                const metaPrefix = isFolder ? 'Folder' : (f.source === SOURCE_DRIVE ? 'Google Drive' : 'Browser');
                const preview = isFolder
                    ? 'Open this folder to view its contents'
                    : f.source === SOURCE_DRIVE
                        ? 'Markdown file stored in Google Drive'
                        : ((f.content || '').replace(/\s+/g, ' ').trim().slice(0, 72) || 'Markdown document');
                const displayName = truncateMiddle(f.name || 'Untitled.md', 24, 10);
                const sourceChipClass = isFolder
                    ? ' is-folder'
                    : (f.source === SOURCE_DRIVE ? ' is-drive' : ' is-browser');
                const directionHtml = isFolder
                    ? '<div class="finder-file-direction" aria-hidden="true">&#8250;</div>'
                    : '';
                return `<div class="finder-file-row${rowClass}" role="button" tabindex="0" data-file-id="${escapeHtml(f.id)}" data-file-name="${escapeHtml(f.name || '')}" data-source="${escapeHtml(f.source || '')}" data-is-drive="${f.isDrive ? '1' : '0'}" data-is-folder="${isFolder ? '1' : '0'}">
                    <div class="finder-file-col finder-file-col-name">
                        <span class="finder-file-icon-badge${iconBadgeClass}">
                            <span class="finder-file-icon">${isFolder ? '&#128193;' : '&#128196;'}</span>
                        </span>
                        <div class="finder-file-info">
                            <div class="finder-file-name" title="${escapeHtml(f.name || 'Untitled.md')}">${escapeHtml(displayName)}</div>
                            <div class="finder-file-meta">${escapeHtml(isFolder ? 'Directory' : (f.wordCount ? f.wordCount + ' words' : metaPrefix))}</div>
                        </div>
                    </div>
                    <div class="finder-file-col finder-file-col-preview">${escapeHtml(preview)}</div>
                    <div class="finder-file-col finder-file-col-modified">${escapeHtml(meta)}</div>
                    <div class="finder-file-col finder-file-col-source">
                        <span class="finder-file-source-chip${sourceChipClass}">${escapeHtml(metaPrefix)}</span>
                        ${directionHtml}
                        ${actionHtml}
                    </div>
                </div>`;
            }).join('');
            listEl.innerHTML = headerHtml + rowsHtml;

            listEl.querySelectorAll('.finder-file-row').forEach((row) => {
                const isFolder = row.getAttribute('data-is-folder') === '1';
                row.addEventListener('click', (e) => {
                    if (e.target.closest('[data-action]')) return;
                    if (isFolder) {
                        this.currentFolderId = row.getAttribute('data-file-id');
                        this.driveBreadcrumb.push({ id: this.currentFolderId, name: row.getAttribute('data-file-name') || '' });
                        this._refreshTree();
                        this._refreshFileList();
                        this._refreshStatus();
                        return;
                    }
                    this._openRow(row);
                });
                row.addEventListener('keydown', async (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (isFolder) {
                        this.currentFolderId = row.getAttribute('data-file-id');
                        this.driveBreadcrumb.push({ id: this.currentFolderId, name: row.getAttribute('data-file-name') || '' });
                        this._refreshTree();
                        this._refreshFileList();
                        this._refreshStatus();
                        return;
                    }
                    await this._openRow(row);
                });
                const deleteBtn = row.querySelector('[data-action="delete"]');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this._deleteRow(row);
                    });
                }
                const moveMenuBtn = row.querySelector('[data-action="move-menu"]');
                if (moveMenuBtn) {
                    moveMenuBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const menu = moveMenuBtn.closest('.finder-file-menu');
                        const willOpen = !menu.classList.contains('is-open');
                        this._closeFileMenus(menu);
                        menu.classList.toggle('is-open', willOpen);
                    });
                }
                const moveToDriveBtn = row.querySelector('[data-action="move-to-drive"]');
                if (moveToDriveBtn) {
                    moveToDriveBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this._moveRowToDrive(row);
                    });
                }
            });
        }

        async _openRow(row) {
            const id = row.getAttribute('data-file-id');
            const name = row.getAttribute('data-file-name');
            const source = row.getAttribute('data-source');
            const isDrive = row.getAttribute('data-is-drive') === '1';
            if (source === SOURCE_DRIVE && isDrive) {
                await this.controller.openDriveFile(id, name);
            } else {
                const files = await this.controller.getFileList(this.currentSource, this.currentFolderId);
                const file = files.find((f) => f.id === id);
                if (file) await this.controller.openBrowserFile(file);
            }
            this.close();
        }

        async _deleteRow(row) {
            const id = row.getAttribute('data-file-id');
            const name = row.getAttribute('data-file-name');
            const source = row.getAttribute('data-source');
            const isDrive = row.getAttribute('data-is-drive') === '1';
            if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return;
            if (source === SOURCE_DRIVE && isDrive) {
                await this.controller.deleteDriveFile(id);
            } else {
                const files = await this.controller.getFileList(this.currentSource, this.currentFolderId);
                const file = files.find((f) => f.id === id);
                if (file) await this.controller.deleteBrowserFile(file);
            }
            this._refreshFileList();
            this._refreshStatus();
            this.editor.showNotification?.('Deleted', 'success');
        }

        async _moveRowToDrive(row) {
            const id = row.getAttribute('data-file-id');
            const files = await this.controller.getFileList(this.currentSource, this.currentFolderId);
            const file = files.find((item) => item.id === id);
            if (!file) return;
            try {
                this._closeFileMenus();
                const moved = await this.controller.moveBrowserFileToDrive(file);
                this._refreshFileList();
                this._refreshStatus();
                this.editor.showNotification?.('Moved to Google Drive: ' + moved.name, 'success');
            } catch (err) {
                this.editor.showNotification?.('Could not move to Google Drive: ' + (err && err.message ? err.message : 'error'), 'error');
            }
        }

        async _onSaveHere() {
            try {
                if (this.currentSource === SOURCE_DRIVE) {
                    if (!this.editor.driveAuth?.isConnected()) {
                        this.editor.showNotification?.(
                            'Google Drive is not connected. Please reconnect first.',
                            'error'
                        );
                        return;
                    }
                    await this.controller.saveCurrentToDriveFolder(this.currentFolderId);
                    this.editor.showNotification?.('Saved to Google Drive', 'success');
                } else {
                    const ok = await this.controller.saveCurrentToBrowser();
                    if (ok) this.editor.showNotification?.('Saved to browser', 'success');
                }
                this.close();
            } catch (err) {
                this.editor.showNotification?.('Could not save: ' + (err && err.message ? err.message : 'error'), 'error');
            }
        }

        async _onNewFolder() {
            const name = window.prompt('New folder name:');
            if (!name || !name.trim()) return;
            try {
                const rootId = await this.editor.driveStorage.ensureRootFolder();
                const parentId = this.currentFolderId === 'root' ? rootId : this.currentFolderId;
                await this.editor.driveStorage.createFolder(parentId, name.trim());
                this.editor.showNotification?.('Folder created', 'success');
                this._refreshTree();
                this._refreshFileList();
            } catch (err) {
                this.editor.showNotification?.('Could not create folder: ' + (err && err.message ? err.message : 'error'), 'error');
            }
        }

        _refreshCommandBar() {
            const newFolderBtn = this.modal.querySelector('#finderNewFolder');
            if (newFolderBtn) {
                newFolderBtn.style.display = this.currentSource === SOURCE_DRIVE ? '' : 'none';
            }
        }

        _refreshStatus() {
            const statusEl = this.modal.querySelector('#finderStatus');
            if (!statusEl) return;
            this.controller.getFileList(this.currentSource, this.currentFolderId).then((files) => {
                statusEl.textContent = files.length + ' file(s)';
            }).catch(() => {
                statusEl.textContent = '';
            });
        }

        _doNewFile() {
            const promptEl = this.modal ? this.modal.querySelector('.finder-prompt') : null;
            if (promptEl) promptEl.remove();
            this.editor.editor.value = '';
            this.editor.setDocumentTitle('Untitled.md');
            this.editor.currentDriveFileId = null;
            this.editor.lastSavedContent = '';
            this.editor.setActiveDocumentId?.(null);
            this.editor.setModified(false);
            this.editor.updatePreview?.();
            this.editor.updateStats?.();
            this.editor.replaceLocalStorageFile?.();
            this.editor.editor?.focus();
            setTimeout(() => this.editor.resetScrollState?.(), 50);
            this.editor.showNotification?.('New file created', 'success');
            this.close();
        }

        close() {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            this.modal = null;
            if (this._escapeHandler) {
                document.removeEventListener('keydown', this._escapeHandler);
                this._escapeHandler = null;
            }
        }
    }

    window.FileSystemController = FileSystemController;
    window.FinderView = FinderView;
})();
