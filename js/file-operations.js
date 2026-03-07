/**
 * File operations for the Markdown Editor
 */
class FileOperations {
    constructor(editor) {
        this.editor = editor;
    }
    
    async newFile() {
        // Always show dialog to ask what to do with current document
        const action = await this.showClearDocumentDialog();
        
        if (action === 'cancel') {
            // User canceled, don't clear the document
            return;
        } else if (action === 'save-browser') {
            // Save to IndexedDB (default action)
            let content = this.editor.editor.value;
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                content = this.editor.imageCollapse.getPreviewContent();
            }
            
            if (this.editor.fileBrowser && content.trim()) {
                const success = await this.editor.fileBrowser.saveCurrentFile();
                if (!success) {
                    // Don't proceed if save failed
                    return;
                }
            }
        } else if (action === 'download') {
            // Download the file
            let content = this.editor.editor.value;
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                content = this.editor.imageCollapse.getPreviewContent();
            }
            
            if (content.trim()) {
                const blob = new Blob([content], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.editor.currentFileName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.editor.showNotification(`Downloaded: ${this.editor.currentFileName}`, 'success');
            }
        } else if (action === 'delete') {
            // Delete current file from IndexedDB if it exists
            if (this.editor.fileBrowser && this.editor.indexedDBManager) {
                const fileId = this.editor.fileBrowser.generateFileId(this.editor.currentFileName);
                try {
                    await this.editor.indexedDBManager.deleteFile(fileId);
                    this.editor.showNotification('File deleted', 'info');
                } catch (error) {
                    console.warn('File may not exist in IndexedDB:', error);
                }
            }
        }
        // If action is 'discard', we continue without saving
        
        // Create new file
        this.editor.editor.value = '';
        this.editor.setDocumentTitle('Untitled.md');
        this.editor.currentDriveFileId = null;
        this.editor.setModified(false);
        this.editor.updatePreview();
        this.editor.updateStats();
        
        // Refresh editor minimap
        if (this.editor.minimap) this.editor.minimap.refresh();
        
        // Replace localStorage buffer with new empty file
        this.editor.replaceLocalStorageFile();
        
        this.editor.editor.focus();
        
        // Show notification
        this.editor.showNotification('New file created', 'success');
        
