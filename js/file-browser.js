/**
 * File helpers for the finder-based file system.
 * This class intentionally no longer renders any file browser UI.
 */
class FileBrowser {
    constructor(editor) {
        this.editor = editor;
    }
    
    generateFileId(fileName) {
        return fileName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'untitled-md';
    }
    
    countWords(text) {
        return text.trim() ? text.trim().split(/\s+/).length : 0;
    }

    countLines(text) {
        return text ? text.split('\n').length : 0;
    }

    async saveCurrentFile() {
        let content = this.editor.editor.value;
        try {
            if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
                content = this.editor.imageCollapse.getPreviewContent();
            }
        } catch (e) {
            console.warn('getPreviewContent failed; saving raw editor content instead:', e);
            this.editor.showNotification('Preview expansion failed - saving raw content', 'info');
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
            if (this.editor.setActiveDocumentId) this.editor.setActiveDocumentId(fileId);
            this.editor.lastSavedContent = content;
            this.editor.setModified(false);
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
                    return;
                }
                
                const action = e.target.closest?.('[data-action]')?.getAttribute('data-action');
                if (action) {
                    document.body.removeChild(modal);
                    resolve(action);
                }
            });
            
            document.body.appendChild(modal);
        });
    }
}


