/**
 * Drag and Drop functionality for the Markdown Editor
 */
class DragDropHandler {
    constructor(editor) {
        this.editor = editor;
        this.setupDragAndDrop();
    }
    
    setupDragAndDrop() {
        const editorPane = document.querySelector('.editor-pane');
        
        // Prevent default drag behaviors on the entire editor pane
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            editorPane.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // Add visual feedback for drag over
        editorPane.addEventListener('dragenter', (e) => {
            editorPane.classList.add('drag-over');
        });
        
        editorPane.addEventListener('dragleave', (e) => {
            // Only remove drag-over if we're leaving the editor pane entirely
            if (!editorPane.contains(e.relatedTarget)) {
                editorPane.classList.remove('drag-over');
            }
        });
        
        editorPane.addEventListener('dragover', (e) => {
            editorPane.classList.add('drag-over');
        });
        
        // Handle file drop
        editorPane.addEventListener('drop', (e) => {
            editorPane.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            const supportedFiles = files.filter(file => 
                file.type === 'text/markdown' || 
                file.type === 'text/plain' || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.txt') ||
                file.name.endsWith('.markdown') ||
                file.name.endsWith('.docx') ||
                file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            );
            
            if (supportedFiles.length === 0) {
                this.editor.showNotification('Please drop a markdown, text, or Word document file', 'error');
                return;
            }
            
            if (supportedFiles.length > 1) {
                this.editor.showNotification('Please drop only one file at a time', 'error');
                return;
            }
            
            const file = supportedFiles[0];
            
            // Check if it's a Word document
            if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                this.handleWordFileDrop(file);
            } else {
                this.handleFileDrop(file);
            }
        });
    }
    
    async handleFileDrop(file) {
        // If current content is modified, ask user what to do
        if (this.editor.isModified) {
            const action = await this.showFileReplaceDialog(file.name);
            
            if (action === 'cancel') {
                return;
            } else if (action === 'save') {
                // Save current file first
                this.editor.saveFile();
            }
            // If action is 'replace', we continue without saving
        }
        
        // Read and load the dropped file
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.editor.value = e.target.result;
            this.editor.currentFileName = file.name;
            this.editor.fileName.textContent = this.editor.currentFileName;
            this.editor.lastSavedContent = e.target.result;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            this.editor.updateCursorPosition();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }


            
            this.editor.editor.focus();
            
            this.editor.showNotification(`Loaded "${file.name}" successfully`, 'success');
        };
        
        reader.onerror = () => {
            this.editor.showNotification('Error reading file', 'error');
        };
        
        reader.readAsText(file);
    }
    
    async handleWordFileDrop(file) {
        // Check if mammoth is available with retry logic
        const checkMammoth = () => {
            return typeof mammoth !== 'undefined';
        };
        
        if (!checkMammoth()) {
            this.editor.showNotification('Checking mammoth.js availability...', 'info');
            
            // Wait a bit in case mammoth is still loading
            setTimeout(() => {
                if (!checkMammoth()) {
                    console.error('mammoth.js not available for drag-drop. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('mammoth')));
                    this.editor.showNotification('Word import feature not available. Please check browser console for details.', 'error');
                    return;
                }
                
                // If mammoth became available, continue processing
                this.processWordFileDrop(file);
            }, 200);
            return;
        }
        
        this.processWordFileDrop(file);
    }
    
    async processWordFileDrop(file) {
        // If current content is modified, ask user what to do
        if (this.editor.isModified) {
            const action = await this.showFileReplaceDialog(file.name);
            
            if (action === 'cancel') {
                return;
            } else if (action === 'save') {
                // Save current file first
                this.editor.saveFile();
            }
            // If action is 'replace', we continue without saving
        }
        
        // Show processing notification
        this.editor.showNotification(`Converting Word document: ${file.name}...`, 'info');
        
        try {
            // Read file as ArrayBuffer first (mammoth.js requires this format)
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            
            // Convert Word document to HTML using ArrayBuffer
            const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
            const html = result.value;
            
            // Convert HTML to Markdown (reuse the method from file-operations)
            const markdown = this.editor.fileOps ? 
                this.editor.fileOps.htmlToMarkdown(html) : 
                html; // Fallback to HTML if method not available
            
            // Set the converted content in the editor
            this.editor.editor.value = markdown;
            
            // Set filename with .md extension
            const originalName = file.name.replace(/\.[^/.]+$/, '');
            const newFileName = originalName + '.md';
            this.editor.currentFileName = newFileName;
            this.editor.fileName.textContent = this.editor.currentFileName;
            
            this.editor.lastSavedContent = markdown;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            this.editor.updateCursorPosition();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }
            
            // Replace localStorage buffer with converted file
            this.editor.replaceLocalStorageFile();
            
            this.editor.editor.focus();
            
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
    
    showFileReplaceDialog(fileName) {
        return new Promise((resolve) => {
            // Create modal dialog
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3>Replace Current File?</h3>
                    </div>
                    <div class="modal-body">
                        <p>You have unsaved changes in the current file.</p>
                        <p>What would you like to do with <strong>"${fileName}"</strong>?</p>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                        <button class="btn btn-primary" data-action="save">Save Current & Load New</button>
                        <button class="btn btn-danger" data-action="replace">Replace Without Saving</button>
                    </div>
                </div>
            `;
            
            // Add event listeners
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    // Clicked outside modal
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
            
            // Focus the save button by default
            modal.querySelector('[data-action="save"]').focus();
        });
    }
}

// Extend the main MarkdownEditor class with drag and drop
MarkdownEditor.prototype.setupDragAndDrop = function() {
    if (!this.dragDrop) this.dragDrop = new DragDropHandler(this);
};
