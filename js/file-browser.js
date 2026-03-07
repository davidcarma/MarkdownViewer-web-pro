/**
 * File Browser Component for Markdown Editor
 * Provides a modal interface to browse and select files from IndexedDB
 */
class FileBrowser {
    constructor(editor) {
        this.editor = editor;
        this.currentModal = null;
    }
    
    /**
     * Generate a file ID from filename
     */
    generateFileId(fileName) {
        return fileName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'untitled-md';
    }
    
    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }
    
    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    /**
     * Show file browser modal
     */
    // Open the file browser; pass 'drive' to open straight to the Drive tab
    async showFileBrowser(initialTab = 'local') {
        try {
            const hasUnsavedChanges =
                !!this.editor.isModified &&
                typeof this.editor.lastSavedContent === 'string' &&
                this.editor.editor &&
                this.editor.editor.value !== this.editor.lastSavedContent;

            if (hasUnsavedChanges) {
                const action = await this.showUnsavedChangesDialog();
                if (action === 'cancel') return;
                if (action === 'save') {
                    const ok = await this.saveCurrentFile();
                    if (!ok) return;
                }
            }

            if (!this.editor.indexedDBManager || !this.editor.indexedDBManager.isSupported) {
                throw new Error('IndexedDB is not available in this context');
            }
            const files = await this.editor.indexedDBManager.getAllFiles();

            // Reset Drive navigation state each time the browser opens
            if (this.editor.driveBrowser) {
                this.editor.driveBrowser.reset();
            }

            const driveAvailable = !!(this.editor.driveAuth);
            const showDrive = driveAvailable && initialTab === 'drive';

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-dialog file-browser-modal" style="max-width: 700px; max-height: 82vh;">
                    <div class="modal-header">
                        <h3>Files</h3>
                        <button class="btn-close-modal" aria-label="Close">&times;</button>
                    </div>
                    ${driveAvailable ? `
                    <div class="fb-source-tabs">
                        <button class="fb-source-tab${!showDrive ? ' active' : ''}" data-tab="local">💻 This Device</button>
                        <button class="fb-source-tab${showDrive ? ' active' : ''}" data-tab="drive">☁️ Google Drive</button>
                    </div>` : ''}
                    <div class="fb-tab-pane fb-tab-local"${showDrive ? ' style="display:none"' : ''}>
                        <div class="modal-body file-browser-body">
                            <div class="file-browser-toolbar">
                                <input type="text" id="fileSearch" class="file-search-input" placeholder="Search files..." autocomplete="off">
                                <div class="file-browser-actions">
                                    <button class="btn btn-sm btn-primary" id="newFileFromBrowser">+ New File</button>
                                </div>
                            </div>
                            <div class="file-list-container">
                                <div id="fileList" class="file-list">${this.renderFileList(files)}</div>
                                ${files.length === 0 ? '<div class="empty-state">No files saved yet. Create a new file to get started!</div>' : ''}
                            </div>
                        </div>
                    </div>
                    ${driveAvailable ? `
                    <div class="fb-tab-pane fb-tab-drive"${!showDrive ? ' style="display:none"' : ''}>
                        <div id="driveTabContent" class="drive-tab-content">
                            <div class="drive-status-panel"><span class="drive-status-loading">Loading...</span></div>
                        </div>
                    </div>` : ''}
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="cancelFileBrowser">Cancel</button>
                        <button class="btn btn-primary" id="openFromDisk"${showDrive ? ' style="display:none"' : ''}>Open from Disk</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.currentModal = modal;
            this.addStyles();
            this.setupFileBrowserEvents(modal, files);

            if (driveAvailable) {
                modal.querySelectorAll('.fb-source-tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabName = tab.getAttribute('data-tab');
                        modal.querySelectorAll('.fb-source-tab').forEach(t => t.classList.remove('active'));
                        tab.classList.add('active');
                        const localPane = modal.querySelector('.fb-tab-local');
                        const drivePane = modal.querySelector('.fb-tab-drive');
                        const openFromDiskBtn = modal.querySelector('#openFromDisk');
                        if (localPane) localPane.style.display = tabName === 'local' ? '' : 'none';
                        if (drivePane) drivePane.style.display = tabName === 'drive' ? '' : 'none';
                        if (openFromDiskBtn) openFromDiskBtn.style.display = tabName === 'local' ? '' : 'none';
                        if (tabName === 'drive') {
                            const driveTabContent = modal.querySelector('#driveTabContent');
                            if (driveTabContent) this._renderDrivePane(driveTabContent, modal);
                        }
                    });
                });

                if (showDrive) {
                    const driveTabContent = modal.querySelector('#driveTabContent');
                    if (driveTabContent) this._renderDrivePane(driveTabContent, modal);
                }
            }

            if (!showDrive) {
                modal.querySelector('#fileSearch')?.focus();
            }
        } catch (e) {
            console.error('Failed to open file browser:', e);
            this.editor?.showNotification?.('Failed to open file browser (see console)', 'error');
            if (this.currentModal && document.body.contains(this.currentModal)) {
                document.body.removeChild(this.currentModal);
            }
            this.currentModal = null;
        }
    }

    // Convenience: open file browser with Drive tab active
    showFileBrowserOnDriveTab() {
        return this.showFileBrowser('drive');
    }

    // Render the Drive tab pane based on current auth state
    async _renderDrivePane(container, modal) {
        const driveAuth = this.editor.driveAuth;

        if (!driveAuth || !driveAuth.isAvailable()) {
            container.innerHTML = `
                <div class="drive-status-panel">
                    <div class="drive-status-icon">☁️</div>
                    <h4>Google Drive not available</h4>
                    <p>The Google sign-in library did not load. Check your internet connection and reload the page.</p>
                </div>`;
            return;
        }

        if (!driveAuth.isConnected()) {
            const lastEmail = driveAuth.getLastConnectedEmail?.() || '';
            container.innerHTML = `
                <div class="drive-status-panel">
                    <div class="drive-status-icon">☁️</div>
                    <h4>Google Drive</h4>
                    <p>Google Drive is not connected. Use the toolbar Drive button to connect, then return here to open and save <code>.md</code> files in your <strong>Markdown-pro</strong> folder.</p>
                    ${lastEmail ? '<p class="drive-status-last">Last connected: <strong>' + this.escapeHtml(lastEmail) + '</strong></p>' : ''}
                </div>`;
            return;
        }

        this._renderDriveConnected(container, modal);
    }

    // Render the connected Drive file list into the container
    async _renderDriveConnected(container, modal) {
        const driveAuth = this.editor.driveAuth;
        const driveBrowser = this.editor.driveBrowser;
        const driveStorage = this.editor.driveStorage;
        const email = driveAuth.getUserEmail?.() || '';

        container.innerHTML = `
            <div class="drive-connected-header">
                <span class="drive-connected-email">&#9989; ${this.escapeHtml(email || 'Google Drive connected')}</span>
            </div>
            <div id="driveFilesArea" class="drive-files-area"></div>`;

        const filesArea = container.querySelector('#driveFilesArea');
        if (!driveBrowser || !driveStorage) {
            filesArea.innerHTML = '<div class="drive-status-panel"><p>Drive not initialised.</p></div>';
            return;
        }

        filesArea.innerHTML = '<div class="drive-status-panel"><span class="drive-status-loading">Loading Markdown-pro folder...</span></div>';
        try {
            const rootId = await driveStorage.ensureRootFolder();
            driveBrowser.breadcrumb = [{ id: rootId, name: 'Markdown-pro' }];
            driveBrowser.currentFolderId = rootId;
            await driveBrowser.refreshList();
            driveBrowser.renderInto(filesArea, () => this.closeFileBrowser(modal));
            driveBrowser.addStyles();
        } catch (err) {
            filesArea.innerHTML = `
                <div class="drive-status-panel">
                    <div class="drive-status-icon">&#9888;</div>
                    <p>Could not load Drive: ${this.escapeHtml(err.message || 'error')}</p>
                    <button class="btn btn-primary" id="driveRetryLoad">Retry</button>
                </div>`;
            filesArea.querySelector('#driveRetryLoad')?.addEventListener('click', () => {
                this._renderDriveConnected(container, modal);
            });
        }
    }
    
    /**
     * Render file list HTML
     */
    renderFileList(files) {
        if (files.length === 0) {
            return '';
        }
        
        // Sort by modified date (newest first)
        const sortedFiles = [...files].sort((a, b) => {
            const dateA = new Date(a.modified || a.created || 0);
            const dateB = new Date(b.modified || b.created || 0);
            return dateB - dateA;
        });
        
        return sortedFiles.map(file => `
            <div class="file-item" data-file-id="${file.id}">
                <div class="file-item-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                    </svg>
                </div>
                <div class="file-item-info">
                    <div class="file-item-name">${this.escapeHtml(file.name || 'Untitled.md')}</div>
                    <div class="file-item-meta">
                        <span class="file-item-date">${this.formatDate(file.modified || file.created)}</span>
                        <span class="file-item-size">${this.formatFileSize(file.size || file.content?.length || 0)}</span>
                        <span class="file-item-lines">Lines: ${file.lineCount ?? this.countLines(file.content || '')}</span>
                        <span class="file-item-words">Words: ${file.wordCount ?? this.countWords(file.content || '')}</span>
                    </div>
                </div>
                <div class="file-item-actions">
                    <button class="btn-icon-small" data-action="open" title="Open">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    <button class="btn-icon-small btn-danger" data-action="delete" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Setup event listeners for file browser
     */
    setupFileBrowserEvents(modal, files) {
        // Close button
        modal.querySelector('.btn-close-modal')?.addEventListener('click', () => this.closeFileBrowser(modal));
        modal.querySelector('#cancelFileBrowser')?.addEventListener('click', () => this.closeFileBrowser(modal));
        
        // Open from disk button
        modal.querySelector('#openFromDisk')?.addEventListener('click', () => {
            this.closeFileBrowser(modal);
            this.editor.fileInput.click();
        });
        
        // New file button
        modal.querySelector('#newFileFromBrowser')?.addEventListener('click', async () => {
            this.closeFileBrowser(modal);
            await this.editor.newFile();
        });
        
        // Search functionality
        const searchInput = modal.querySelector('#fileSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterFiles(modal, files, e.target.value);
            });
        }
        
        // File item actions
        modal.querySelectorAll('.file-item').forEach(item => {
            const fileId = item.getAttribute('data-file-id');
            const file = files.find(f => f.id === fileId);
            
            // Open on click
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.file-item-actions')) return;
                await this.openFile(file);
                this.closeFileBrowser(modal);
            });
            
            // Open button
            item.querySelector('[data-action="open"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openFile(file);
                this.closeFileBrowser(modal);
            });
            
            // Delete button
            item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteFile(file, modal, files);
            });
        });
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeFileBrowser(modal);
            }
        });
        
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeFileBrowser(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }
    
    /**
     * Filter files based on search query
     */
    filterFiles(modal, files, query) {
        const fileList = modal.querySelector('#fileList');
        if (!fileList) return;
        
        const queryLower = query.toLowerCase();
        const filteredFiles = queryLower 
            ? files.filter(file => 
                file.name?.toLowerCase().includes(queryLower) ||
                file.content?.toLowerCase().includes(queryLower)
            )
            : files;
        
        fileList.innerHTML = this.renderFileList(filteredFiles);
        
        // Re-setup events for filtered items
        fileList.querySelectorAll('.file-item').forEach(item => {
            const fileId = item.getAttribute('data-file-id');
            const file = filteredFiles.find(f => f.id === fileId);
            
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.file-item-actions')) return;
                await this.openFile(file);
                this.closeFileBrowser(modal);
            });
            
            item.querySelector('[data-action="open"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.openFile(file);
                this.closeFileBrowser(modal);
            });
            
            item.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteFile(file, modal, files);
            });
        });
    }
    
    /**
     * Open a file from IndexedDB
     */
    async openFile(file) {
        if (!file) return;
        
        this.editor.editor.value = file.content || '';
        this.editor.currentFileName = file.name || 'Untitled.md';
        this.editor.currentDriveFileId = file.driveFileId || null;
        this.editor.setDocumentTitle(this.editor.currentFileName);
        this.editor.lastSavedContent = file.content || '';
        this.editor.setModified(false);
        
        // Restore cursor position if available
        if (file.cursorPosition) {
            setTimeout(() => {
                this.editor.editor.setSelectionRange(file.cursorPosition, file.cursorPosition);
            }, 100);
        }
        
        this.editor.updatePreview();
        this.editor.updateStats();
        this.editor.editor.focus();
        
        // Auto-collapse images if enabled
        if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
            this.editor.imageCollapse.initialize();
        }
        
        this.editor.showNotification(`Opened: ${file.name}`, 'success');
        
        // Reset scroll state AFTER everything is loaded and rendered
        // Use setTimeout to ensure DOM has fully updated
        setTimeout(() => {
            if (this.editor.resetScrollState) {
                this.editor.resetScrollState();
            }
        }, 50);
    }
    
    /**
     * Delete a file
     */
    async deleteFile(file, modal, allFiles) {
        if (!confirm(`Are you sure you want to delete "${file.name}"? This cannot be undone.`)) {
            return;
        }
        
        try {
            await this.editor.indexedDBManager.deleteFile(file.id);
            this.editor.showNotification(`Deleted: ${file.name}`, 'success');

            // If the user deleted the file that is currently open in the editor,
            // clear the editor + preview immediately to avoid stale preview content.
            try {
                const currentId = this.generateFileId(this.editor.currentFileName);
                if (file.id === currentId) {
                    this.editor.editor.value = '';
                    this.editor.lastSavedContent = '';
                    this.editor.setDocumentTitle('Untitled.md');
                    this.editor.currentDriveFileId = null;
                    this.editor.setModified(false);
                    this.editor.updatePreview();
                    this.editor.updateStats();

                    // Keep the localStorage buffer consistent
                    this.editor.replaceLocalStorageFile?.();

                    // Reset scroll state after DOM settles
                    setTimeout(() => this.editor.resetScrollState?.(), 50);
                }
            } catch (_) {
                // best-effort only
            }
            
            // Refresh file list
            const updatedFiles = await this.editor.indexedDBManager.getAllFiles();
            const fileList = modal.querySelector('#fileList');
            if (fileList) {
                fileList.innerHTML = this.renderFileList(updatedFiles);
                if (updatedFiles.length === 0) {
                    const container = modal.querySelector('.file-list-container');
                    if (container && !container.querySelector('.empty-state')) {
                        container.innerHTML = '<div class="empty-state">No files saved yet. Create a new file to get started!</div>';
                    }
                }
            }
            
            // Re-setup events
            this.setupFileBrowserEvents(modal, updatedFiles);
        } catch (error) {
            console.error('Failed to delete file:', error);
            this.editor.showNotification('Failed to delete file', 'error');
        }
    }
    
    /**
     * Save current file to IndexedDB
     */
    async saveCurrentFile() {
        let content = this.editor.editor.value;
        try {
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                content = this.editor.imageCollapse.getPreviewContent();
            }
        } catch (e) {
            // Never block saving / opening just because preview expansion failed.
            console.warn('getPreviewContent failed; saving raw editor content instead:', e);
            this.editor.showNotification('Preview expansion failed — saving raw content', 'info');
            content = this.editor.editor.value;
        }
        
        const fileId = this.generateFileId(this.editor.currentFileName);
        const now = new Date().toISOString();
        
        const fileData = {
            id: fileId,
            name: this.editor.currentFileName,
            content: content,
            cursorPosition: this.editor.editor.selectionStart,
            isModified: false,
            created: now,
            modified: now,
            size: content.length,
            wordCount: this.countWords(content),
            lineCount: this.countLines(content)
        };
        if (this.editor.currentDriveFileId) {
            fileData.driveFileId = this.editor.currentDriveFileId;
        }
        
        try {
            await this.editor.indexedDBManager.saveFile(fileData);
            this.editor.lastSavedContent = content;
            this.editor.setModified(false);
            // Flash LED indicator instead of notification
            if (this.editor.storageManager && this.editor.storageManager.showAutoSaveIndicator) {
                this.editor.storageManager.showAutoSaveIndicator();
            }
            return true;
        } catch (error) {
            console.error('Failed to save file:', error);
            this.editor.showNotification('Failed to save file', 'error');
            return false;
        }
    }
    
    /**
     * Show unsaved changes dialog
     */
    showUnsavedChangesDialog() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3>Unsaved Changes</h3>
                    </div>
                    <div class="modal-body">
                        <p>You have unsaved changes in the current document.</p>
                        <p>What would you like to do?</p>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                        <button class="btn btn-primary" data-action="save">Save & Continue</button>
                        <button class="btn btn-danger" data-action="discard">Discard</button>
                    </div>
                </div>
            `;
            
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    document.body.removeChild(modal);
                    resolve('cancel');
                }
                
                const action = e.target.getAttribute('data-action');
                if (action) {
                    document.body.removeChild(modal);
                    resolve(action);
                }
            });
            
            document.body.appendChild(modal);
        });
    }
    
    /**
     * Close file browser
     */
    closeFileBrowser(modal) {
        if (modal && document.body.contains(modal)) {
            document.body.removeChild(modal);
        }
        this.currentModal = null;
    }
    
    /**
     * Add styles for file browser
     */
    addStyles() {
        if (document.getElementById('file-browser-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'file-browser-styles';
        style.textContent = `
            .file-browser-modal {
                display: flex;
                flex-direction: column;
                max-height: 80vh;
            }

            .file-browser-modal .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .btn-close-modal {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--border-radius);
            }
            
            .btn-close-modal:hover {
                background-color: var(--bg-tertiary);
                color: var(--text-primary);
            }
            
            .file-browser-body {
                padding: 0;
                display: flex;
                flex-direction: column;
                max-height: 60vh;
                min-height: 0; /* critical: allow inner scroller to receive wheel */
                overflow: hidden; /* prevent body from eating scroll */
            }
            
            .file-browser-toolbar {
                padding: 1rem 1.5rem;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                gap: 0.75rem;
                align-items: center;
            }
            
            .file-search-input {
                flex: 1;
                padding: 0.5rem 1rem;
                border: 1px solid var(--border-color);
                border-radius: var(--border-radius);
                background-color: var(--bg-primary);
                color: var(--text-primary);
                font-size: 0.9rem;
            }
            
            .file-search-input:focus {
                outline: none;
                border-color: var(--accent-color);
            }
            
            .file-list-container {
                flex: 1;
                overflow-y: auto;
                min-height: 0;
                max-height: none;
                overscroll-behavior: contain;
                -webkit-overflow-scrolling: touch;
            }
            
            .file-list {
                padding: 0.5rem 0;
            }
            
            .file-item {
                display: flex;
                align-items: center;
                padding: 0.5rem 1rem; /* flatter rows */
                cursor: pointer;
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
            }
            
            .file-item:hover {
                background-color: var(--bg-tertiary);
            }
            
            .file-item-icon {
                margin-right: 0.75rem;
                color: var(--accent-color);
                flex-shrink: 0;
            }
            
            .file-item-info {
                flex: 1;
                min-width: 0;
            }
            
            .file-item-name {
                font-weight: 500;
                color: var(--text-primary);
                margin-bottom: 0.1rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            
            .file-item-meta {
                display: flex;
                gap: 0.6rem;
                flex-wrap: wrap;
                font-size: 0.75rem;
                color: var(--text-secondary);
            }
            
            .file-item-actions {
                display: flex;
                gap: 0.5rem;
                margin-left: 1rem;
                flex-shrink: 0;
            }
            
            .btn-icon-small {
                background: none;
                border: none;
                padding: 0.25rem;
                cursor: pointer;
                color: var(--text-secondary);
                border-radius: var(--border-radius);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .btn-icon-small:hover {
                background-color: var(--bg-tertiary);
                color: var(--text-primary);
            }
            
            .btn-icon-small.btn-danger:hover {
                background-color: var(--danger-color);
                color: white;
            }
            
            .empty-state {
                padding: 3rem 1.5rem;
                text-align: center;
                color: var(--text-secondary);
            }

            /* Source tabs (This Device / Google Drive) */
            .fb-source-tabs {
                display: flex;
                border-bottom: 2px solid var(--border-color);
                padding: 0 1rem;
                gap: 0;
                flex-shrink: 0;
            }
            .fb-source-tab {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                padding: 0.55rem 1.1rem;
                cursor: pointer;
                font-size: 0.9rem;
                color: var(--text-secondary);
                font-weight: 500;
                transition: color 0.15s, border-color 0.15s;
            }
            .fb-source-tab:hover { color: var(--text-primary); }
            .fb-source-tab.active {
                color: var(--accent-color);
                border-bottom-color: var(--accent-color);
            }

            /* Tab pane container */
            .fb-tab-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

            /* Drive tab content - mirrors .file-browser-body sizing */
            .drive-tab-content {
                display: flex;
                flex-direction: column;
                max-height: 60vh;
                min-height: 0;
                overflow: hidden;
            }

            /* Slim header when connected (email + disconnect button) */
            .drive-connected-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.35rem 1rem;
                border-bottom: 1px solid var(--border-color);
                flex-shrink: 0;
                font-size: 0.82rem;
                background: var(--bg-secondary);
            }
            .drive-connected-email { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

            /* The scrollable area that renderInto() populates */
            .drive-files-area {
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* Status panel (not connected / error / loading states) */
            .drive-status-panel {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.65rem;
                padding: 2.5rem 2rem;
                text-align: center;
                flex: 1;
            }
            .drive-status-panel h4 { margin: 0; font-size: 1rem; color: var(--text-primary); }
            .drive-status-panel p  { margin: 0; font-size: 0.88rem; color: var(--text-secondary); max-width: 360px; line-height: 1.5; }
            .drive-status-panel code { background: var(--bg-tertiary); padding: 0.1rem 0.3rem; border-radius: 3px; }
            .drive-status-icon { font-size: 2rem; line-height: 1; }
            .drive-status-loading { color: var(--text-secondary); font-size: 0.9rem; }
            .drive-status-last { font-size: 0.82rem; color: var(--text-secondary); margin: 0; }

            @keyframes fb-spin { to { transform: rotate(360deg); } }
            .drive-spin { display: inline-block; animation: fb-spin 1s linear infinite; }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Helper methods
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    countWords(text) {
        return text.trim() ? text.trim().split(/\s+/).length : 0;
    }
    
    countLines(text) {
        return text ? text.split('\n').length : 0;
    }
}


