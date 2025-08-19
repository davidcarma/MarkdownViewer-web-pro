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
        // Check if clipboard contains files (images or SVGs)
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(item => 
            item.type.startsWith('image/') || 
            item.type === 'image/svg+xml'
        );
        
        // Also check for SVG text content
        let hasSvgText = false;
        let svgTextData = '';
        if (e.clipboardData.types.includes('text/plain')) {
            const textData = e.clipboardData.getData('text/plain');
            // More flexible SVG detection
            const trimmedData = textData.trim();
            if ((trimmedData.startsWith('<?xml') && trimmedData.includes('<svg')) || 
                (trimmedData.startsWith('<svg') && trimmedData.includes('</svg>'))) {
                hasSvgText = true;
                svgTextData = textData;
            }
        }
        
        if (imageItems.length === 0 && !hasSvgText) {
            // No images or SVGs in clipboard, let default paste behavior happen
            return;
        }
        
        // Prevent default paste behavior for images and SVGs
        e.preventDefault();
        
        try {
            // Process SVG text if found
            if (hasSvgText) {
                await this.processSvgTextPaste(svgTextData);
            }
            
            // Process each image file
            for (const item of imageItems) {
                if (item.type.startsWith('image/')) {
                    await this.processImagePaste(item);
                }
            }
        } catch (error) {
            console.error('Error processing pasted image/SVG:', error);
            this.editor.showNotification('Error processing pasted image/SVG', 'error');
        }
    }
    
    async processSvgTextPaste(svgText) {
        return new Promise((resolve, reject) => {
            try {
                // Show visual feedback
                const editorPane = document.querySelector('.editor-pane');
                editorPane.classList.add('processing-image');
                this.editor.showNotification('Processing pasted SVG...', 'info');
                
                // Clean and optimize SVG for embedding
                const cleanedSvg = this.cleanSvgForEmbedding(svgText);
                
                // Create data URL for SVG
                const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cleanedSvg)))}`;
                const fileName = this.generateSvgFileName();
                
                // Insert markdown image syntax at cursor position
                this.insertImageAtCursor(fileName, svgDataUrl);
                
                // Remove processing state
                editorPane.classList.remove('processing-image');
                
                // Check if the original SVG had interactive elements
                const hadInteractivity = svgText.includes('<script>') || svgText.includes('onclick') || svgText.includes('onmouseover');
                
                if (hadInteractivity) {
                    this.editor.showNotification('SVG pasted! Note: Interactive elements removed for security', 'info');
                } else {
                    this.editor.showNotification('SVG pasted successfully!', 'success');
                }
                resolve();
            } catch (error) {
                // Remove processing state on error
                const editorPane = document.querySelector('.editor-pane');
                editorPane.classList.remove('processing-image');
                reject(error);
            }
        });
    }
    
    cleanSvgForEmbedding(svgText) {
        let cleaned = svgText.trim();
        
        // Remove script tags and their content (security and compatibility)
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
        
        // Remove event handlers for security
        cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
        
        // Remove CDATA sections that might cause issues
        cleaned = cleaned.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        
        // Ensure proper XML declaration if missing
        if (!cleaned.startsWith('<?xml') && !cleaned.startsWith('<svg')) {
            cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
        }
        
        // Add proper namespace if missing
        if (cleaned.includes('<svg') && !cleaned.includes('xmlns=')) {
            cleaned = cleaned.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        
        return cleaned;
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
    
    generateSvgFileName() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `pasted-svg-${timestamp}.svg`;
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
        
        // Use requestAnimationFrame to ensure proper sequence
        requestAnimationFrame(() => {
            editor.value = newValue;
            
            // Move cursor to end of inserted text
            const newCursorPos = start + imageMarkdown.length;
            
            // Use setTimeout to ensure the value is set before setting selection
            setTimeout(() => {
                editor.setSelectionRange(newCursorPos, newCursorPos);
                editor.focus();
                
                // Update editor state after cursor is positioned
                this.editor.updatePreview();
                this.editor.updateStats();
                this.editor.updateCursorPosition();
                this.editor.setModified(true);
                
                // Trigger syntax highlighting refresh if available
                if (this.editor.syntaxHighlighter) {
                    this.editor.syntaxHighlighter.highlight();
                }
                
                // Auto-collapse if enabled (with slight delay for better UX)
                if (this.editor.imageCollapse) {
                    setTimeout(() => {
                        this.editor.imageCollapse.handleImagePasted();
                    }, 100);
                }
            }, 10);
        });
    }
}

// Extend the main MarkdownEditor class with image paste
MarkdownEditor.prototype.setupImagePaste = function() {
    if (!this.imagePaste) this.imagePaste = new ImagePasteHandler(this);
};