        // Reset scroll state AFTER everything is loaded and rendered
        setTimeout(() => {
            if (this.editor.resetScrollState) {
                this.editor.resetScrollState();
            }
        }, 50);
    }
    
    showClearDocumentDialog() {
        return new Promise((resolve) => {
            // Check if there are unsaved changes
            const hasChanges = this.editor.isModified || this.editor.editor.value.trim().length > 0;
            const message = hasChanges 
                ? '<p>You have unsaved changes in the current document.</p><p>What would you like to do?</p>'
                : '<p>What would you like to do with the current document?</p>';
            
            // Create modal dialog
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3>Clear Document?</h3>
                    </div>
                    <div class="modal-body">
                        ${message}
                    </div>
                    <div class="modal-actions clear-document-actions">
                        <button class="btn btn-secondary btn-with-icon" data-action="cancel">
                            <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M18 6 6 18"></path>
                                <path d="M6 6 18 18"></path>
                            </svg>
                            Cancel
                        </button>
                        <button class="btn btn-danger btn-with-icon" data-action="delete">
                            <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M3 6h18"></path>
                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                                <path d="M10 11v6"></path>
                                <path d="M14 11v6"></path>
                            </svg>
                            Delete
                        </button>
                        <button class="btn btn-primary btn-with-icon" data-action="download">
                            <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M12 3v10"></path>
                                <path d="M7 11l5 5 5-5"></path>
                                <path d="M5 21h14"></path>
                            </svg>
                            Download
                        </button>
                        <button class="btn btn-success btn-with-icon" data-action="save-browser">
                            <svg class="btn-icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M8 17a4 4 0 0 1 0-8 5 5 0 0 1 9.8 1.5A3.5 3.5 0 0 1 18.5 17H8z"></path>
                                <path d="M12 12v6"></path>
                                <path d="M9.5 15.5 12 18l2.5-2.5"></path>
                            </svg>
                            Save on Browser
                        </button>
                    </div>
                </div>
            `;
            
            // Add event listeners
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    // Clicked outside modal - treat as cancel
                    document.body.removeChild(modal);
                    resolve('cancel');
                }
                
                const action = e.target.getAttribute('data-action');
                if (action) {
                    document.body.removeChild(modal);
                    resolve(action);
                }
            });
            
            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(modal);
                    document.removeEventListener('keydown', handleEscape);
                    resolve('cancel');
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            document.body.appendChild(modal);
            
            // Focus the default "Save on Browser" button
            const saveButton = modal.querySelector('[data-action="save-browser"]');
            if (saveButton) {
                setTimeout(() => saveButton.focus(), 100);
            }
        });
    }
    
    openFile() {
        const canUseBrowserFiles =
            !!this.editor.fileBrowser &&
            !!this.editor.indexedDBManager &&
            !!this.editor.indexedDBManager.isSupported;

        if (canUseBrowserFiles) {
            const initialTab = this.editor.driveAuth?.isConnected() ? 'drive' : 'local';
            this.editor.fileBrowser.showFileBrowser(initialTab).catch((e) => {
                console.warn('File browser failed to open:', e);
                this.editor.showNotification('File browser failed to open (see console)', 'error');
            });
            return;
        }

        if (this.editor.fileInput) {
            this.editor.fileInput.click();
        } else {
            console.warn('fileInput element not found');
        }
    }
    
    openWordFile() {
        this.editor.wordFileInput.click();
    }
    
    handleFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.editor.value = e.target.result;
            this.editor.setDocumentTitle(file.name);
            this.editor.lastSavedContent = e.target.result;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }
            
            // Refresh editor minimap
            if (this.editor.minimap) this.editor.minimap.refresh();
            
            // Replace localStorage buffer with loaded file
            this.editor.replaceLocalStorageFile();
            
            this.editor.editor.focus();
            
            // Show notification
            this.editor.showNotification(`File loaded to localStorage: ${file.name}`, 'success');
            
            // Reset scroll state AFTER everything is loaded and rendered
            setTimeout(() => {
                if (this.editor.resetScrollState) {
                    this.editor.resetScrollState();
                }
            }, 50);
        };
        reader.readAsText(file);
        
        // Clear the input so the same file can be opened again
        event.target.value = '';
    }
    
    async handleWordFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check if mammoth is available, with retry logic
        const checkMammoth = () => {
            return typeof mammoth !== 'undefined';
        };
        
        if (!checkMammoth()) {
            this.editor.showNotification('Checking mammoth.js availability...', 'info');
            
            // Wait a bit in case mammoth is still loading
            setTimeout(() => {
                if (!checkMammoth()) {
                    console.error('mammoth.js not available. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('mammoth')));
                    this.editor.showNotification('Word import feature not available. Please check browser console for details.', 'error');
                    return;
                }
                
                // If mammoth became available, continue processing
                this.processWordFile(file);
            }, 200);
            return;
        }
        
        this.processWordFile(file);
    }
    
    async processWordFile(file) {
        // Show processing notification
        this.editor.showNotification('Converting Word document...', 'info');
        
        try {
            // Read file as ArrayBuffer first (mammoth.js requires this format)
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            
            // Convert Word document to HTML using ArrayBuffer
            const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
            const html = result.value;
            
            // Convert HTML to Markdown
            const markdown = this.htmlToMarkdown(html);
            
            // Set the converted content in the editor
            this.editor.editor.value = markdown;
            
            // Set filename with .md extension
            const originalName = file.name.replace(/\.[^/.]+$/, '');
            const newFileName = originalName + '.md';
            this.editor.setDocumentTitle(newFileName);
            
            this.editor.lastSavedContent = markdown;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }
            
            // Refresh editor minimap
            if (this.editor.minimap) this.editor.minimap.refresh();

            // Replace localStorage buffer with converted file
            this.editor.replaceLocalStorageFile();
            
            this.editor.editor.focus();
            
            // Reset scroll state AFTER everything is loaded and rendered
            setTimeout(() => {
                if (this.editor.resetScrollState) {
                    this.editor.resetScrollState();
                }
            }, 50);
            
            // Show success notification with any warnings
            const warnings = result.messages.filter(msg => msg.type === 'warning');
            let message = `Word document converted successfully: ${newFileName}`;
            if (warnings.length > 0) {
                message += ` (${warnings.length} formatting warnings)`;
            }
            this.editor.showNotification(message, 'success');
            
        } catch (error) {
            console.error('Word conversion error:', error);
            this.editor.showNotification('Failed to convert Word document: ' + error.message, 'error');
        }
    }
    
    // Helper method to read file as ArrayBuffer
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file: ' + e.target.error));
            reader.readAsArrayBuffer(file);
        });
    }
    
    // Convert HTML to Markdown
    htmlToMarkdown(html) {
        // Create a temporary DOM element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        let markdown = '';
        
        // Process each element
        const processElement = (element, indent = '') => {
            let result = '';
            
            switch (element.tagName.toLowerCase()) {
                case 'h1':
                    result = '# ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h2':
                    result = '## ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h3':
                    result = '### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h4':
                    result = '#### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h5':
                    result = '##### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h6':
                    result = '###### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'p':
                    const pText = this.processInlineElements(element);
                    if (pText.trim()) {
                        result = pText.trim() + '\n\n';
                    }
                    break;
                case 'strong':
                case 'b':
                    result = '**' + element.textContent + '**';
                    break;
                case 'em':
                case 'i':
                    result = '*' + element.textContent + '*';
                    break;
                case 'code':
                    result = '`' + element.textContent + '`';
                    break;
                case 'pre':
                    result = '```\n' + element.textContent + '\n```\n\n';
                    break;
                case 'ul':
                    for (const li of element.children) {
                        if (li.tagName.toLowerCase() === 'li') {
                            result += indent + '- ' + this.processInlineElements(li) + '\n';
                        }
                    }
                    result += '\n';
                    break;
                case 'ol':
                    let counter = 1;
                    for (const li of element.children) {
                        if (li.tagName.toLowerCase() === 'li') {
                            result += indent + counter + '. ' + this.processInlineElements(li) + '\n';
                            counter++;
                        }
                    }
                    result += '\n';
                    break;
                case 'blockquote':
                    const lines = element.textContent.trim().split('\n');
                    for (const line of lines) {
                        result += '> ' + line.trim() + '\n';
                    }
                    result += '\n';
                    break;
                case 'a':
                    const href = element.getAttribute('href') || '';
                    result = '[' + element.textContent + '](' + href + ')';
                    break;
                case 'img':
                    const src = element.getAttribute('src') || '';
                    const alt = element.getAttribute('alt') || 'image';
                    result = '![' + alt + '](' + src + ')';
                    break;
                case 'table':
                    result = this.processTable(element);
                    break;
                case 'br':
                    result = '  \n'; // Markdown line break
                    break;
                default:
                    // For other elements, process children
                    for (const child of element.childNodes) {
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            result += processElement(child, indent);
                        } else if (child.nodeType === Node.TEXT_NODE) {
                            result += child.textContent;
                        }
                    }
                    break;
            }
            
            return result;
        };
        
        // Process all child elements
        for (const child of tempDiv.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                markdown += processElement(child);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                markdown += child.textContent.trim() + '\n\n';
            }
        }
        
        // Clean up extra whitespace
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
        
        return markdown;
    }
    
    // Process inline elements within a container
    processInlineElements(container) {
        let result = '';
        
        for (const node of container.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                switch (node.tagName.toLowerCase()) {
                    case 'strong':
                    case 'b':
                        result += '**' + node.textContent + '**';
                        break;
                    case 'em':
                    case 'i':
                        result += '*' + node.textContent + '*';
                        break;
                    case 'code':
                        result += '`' + node.textContent + '`';
                        break;
                    case 'a':
                        const href = node.getAttribute('href') || '';
                        result += '[' + node.textContent + '](' + href + ')';
                        break;
                    case 'img':
                        const src = node.getAttribute('src') || '';
                        const alt = node.getAttribute('alt') || 'image';
                        result += '![' + alt + '](' + src + ')';
                        break;
                    case 'br':
                        result += '  \n';
                        break;
                    default:
                        result += node.textContent;
                        break;
                }
            }
        }
        
        return result;
    }
    
    // Process HTML table to Markdown
    processTable(table) {
        let markdown = '';
        const rows = Array.from(table.querySelectorAll('tr'));
        
        if (rows.length === 0) return '';
        
        // Process header row (assume first row is header)
        const headerRow = rows[0];
        const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
        
        if (headerCells.length > 0) {
            markdown += '| ';
            headerCells.forEach(cell => {
                markdown += cell.textContent.trim().replace(/\|/g, '\\|') + ' | ';
            });
            markdown += '\n|';
            
            // Add separator row
            headerCells.forEach(() => {
                markdown += '----------|';
            });
            markdown += '\n';
            
            // Process remaining rows
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const cells = Array.from(row.querySelectorAll('td, th'));
                
                markdown += '| ';
                cells.forEach(cell => {
                    markdown += cell.textContent.trim().replace(/\|/g, '\\|') + ' | ';
                });
                markdown += '\n';
            }
        }
        
        return markdown + '\n';
    }
    
    _getContent() {
        let content = this.editor.editor.value;
        try {
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                content = this.editor.imageCollapse.getPreviewContent();
            }
        } catch (e) {
            console.warn('getPreviewContent failed; using raw editor content', e);
            content = this.editor.editor.value;
        }
        return content;
    }

    async _saveLocalCache() {
        if (!this.editor.fileBrowser) return false;
        return await this.editor.fileBrowser.saveCurrentFile();
    }

    _triggerDownload() {
        const content = this._getContent();
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

    async smartSave() {
        const content = this._getContent();
        const hasDriveId = !!this.editor.currentDriveFileId;
        const driveConnected = !!(this.editor.driveAuth && this.editor.driveAuth.isConnected());

        if (hasDriveId && driveConnected) {
            try {
                await this.editor.driveStorage.updateFile(this.editor.currentDriveFileId, content);
                await this._saveLocalCache();
                this.editor.lastSavedContent = content;
                this.editor.setModified(false);
                this.editor.autoSave?.();
                this.editor.showNotification?.('Saved to Google Drive', 'success');
            } catch (err) {
                console.warn('Drive save failed, saving locally', err);
                const ok = await this._saveLocalCache();
                if (ok) {
                    this.editor.lastSavedContent = content;
                    this.editor.setModified(false);
                    this.editor.autoSave?.();
                    this.editor.showNotification?.('Saved locally; Drive sync failed', 'info');
                }
            }
            return;
        }

        if (hasDriveId && !driveConnected) {
            const ok = await this._saveLocalCache();
            if (ok) {
                this.editor.lastSavedContent = content;
                this.editor.setModified(false);
                this.editor.autoSave?.();
                this.editor.showNotification?.(
                    'Saved to browser. This file is linked to Google Drive but Drive is not connected. Reconnect Drive to sync.',
                    'info',
                    { dismissible: true }
                );
            }
            return;
        }

        const ok = await this._saveLocalCache();
        if (ok) {
            this.editor.lastSavedContent = content;
            this.editor.setModified(false);
            this.editor.autoSave?.();
            this.editor.showNotification?.('Saved', 'success');
        }
    }

    saveFileWithDialog() {
        const hasDriveId = !!this.editor.currentDriveFileId;

        if (!hasDriveId) {
            this._showFirstSaveDialog();
            return;
        }

        this.smartSave().then(() => {
            const driveConnected = !!(this.editor.driveAuth && this.editor.driveAuth.isConnected());
            this._showSavedDialog(driveConnected ? 'drive' : 'browser');
        });
    }

    _showFirstSaveDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        const driveAvailable = !!(this.editor.driveAuth && this.editor.driveAuth.isAvailable() && this.editor.driveAuth.isConnected());
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>Where do you want to save?</h3>
                </div>
                <div class="modal-body">
                    <p>Choose where to save <strong>${this.escapeHtml(this.editor.currentFileName || 'Untitled.md')}</strong>.</p>
                </div>
                <div class="modal-actions" style="flex-wrap: wrap; gap: 0.5rem;">
                    <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button class="btn btn-primary" data-action="download">Download</button>
                    <button class="btn btn-primary" data-action="save-browser">Save to Browser</button>
                    ${driveAvailable ? '<button class="btn btn-success" data-action="save-drive">Save to Google Drive</button>' : ''}
                </div>
            </div>
        `;

        const resolve = (action) => {
            if (modal.parentNode) document.body.removeChild(modal);
            document.removeEventListener('keydown', onKey);
            if (action === 'cancel') return;
            if (action === 'download') {
                this._triggerDownload();
                return;
            }
            if (action === 'save-browser') {
                this._saveLocalCache().then((ok) => {
                    if (ok) {
                        this.editor.lastSavedContent = this._getContent();
                        this.editor.setModified(false);
                        this.editor.autoSave?.();
                        this.editor.showNotification?.('Saved to browser', 'success');
                    }
                });
                return;
            }
            if (action === 'save-drive') {
                this.editor.fileBrowser?.showFileBrowser('drive');
            }
        };

        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                resolve('cancel');
                return;
            }
            const action = e.target.closest?.('[data-action]')?.getAttribute('data-action');
            if (action) resolve(action);
        });

        const onKey = (e) => {
            if (e.key === 'Escape') {
                resolve('cancel');
            }
        };
        document.addEventListener('keydown', onKey);
        document.body.appendChild(modal);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : text;
        return div.innerHTML;
    }

    _showSavedDialog(savedTo) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        const title = savedTo === 'drive' ? 'Saved to Google Drive' : 'Saved to Browser (Drive unavailable)';
        const driveConnected = !!(this.editor.driveAuth && this.editor.driveAuth.isConnected());
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>${this.escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    <p><strong>${this.escapeHtml(this.editor.currentFileName || 'Untitled.md')}</strong></p>
                </div>
                <div class="modal-actions" style="flex-wrap: wrap; gap: 0.5rem;">
                    <button class="btn btn-secondary" data-action="close">Close</button>
                    <button class="btn btn-primary" data-action="download">Download</button>
                    <button class="btn btn-primary" data-action="save-copy-browser">Save copy to Browser</button>
                    ${driveConnected ? '<button class="btn btn-primary" data-action="change-drive-folder">Change Drive folder</button>' : ''}
                </div>
            </div>
        `;

        const close = () => {
            if (modal.parentNode) document.body.removeChild(modal);
            document.removeEventListener('keydown', onKey);
        };

        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                close();
                return;
            }
            const action = e.target.closest?.('[data-action]')?.getAttribute('data-action');
            if (!action) return;
            if (action === 'close') {
                close();
                return;
            }
            if (action === 'download') {
                this._triggerDownload();
                close();
                return;
            }
            if (action === 'save-copy-browser') {
                const content = this._getContent();
                const baseName = (this.editor.currentFileName || 'Untitled.md').replace(/\.md$/i, '');
                const copyName = baseName + '-copy.md';
                const fileId = this.editor.fileBrowser?.generateFileId(copyName);
                if (fileId && this.editor.indexedDBManager) {
                    const now = new Date().toISOString();
                    const fileData = {
                        id: fileId,
                        name: copyName,
                        content: content,
                        cursorPosition: 0,
                        isModified: false,
                        created: now,
                        modified: now,
                        size: content.length,
                        wordCount: (content.trim().split(/\s+/).length) || 0,
                        lineCount: (content.split('\n').length) || 0
                    };
                    this.editor.indexedDBManager.saveFile(fileData).then(() => {
                        this.editor.showNotification?.('Copy saved to browser: ' + copyName, 'success');
                    }).catch((err) => {
                        console.warn('Save copy failed', err);
                        this.editor.showNotification?.('Failed to save copy', 'error');
                    });
                }
                close();
                return;
            }
            if (action === 'change-drive-folder') {
                close();
                this.editor.fileBrowser?.showFileBrowser('drive');
            }
        });

        const onKey = (e) => {
            if (e.key === 'Escape') close();
        };
        document.addEventListener('keydown', onKey);
        document.body.appendChild(modal);
    }
}

// Extend the main MarkdownEditor class with file operations
MarkdownEditor.prototype.newFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.newFile();
};

MarkdownEditor.prototype.openFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.openFile();
};

MarkdownEditor.prototype.handleFileOpen = function(event) {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.handleFileOpen(event);
};

MarkdownEditor.prototype.smartSave = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.smartSave();
};

MarkdownEditor.prototype.saveFileWithDialog = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.saveFileWithDialog();
};

MarkdownEditor.prototype.openWordFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.openWordFile();
};

MarkdownEditor.prototype.handleWordFileOpen = function(event) {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.handleWordFileOpen(event);
};
