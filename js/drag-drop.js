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
            const textFiles = files.filter(file => 
                file.type === 'text/markdown' || 
                file.type === 'text/plain' || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.txt') ||
                file.name.endsWith('.markdown')
            );
            
            if (textFiles.length === 0) {
                this.editor.showNotification('Please drop a markdown or text file', 'error');
                return;
            }
            
            if (textFiles.length > 1) {
                this.editor.showNotification('Please drop only one file at a time', 'error');
                return;
            }
            
            const file = textFiles[0];
            this.handleFileDrop(file);
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
