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
    async showFileBrowser() {
        try {
            // Check if we have unsaved changes
            const hasUnsavedChanges =
                !!this.editor.isModified &&
                typeof this.editor.lastSavedContent === 'string' &&
                this.editor.editor &&
                this.editor.editor.value !== this.editor.lastSavedContent;

            if (hasUnsavedChanges) {
                const action = await this.showUnsavedChangesDialog();
                if (action === 'cancel') {
                    return;
                } else if (action === 'save') {
                    const ok = await this.saveCurrentFile();
                    // If save fails, do not proceed; keep the app interactive.
                    if (!ok) return;
                }
            }
            
            if (!this.editor.indexedDBManager || !this.editor.indexedDBManager.isSupported) {
                throw new Error('IndexedDB is not available in this context');
            }
            const files = await this.editor.indexedDBManager.getAllFiles();
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-dialog file-browser-modal" style="max-width: 700px; max-height: 80vh;">
                <div class="modal-header">
                    <h3>📁 File Browser</h3>
                    <button class="btn-close-modal" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body file-browser-body">
                    <div class="file-browser-toolbar">
                        <input type="text" id="fileSearch" class="file-search-input" placeholder="Search files..." autocomplete="off">
                        <div class="file-browser-actions">
                            <button class="btn btn-sm btn-primary" id="newFileFromBrowser">+ New File</button>
                        </div>
                    </div>
                    <div class="file-list-container">
                        <div id="fileList" class="file-list">
                            ${this.renderFileList(files)}
                        </div>
                        ${files.length === 0 ? '<div class="empty-state">No files saved yet. Create a new file to get started!</div>' : ''}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancelFileBrowser">Cancel</button>
                    <button class="btn btn-primary" id="openFromDisk">Open from Disk</button>
                </div>
            </div>
        `;
        
            document.body.appendChild(modal);
            this.currentModal = modal;
        
            // Add styles if not already added
            this.addStyles();
            
            // Setup event listeners
            this.setupFileBrowserEvents(modal, files);
            
            // Focus search input
            const searchInput = modal.querySelector('#fileSearch');
            if (searchInput) {
                searchInput.focus();
            }
        } catch (e) {
            console.error('Failed to open file browser:', e);
            this.editor?.showNotification?.('Failed to open file browser (see console)', 'error');
            // Ensure no half-rendered modal blocks the UI
            if (this.currentModal && document.body.contains(this.currentModal)) {
                document.body.removeChild(this.currentModal);
            }
            this.currentModal = null;
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
        
        // Reset scroll state so scroll sync works immediately
        if (this.editor.resetScrollState) {
            this.editor.resetScrollState();
        }
        
        this.editor.showNotification(`Opened: ${file.name}`, 'success');
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


