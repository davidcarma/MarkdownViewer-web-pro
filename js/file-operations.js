/**
 * File operations for the Markdown Editor
 */
class FileOperations {
    constructor(editor) {
        this.editor = editor;
    }
    
    newFile() {
        if (this.editor.isModified) {
            if (!confirm('You have unsaved changes. Are you sure you want to create a new file?')) {
                return;
            }
        }
        
        this.editor.editor.value = '';
        this.editor.setDocumentTitle('Untitled.md');
        this.editor.setModified(false);
        this.editor.updatePreview();
        this.editor.updateStats();
        
        // Save new empty file to localStorage
        this.editor.autoSave();
        
        this.editor.editor.focus();
        
        // Show notification
        this.editor.showNotification('New file created', 'success');
    }
    
    openFile() {
        this.editor.fileInput.click();
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

            // Save opened file to localStorage
            this.editor.autoSave();
            
            this.editor.editor.focus();
            
            // Show notification
            this.editor.showNotification(`File opened: ${file.name}`, 'success');
        };
        reader.readAsText(file);
        
        // Clear the input so the same file can be opened again
        event.target.value = '';
    }
    
    saveFile() {
        // Get expanded content for saving (with full image data URLs)
        let content = this.editor.editor.value;
        if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
            content = this.editor.imageCollapse.getPreviewContent();
        }
        
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
        
        this.editor.lastSavedContent = content;
        this.editor.setModified(false);
        
        // Also save to localStorage
        this.editor.autoSave();
        
        // Show notification
        this.editor.showNotification(`File saved: ${this.editor.currentFileName}`, 'success');
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

MarkdownEditor.prototype.saveFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.saveFile();
};
