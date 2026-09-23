/**
 * File picker for open/save/new: locations rail, breadcrumb, and a single list.
 * Drive folders are entered from the list or breadcrumb, not a separate tree pane.
 */
(function () {
    'use strict';

    const SOURCE_BROWSER = 'browser';
    const SOURCE_DRIVE = 'drive';
    const SOURCE_RECENT = 'recent';

    const ICON_FOLDER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2"></path><path d="M3 8h18l-2 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L3 8z"></path></svg>';
    const ICON_FILE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
    const ICON_DEVICE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
    const ICON_RECENT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
    const ICON_DRIVE = '<svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path class="drive-icon-green" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path class="drive-icon-blue" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"/><path class="drive-icon-yellow" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"/><path class="drive-icon-blue" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path class="drive-icon-red" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path class="drive-icon-yellow" d="m73.4 26.8-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>';
    const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

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

    function sourceIcon(icon) {
        if (icon === 'drive') return ICON_DRIVE;
        if (icon === 'recent') return ICON_RECENT;
        return ICON_DEVICE;
    }

    function normalizeMarkdownName(raw) {
        let name = String(raw || '').trim();
        if (!name) name = 'Untitled.md';
        if (!/\.md$/i.test(name)) name += '.md';
        return name;
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
            if (this.editor.driveAuth && this.editor.driveAuth.isAvailable()) {
                list.splice(1, 0, { id: SOURCE_DRIVE, label: 'Google Drive', icon: 'drive' });
            }
            return list;
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
            if (source === SOURCE_DRIVE && this.editor.driveStorage) {
                if (!this.editor.driveAuth?.isConnected()) return [];
                const effectiveId = await this.editor.driveStorage.resolveWorkingFolder(folderId, { fallbackToRoot: true });
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

        async saveCurrentToDriveFolder(folderId, fileName) {
            const content = this.getEditorContent();
            const name = normalizeMarkdownName(fileName || this.editor.currentFileName);
            this.editor.currentFileName = name;
            this.editor.setDocumentTitle?.(name);
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled-md';
            const effectiveId = await this.editor.driveStorage.resolveWorkingFolder(folderId);
            const saved = await this.editor.driveStorage.createFile(effectiveId, name, content);
            this.editor.currentDriveFileId = saved.id;
            if (this.editor.indexedDBManager) {
                await this.editor.indexedDBManager.saveFile({
                    id: slug, name: name, content,
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
            const targetFolderId = await this.editor.driveStorage.resolveWorkingFolder(folderId || 'root');
            const saved = await this.editor.driveStorage.createFile(targetFolderId, name, content);
            const driveFileId = saved.id;

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
            this.currentFolderId = null;
            this.selectedFile = null;
            this.driveBreadcrumb = [];
            this._escapeHandler = null;
            this._selectedIds = new Set();
            this._lastClickedIndex = null;
            this._currentFiles = [];
            this._overwriteFileId = null;
        }

        _isDriveConnected() {
            return !!(this.editor.driveAuth?.isConnected() && this.editor.driveStorage);
        }

        _driveFolderId() {
            const last = this.driveBreadcrumb[this.driveBreadcrumb.length - 1];
            return last && last.id ? last.id : null;
        }

        async _loadDriveRoot() {
            const rootId = await this.editor.driveStorage.ensureRootFolder();
            this.driveBreadcrumb = [{ id: rootId, name: 'Markdown-pro' }];
            this.currentFolderId = rootId;
            return rootId;
        }

        _resetDrivePath() {
            this.driveBreadcrumb = [];
            this.currentFolderId = null;
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
            this.currentFolderId = null;
            this.selectedFile = null;
            this._selectedIds.clear();
            this._lastClickedIndex = null;
            this._currentFiles = [];
            this._overwriteFileId = null;

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
                const driveNote = this._isDriveConnected() ? 'Markdown-pro' : 'Not connected';
                const disconnected = icon === 'drive' && !this._isDriveConnected() ? ' is-disconnected' : '';
                return `<button type="button" class="finder-source-item finder-source-item-${escapeHtml(icon)}${disconnected}${active}" data-source="${escapeHtml(s.id)}">
                    <span class="finder-source-icon">${sourceIcon(icon)}</span>
                    <span class="finder-source-copy">
                        <span class="finder-source-name">${escapeHtml(s.label)}</span>
                        <span class="finder-source-note">${icon === 'drive' ? driveNote : icon === 'recent' ? 'Quick access' : 'Local drafts'}</span>
                    </span>
                </button>`;
            }).join('');

            const isSave = this.mode === 'save';
            const title = isSave ? 'Save' : this.mode === 'open' ? 'Open' : 'Files';
            const subtitle = isSave
                ? 'Choose a folder and file name'
                : this.mode === 'new'
                    ? 'Start clean without losing your current work'
                    : 'Browse local and Google Drive markdown files';
            const connectionLabel = this.editor.driveAuth?.isConnected()
                ? 'Drive connected'
                : 'Browser only';
            const defaultName = normalizeMarkdownName(this.editor.currentFileName || 'Untitled.md');

            this.modal = document.createElement('div');
            this.modal.className = 'finder-overlay' + (isSave ? ' is-save' : ' is-open');
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
                        <div class="finder-main">
                            <div class="finder-command-bar">
                                <button type="button" class="btn btn-sm btn-primary" id="finderNewFile">New File</button>
                                <button type="button" class="btn btn-sm btn-secondary" id="finderNewFolder">New Folder</button>
                                <button type="button" class="btn btn-sm btn-secondary" id="finderImport">Import from Disk</button>
                                <input type="text" class="finder-search" id="finderSearch" placeholder="Search..." autocomplete="off">
                            </div>
                            <nav class="finder-breadcrumb" id="finderBreadcrumb"></nav>
                            <form class="finder-new-folder" id="finderNewFolderForm" hidden>
                                <input type="text" id="finderNewFolderName" placeholder="Folder name" autocomplete="off" maxlength="120">
                                <button type="submit" class="btn btn-sm btn-primary" id="finderNewFolderCreate">Create</button>
                                <button type="button" class="btn btn-sm btn-secondary" id="finderNewFolderCancel">Cancel</button>
                            </form>
                            <div class="finder-file-list" id="finderFileList"></div>
                        </div>
                    </div>
                    <div class="finder-save-footer" id="finderSaveFooter">
                        <label class="finder-filename-label" for="finderFileName">File name</label>
                        <input type="text" class="finder-filename" id="finderFileName" value="${escapeHtml(defaultName)}" autocomplete="off">
                        <div class="finder-destination" id="finderDestination"></div>
                        <button type="button" class="btn btn-sm btn-secondary" id="finderSaveToDisk">Save to Disk</button>
                        <button type="button" class="btn btn-sm btn-primary" id="finderSaveHere">Save here</button>
                    </div>
                    <div class="finder-status-bar" id="finderStatus"></div>
                </div>`;

            document.body.appendChild(this.modal);

            if (this.currentSource === SOURCE_DRIVE) {
                this._activateDriveSource().then(() => this._refreshAfterNavigate());
            }

            this.modal.querySelector('.finder-close').addEventListener('click', () => this.close());
            this.modal.addEventListener('click', (e) => {
                const fileMenu = e.target.closest ? e.target.closest('.finder-file-menu') : null;
                if (!fileMenu) this._closeFileMenus();
                if (e.target === this.modal) this.close();
            });
            this._escapeHandler = (e) => {
                if (e.key !== 'Escape') return;
                const form = this.modal && this.modal.querySelector('#finderNewFolderForm');
                if (form && !form.hidden) {
                    this._hideNewFolderForm();
                    return;
                }
                this.close();
            };
            document.addEventListener('keydown', this._escapeHandler);

            this.modal.querySelectorAll('.finder-source-item').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    await this._selectSource(btn.getAttribute('data-source'));
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

            this.modal.querySelector('#finderNewFolder').addEventListener('click', () => this._showNewFolderForm());
            this.modal.querySelector('#finderNewFolderForm').addEventListener('submit', (e) => {
                e.preventDefault();
                this._onNewFolder();
            });
            this.modal.querySelector('#finderNewFolderCancel').addEventListener('click', () => this._hideNewFolderForm());

            this.modal.querySelector('#finderImport').addEventListener('click', () => {
                this.close();
                if (this.editor.fileInput) this.editor.fileInput.click();
            });

            this.modal.querySelector('#finderSaveHere').addEventListener('click', () => this._onSaveHere());
            this.modal.querySelector('#finderSaveToDisk').addEventListener('click', () => {
                this._applyFooterFileName();
                this.controller.triggerDownload();
                this.close();
            });

            const searchInput = this.modal.querySelector('#finderSearch');
            if (searchInput) {
                searchInput.addEventListener('input', () => this._refreshFileList());
            }

            this._refreshAfterNavigate();
        }

        _refreshAfterNavigate() {
            this._refreshCommandBar();
            this._refreshBreadcrumb();
            this._refreshDestination();
            this._refreshFileList();
            this._refreshStatus();
        }

        async _selectSource(sourceId) {
            this.currentSource = sourceId;
            this._overwriteFileId = null;
            this._selectedIds.clear();
            this._lastClickedIndex = null;
            this._currentFiles = [];
            this._hideNewFolderForm();
            if (sourceId === SOURCE_DRIVE) {
                await this._activateDriveSource();
            } else {
                this._resetDrivePath();
            }
            this._refreshSources();
            this._refreshAfterNavigate();
        }

        async _activateDriveSource() {
            this.currentSource = SOURCE_DRIVE;
            if (!this._isDriveConnected()) {
                this._resetDrivePath();
                return;
            }
            try {
                await this._loadDriveRoot();
            } catch (err) {
                this._resetDrivePath();
                this.editor.showNotification?.(
                    'Could not load Google Drive. ' + (err && err.message ? err.message : 'Please reconnect.'),
                    'error'
                );
            }
        }

        async _connectDriveFromPicker() {
            if (!this.editor.driveAuth) return;
            const result = await this.editor.driveAuth.connect();
            if (result && result.ok) {
                this.editor.showNotification?.('Connected to Google Drive', 'success');
                await this._activateDriveSource();
                this._refreshSources();
                this._rebuildSourceRailNotes();
                this._refreshAfterNavigate();
                return;
            }
            const err = this.editor.driveAuth.getLastError?.() || 'Sign-in did not complete.';
            this.editor.showNotification?.('Could not connect to Google Drive. ' + err, 'info', { dismissible: true });
        }

        _rebuildSourceRailNotes() {
            if (!this.modal) return;
            this.modal.querySelectorAll('.finder-source-item').forEach((btn) => {
                const id = btn.getAttribute('data-source');
                const note = btn.querySelector('.finder-source-note');
                if (id === SOURCE_DRIVE && note) {
                    note.textContent = this._isDriveConnected() ? 'Markdown-pro' : 'Not connected';
                    btn.classList.toggle('is-disconnected', !this._isDriveConnected());
                }
            });
        }

        _refreshSources() {
            if (!this.modal) return;
            this.modal.querySelectorAll('.finder-source-item').forEach((btn) => {
                const id = btn.getAttribute('data-source');
                btn.classList.toggle('active', id === this.currentSource);
            });
        }

        _refreshCommandBar() {
            if (!this.modal) return;
            const isSave = this.mode === 'save';
            const isDrive = this.currentSource === SOURCE_DRIVE;
            const newFile = this.modal.querySelector('#finderNewFile');
            const newFolder = this.modal.querySelector('#finderNewFolder');
            const importBtn = this.modal.querySelector('#finderImport');
            const saveFooter = this.modal.querySelector('#finderSaveFooter');
            const saveHere = this.modal.querySelector('#finderSaveHere');
            if (newFile) newFile.hidden = isSave;
            if (importBtn) importBtn.hidden = isSave;
            if (newFolder) newFolder.hidden = !(isDrive && this._isDriveConnected());
            if (saveFooter) saveFooter.hidden = !isSave;
            if (saveHere && isSave) saveHere.disabled = isDrive && !this._isDriveConnected();
            if (!isDrive || !this._isDriveConnected()) this._hideNewFolderForm();
        }

        _destinationLabel() {
            if (this.currentSource === SOURCE_DRIVE && this.driveBreadcrumb.length > 0) {
                return this.driveBreadcrumb.map((b) => b.name).join(' / ');
            }
            if (this.currentSource === SOURCE_DRIVE) return 'Google Drive (not connected)';
            if (this.currentSource === SOURCE_RECENT) return 'Recent files';
            return 'This Device';
        }

        _refreshDestination() {
            const el = this.modal?.querySelector('#finderDestination');
            if (!el) return;
            el.textContent = this._destinationLabel();
        }

        _showNewFolderForm() {
            if (!this._isDriveConnected() || !this._driveFolderId()) return;
            const form = this.modal?.querySelector('#finderNewFolderForm');
            const input = this.modal?.querySelector('#finderNewFolderName');
            if (!form || !input) return;
            form.hidden = false;
            input.value = '';
            input.focus();
        }

        _hideNewFolderForm() {
            const form = this.modal?.querySelector('#finderNewFolderForm');
            if (form) form.hidden = true;
        }

        _enterFolder(id, name) {
            if (this.currentSource !== SOURCE_DRIVE) return;
            if (!id || this._driveFolderId() === id) return;
            const listed = this._currentFiles.find((f) => f.isFolder && f.id === id);
            if (!listed) return;
            this.driveBreadcrumb.push({ id: listed.id, name: listed.name || name || '' });
            this.currentFolderId = listed.id;
            this._overwriteFileId = null;
            this._hideNewFolderForm();
            this._refreshAfterNavigate();
        }

        _applyFooterFileName() {
            const input = this.modal?.querySelector('#finderFileName');
            if (!input) return normalizeMarkdownName(this.editor.currentFileName);
            const name = normalizeMarkdownName(input.value);
            input.value = name;
            this.editor.currentFileName = name;
            this.editor.setDocumentTitle?.(name);
            return name;
        }

        async _refreshFileList() {
            const listEl = this.modal?.querySelector('#finderFileList');
            if (!listEl) return;
            const query = (this.modal.querySelector('#finderSearch') && this.modal.querySelector('#finderSearch').value) || '';
            if (this.currentSource === SOURCE_DRIVE && !this._isDriveConnected()) {
                listEl.innerHTML = `<div class="finder-empty">
                    <p>Google Drive is not connected</p>
                    <p>Connect to browse and save inside your Markdown-pro folder.</p>
                    <button type="button" class="btn btn-sm btn-primary" id="finderConnectDrive">Connect Google Drive</button>
                </div>`;
                const connectBtn = listEl.querySelector('#finderConnectDrive');
                if (connectBtn) connectBtn.addEventListener('click', () => this._connectDriveFromPicker());
                return;
            }
            let files = await this.controller.getFileList(this.currentSource, this.currentSource === SOURCE_DRIVE ? this._driveFolderId() : this.currentFolderId);
            if (query.trim()) {
                const q = query.toLowerCase();
                files = files.filter((f) => (f.name || '').toLowerCase().includes(q));
            }
            this._currentFiles = files;
            if (files.length === 0) {
                const driveHint = this.currentSource === SOURCE_DRIVE
                    ? 'Create a folder or save a markdown file here.'
                    : 'Use New File or Import from Disk.';
                listEl.innerHTML = '<div class="finder-empty"><p>No files in this folder</p><p>' + driveHint + '</p></div>';
                return;
            }
            const headerHtml = `<div class="finder-list-header">
                <div>Name</div>
                <div>Modified</div>
            </div>`;
            const rowsHtml = files.map((f, i) => {
                const isFolder = !!f.isFolder;
                const meta = f.source === SOURCE_DRIVE
                    ? formatDate(f.modified)
                    : (formatDate(f.modified) + (f.size ? ' · ' + formatSize(f.size) : ''));
                const canMoveToDrive = this.mode !== 'save' && !isFolder &&
                    f.source !== SOURCE_DRIVE &&
                    !!(this.editor.driveAuth?.isConnected() && this.editor.driveStorage);
                const showActions = this.mode !== 'save' && !isFolder;
                const checkboxHtml = canMoveToDrive
                    ? `<label class="finder-file-check" onclick="event.stopPropagation()"><input type="checkbox" class="finder-file-checkbox" data-check-id="${escapeHtml(f.id)}"${this._selectedIds.has(f.id) ? ' checked' : ''}></label>`
                    : '';
                const actionHtml = showActions
                    ? `<div class="finder-file-actions">
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
                    </div>`
                    : '';
                const selected = this._overwriteFileId === f.id || this._selectedIds.has(f.id);
                const rowClass = (isFolder ? ' is-folder' : ' is-file') + (selected ? ' is-selected' : '');
                const iconBadgeClass = isFolder ? ' is-folder' : (f.source === SOURCE_DRIVE ? ' is-drive' : ' is-browser');
                const displayName = truncateMiddle(f.name || 'Untitled.md', 28, 12);
                const subtitle = isFolder ? 'Folder' : (f.wordCount ? f.wordCount + ' words' : '');
                const directionHtml = isFolder
                    ? `<div class="finder-file-direction" aria-hidden="true">${ICON_CHEVRON}</div>`
                    : '';
                return `<div class="finder-file-row${rowClass}" role="button" tabindex="0" data-file-id="${escapeHtml(f.id)}" data-file-name="${escapeHtml(f.name || '')}" data-source="${escapeHtml(f.source || '')}" data-is-drive="${f.isDrive ? '1' : '0'}" data-is-folder="${isFolder ? '1' : '0'}" data-file-index="${i}">
                    <div class="finder-file-col finder-file-col-name">
                        ${checkboxHtml}
                        <span class="finder-file-icon-badge${iconBadgeClass}">
                            <span class="finder-file-icon">${isFolder ? ICON_FOLDER : ICON_FILE}</span>
                        </span>
                        <div class="finder-file-info">
                            <div class="finder-file-name" title="${escapeHtml(f.name || 'Untitled.md')}">${escapeHtml(displayName)}</div>
                            ${subtitle ? `<div class="finder-file-meta">${escapeHtml(subtitle)}</div>` : ''}
                        </div>
                    </div>
                    <div class="finder-file-col finder-file-col-modified">${escapeHtml(meta)}</div>
                    <div class="finder-file-col finder-file-col-actions">
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
                    if (e.target.closest('.finder-file-check')) return;
                    if (isFolder) {
                        this._enterFolder(row.getAttribute('data-file-id'), row.getAttribute('data-file-name') || '');
                        return;
                    }
                    if (this.mode === 'save') {
                        this._selectSaveTarget(row);
                        return;
                    }
                    const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey;
                    const hasCheckbox = !!row.querySelector('.finder-file-checkbox');
                    if (hasModifier && hasCheckbox) {
                        const fileId = row.getAttribute('data-file-id');
                        const rowIdx = parseInt(row.getAttribute('data-file-index'), 10);
                        if (e.shiftKey && this._lastClickedIndex != null) {
                            if (!e.ctrlKey && !e.metaKey) this._selectedIds.clear();
                            const lo = Math.min(this._lastClickedIndex, rowIdx);
                            const hi = Math.max(this._lastClickedIndex, rowIdx);
                            for (let k = lo; k <= hi; k++) {
                                const cf = this._currentFiles[k];
                                if (cf && !cf.isFolder && cf.source !== SOURCE_DRIVE) {
                                    this._selectedIds.add(cf.id);
                                }
                            }
                        } else {
                            if (this._selectedIds.has(fileId)) {
                                this._selectedIds.delete(fileId);
                            } else {
                                this._selectedIds.add(fileId);
                            }
                            this._lastClickedIndex = rowIdx;
                        }
                        this._syncSelectionUI();
                        this._refreshBatchBar();
                        return;
                    }
                    this._openRow(row);
                });
                row.addEventListener('keydown', async (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    if (isFolder) {
                        this._enterFolder(row.getAttribute('data-file-id'), row.getAttribute('data-file-name') || '');
                        return;
                    }
                    if (this.mode === 'save') {
                        this._selectSaveTarget(row);
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
                const checkbox = row.querySelector('.finder-file-checkbox');
                if (checkbox) {
                    checkbox.addEventListener('change', () => {
                        const fid = checkbox.getAttribute('data-check-id');
                        if (checkbox.checked) {
                            this._selectedIds.add(fid);
                            row.classList.add('is-selected');
                        } else {
                            this._selectedIds.delete(fid);
                            row.classList.remove('is-selected');
                        }
                        this._lastClickedIndex = parseInt(row.getAttribute('data-file-index'), 10);
                        this._refreshBatchBar();
                    });
                }
            });

            const visibleIds = new Set(files.filter((f) => !f.isFolder && f.source !== SOURCE_DRIVE).map((f) => f.id));
            for (const id of this._selectedIds) {
                if (!visibleIds.has(id)) this._selectedIds.delete(id);
            }
            this._refreshBatchBar();
        }

        _selectSaveTarget(row) {
            const name = row.getAttribute('data-file-name') || '';
            const input = this.modal.querySelector('#finderFileName');
            if (input) input.value = normalizeMarkdownName(name);
            this._overwriteFileId = row.getAttribute('data-file-id');
            this.modal.querySelectorAll('.finder-file-row').forEach((r) => {
                r.classList.toggle('is-selected', r === row);
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

        _syncSelectionUI() {
            if (!this.modal) return;
            this.modal.querySelectorAll('.finder-file-row').forEach((row) => {
                const fid = row.getAttribute('data-file-id');
                const sel = this._selectedIds.has(fid);
                row.classList.toggle('is-selected', sel);
                const cb = row.querySelector('.finder-file-checkbox');
                if (cb) cb.checked = sel;
            });
        }

        _refreshBreadcrumb() {
            const el = this.modal?.querySelector('#finderBreadcrumb');
            if (!el) return;
            if (this.currentSource === SOURCE_RECENT) {
                el.innerHTML = '<span class="finder-crumb is-current">Recent files</span>';
                return;
            }
            if (this.currentSource === SOURCE_BROWSER) {
                el.innerHTML = '<span class="finder-crumb is-current">My files</span>';
                return;
            }
            if (this.currentSource === SOURCE_DRIVE && !this._isDriveConnected()) {
                el.innerHTML = '<span class="finder-crumb is-current">Markdown-pro</span>';
                return;
            }
            if (this.currentSource === SOURCE_DRIVE && this.driveBreadcrumb.length > 0) {
                el.innerHTML = this.driveBreadcrumb.map((b, idx) => {
                    const isLast = idx === this.driveBreadcrumb.length - 1;
                    const sep = idx > 0 ? '<span class="finder-crumb-sep">/</span>' : '';
                    if (isLast) {
                        return sep + '<span class="finder-crumb is-current">' + escapeHtml(b.name) + '</span>';
                    }
                    return sep + '<button type="button" class="finder-crumb" data-crumb-index="' + idx + '">' + escapeHtml(b.name) + '</button>';
                }).join('');
                el.querySelectorAll('button.finder-crumb').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        let idx = parseInt(btn.getAttribute('data-crumb-index'), 10);
                        if (!Number.isFinite(idx) || idx < 0) idx = 0;
                        if (idx >= this.driveBreadcrumb.length) return;
                        this.driveBreadcrumb = this.driveBreadcrumb.slice(0, Math.max(idx, 0) + 1);
                        this.currentFolderId = this._driveFolderId();
                        this._overwriteFileId = null;
                        this._refreshAfterNavigate();
                    });
                });
                return;
            }
            el.innerHTML = '';
        }

        _refreshBatchBar() {
            const statusEl = this.modal?.querySelector('#finderStatus');
            if (!statusEl) return;
            const count = this._selectedIds.size;
            if (count === 0) {
                this._refreshStatus();
                return;
            }
            statusEl.innerHTML =
                '<span>' + count + ' file(s) selected</span>' +
                '<button type="button" class="btn btn-sm btn-primary" id="finderBatchMove">Move ' + count + ' to Google Drive</button>';
            statusEl.querySelector('#finderBatchMove').addEventListener('click', () => this._moveSelectedToDrive());
        }

        async _moveSelectedToDrive() {
            const ids = [...this._selectedIds];
            if (ids.length === 0) return;
            const files = await this.controller.getFileList(this.currentSource, this.currentFolderId);
            let moved = 0;
            let failed = 0;
            for (const id of ids) {
                const file = files.find((f) => f.id === id);
                if (!file) continue;
                try {
                    await this.controller.moveBrowserFileToDrive(file);
                    moved++;
                } catch (_) {
                    failed++;
                }
            }
            this._selectedIds.clear();
            this._refreshFileList();
            this._refreshBatchBar();
            const msg = 'Moved ' + moved + ' file(s) to Google Drive' + (failed > 0 ? ', ' + failed + ' failed' : '');
            this.editor.showNotification?.(msg, failed > 0 ? 'warning' : 'success');
        }

        async _onSaveHere() {
            try {
                const name = this._applyFooterFileName();
                if (this.currentSource === SOURCE_DRIVE) {
                    if (!this.editor.driveAuth?.isConnected()) {
                        this.editor.showNotification?.(
                            'Google Drive is not connected. Please reconnect first.',
                            'error'
                        );
                        return;
                    }
                    const folderId = this._driveFolderId();
                    if (!folderId) {
                        this.editor.showNotification?.('Choose a Google Drive folder first.', 'error');
                        return;
                    }
                    await this.controller.saveCurrentToDriveFolder(folderId, name);
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
            const input = this.modal?.querySelector('#finderNewFolderName');
            const name = (input && input.value || '').trim();
            if (!name) {
                input?.focus();
                return;
            }
            const parentId = this._driveFolderId();
            if (!this._isDriveConnected() || !parentId) {
                this.editor.showNotification?.('Connect Google Drive first.', 'error');
                return;
            }
            try {
                const folder = await this.editor.driveStorage.createFolder(parentId, name);
                this.editor.showNotification?.(
                    folder && folder.existed ? 'Using existing folder' : 'Folder created',
                    'success'
                );
                this._hideNewFolderForm();
                this._refreshFileList();
                this._refreshStatus();
            } catch (err) {
                this.editor.showNotification?.('Could not create folder: ' + (err && err.message ? err.message : 'error'), 'error');
            }
        }

        _refreshStatus() {
            const statusEl = this.modal?.querySelector('#finderStatus');
            if (!statusEl) return;
            if (this.currentSource === SOURCE_DRIVE && !this._isDriveConnected()) {
                statusEl.textContent = 'Not connected';
                return;
            }
            const folderId = this.currentSource === SOURCE_DRIVE ? this._driveFolderId() : this.currentFolderId;
            this.controller.getFileList(this.currentSource, folderId).then((files) => {
                const folders = files.filter((f) => f.isFolder).length;
                const docs = files.length - folders;
                const parts = [];
                if (folders) parts.push(folders + ' folder' + (folders === 1 ? '' : 's'));
                parts.push(docs + ' file' + (docs === 1 ? '' : 's'));
                statusEl.textContent = parts.join(', ');
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
