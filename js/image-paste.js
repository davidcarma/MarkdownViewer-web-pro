/**
 * Image paste functionality for the Markdown Editor
 */
class ImagePasteHandler {
    constructor(editor) {
        this.editor = editor;
        this.setupImagePaste();
    }
    
    setupImagePaste() {
        // Listen for paste events on the editor
        this.editor.editor.addEventListener('paste', (e) => {
            this.handlePaste(e);
        });
    }
    
    async handlePaste(e) {
        // Check if clipboard contains files (images)
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(item => item.type.startsWith('image/'));
        
        if (imageItems.length === 0) {
            // No images in clipboard, let default paste behavior happen
            return;
        }
        
        // Prevent default paste behavior for images
        e.preventDefault();
        
        try {
            // Process each image
            for (const item of imageItems) {
                await this.processImagePaste(item);
            }
        } catch (error) {
            console.error('Error processing pasted image:', error);
            this.editor.showNotification('Error processing pasted image', 'error');
        }
    }
    
    async processImagePaste(item) {
        return new Promise((resolve, reject) => {
            const file = item.getAsFile();
            if (!file) {
                reject(new Error('Could not get file from clipboard item'));
                return;
            }
            
            // Show visual feedback
            const editorPane = document.querySelector('.editor-pane');
            editorPane.classList.add('processing-image');
            this.editor.showNotification('Processing pasted image...', 'info');
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const dataUrl = e.target.result;
                    const fileName = this.generateImageFileName(file.type);
                    
                    // Insert markdown image syntax at cursor position
                    this.insertImageAtCursor(fileName, dataUrl);
                    
                    // Remove processing state
                    const editorPane = document.querySelector('.editor-pane');
                    editorPane.classList.remove('processing-image');
                    
                    this.editor.showNotification('Image pasted successfully!', 'success');
                    resolve();
                } catch (error) {
                    // Remove processing state on error
                    const editorPane = document.querySelector('.editor-pane');
                    editorPane.classList.remove('processing-image');
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                // Remove processing state on error
                const editorPane = document.querySelector('.editor-pane');
                editorPane.classList.remove('processing-image');
                reject(new Error('Failed to read image file'));
            };
            
            // Read the file as data URL
            reader.readAsDataURL(file);
        });
    }
    
    generateImageFileName(mimeType) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = mimeType.split('/')[1] || 'png';
        return `pasted-image-${timestamp}.${extension}`;
    }
    
    insertImageAtCursor(fileName, dataUrl) {
        const editor = this.editor.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;
        
        // Create markdown image syntax with data URL
        const imageMarkdown = `![${fileName}](${dataUrl})`;
        
        // Insert at cursor position
        const newValue = value.substring(0, start) + imageMarkdown + value.substring(end);
        editor.value = newValue;
        
        // Move cursor to end of inserted text
        const newCursorPos = start + imageMarkdown.length;
        editor.setSelectionRange(newCursorPos, newCursorPos);
        
        // Update editor state
        this.editor.updatePreview();
        this.editor.updateStats();
        this.editor.updateCursorPosition();
        this.editor.setModified(true);
        
        // Focus back to editor
        editor.focus();
        
        // Auto-collapse if enabled
        if (this.editor.imageCollapse) {
            this.editor.imageCollapse.handleImagePasted();
        }
    }
}

// Extend the main MarkdownEditor class with image paste
MarkdownEditor.prototype.setupImagePaste = function() {
    if (!this.imagePaste) this.imagePaste = new ImagePasteHandler(this);
};
