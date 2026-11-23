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
            
            reader.onload = async (e) => {
                try {
                    const dataUrl = e.target.result;
                    const fileSizeKB = Math.round(file.size / 1024);
                    const compressionEnabled = this.editor.storageManager.getSetting('imageCompression', true);
                    
                    // Compress any large raster image, including opaque PNG
                    // screenshots. GIF (animation) and SVG (vector) stay as-is.
                    const compressible = /^image\/(jpeg|jpg|png|webp|bmp)$/i.test(file.type);
                    if (fileSizeKB > 200 && compressionEnabled && compressible) {
                        // Compress and downscale the image
                        const compressedDataUrl = await this.compressImage(dataUrl, file.type);
                        const compressedSizeKB = Math.round(compressedDataUrl.length * 0.75 / 1024); // Rough estimate
                        const compressedMime = compressedDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                        const fileName = this.generateImageFileName(compressedMime);
                        
                        this.insertImageAtCursor(fileName, compressedDataUrl);
                        
                        // Remove processing state
                        editorPane.classList.remove('processing-image');
                        
                        this.editor.showNotification(
                            `Image compressed: ${fileSizeKB}KB → ${compressedSizeKB}KB`, 
                            'success'
                        );
                    } else if (fileSizeKB > 200 && !compressionEnabled) {
                        // Insert full resolution but show warning
                        const fileName = this.generateImageFileName(file.type);
                        this.insertImageAtCursor(fileName, dataUrl);
                        
                        // Remove processing state
                        editorPane.classList.remove('processing-image');
                        
                        // Show warning about large image
                        this.showLargeImageWarning(fileSizeKB);
                    } else {
                        // Small image, no compression needed
                        const fileName = this.generateImageFileName(file.type);
                        this.insertImageAtCursor(fileName, dataUrl);
                        
                        // Remove processing state
                        editorPane.classList.remove('processing-image');
                        
                        this.editor.showNotification('Image pasted successfully!', 'success');
                    }
                    
                    resolve();
                } catch (error) {
                    // Remove processing state on error
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
    
    async compressImage(dataUrl, originalType) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                try {
                    // Screenshots are usually far larger than they need to be on
                    // screen. Cap the long edge first: quartering the pixels does
                    // more than any quality setting.
                    const MAX_DIMENSION = 1600;
                    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
                    const width = Math.max(1, Math.round(img.width * scale));
                    const height = Math.max(1, Math.round(img.height * scale));

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Transparency has to survive (diagrams, logos); opaque
                    // PNG screenshots get the JPEG treatment.
                    if (originalType === 'image/png' && this._canvasHasTransparency(ctx, width, height)) {
                        resolve(canvas.toDataURL('image/png'));
                        return;
                    }

                    // Start at 80% and step down until the encoded image fits
                    // the target; never below 45% or text becomes mush.
                    let quality = 0.8;
                    let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

                    const targetSizeKB = 160;
                    let attempts = 0;
                    const maxAttempts = 8;

                    while (compressedDataUrl.length * 0.75 / 1024 > targetSizeKB && attempts < maxAttempts) {
                        quality = Math.max(0.5, quality - 0.05);
                        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                        attempts++;
                    }

                    resolve(compressedDataUrl);
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => {
                reject(new Error('Failed to load image for compression'));
            };

            img.src = dataUrl;
        });
    }

    _canvasHasTransparency(ctx, width, height) {
        try {
            const data = ctx.getImageData(0, 0, width, height).data;
            // A stray antialiased pixel should not force a full-size PNG; only
            // a real transparent region (over 1% of the image) does.
            const limit = Math.max(1, Math.floor(width * height * 0.01));
            let transparent = 0;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] < 250) {
                    transparent++;
                    if (transparent > limit) return true;
                }
            }
        } catch (_) {
            // If the canvas is unreadable, prefer preserving the original format.
        }
        return false;
    }

    showLargeImageWarning(sizeKB) {
        // Remove any existing warning
        const existingWarning = document.querySelector('.warning-card');
        if (existingWarning) {
            existingWarning.remove();
        }
        
        // Create warning card
        const warningCard = document.createElement('div');
        warningCard.className = 'warning-card';
        warningCard.innerHTML = `
            <div class="warning-card-header">
                <span class="warning-card-icon">⚠️</span>
                <span>Large Image Pasted</span>
            </div>
            <div class="warning-card-body">
                You pasted a ${sizeKB}KB image at full resolution. Large images may slow down the editor. 
                Consider enabling image compression in settings for better performance.
            </div>
            <div class="warning-card-actions">
                <button class="btn btn-sm" onclick="this.closest('.warning-card').remove()">Dismiss</button>
            </div>
        `;
        
        document.body.appendChild(warningCard);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (warningCard.parentNode) {
                warningCard.style.opacity = '0';
                setTimeout(() => {
                    if (warningCard.parentNode) {
                        warningCard.remove();
                    }
                }, 300);
            }
        }, 8000);
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

        // Preserve viewport: changing value/selection can cause the browser to
        // auto-scroll the textarea (often all the way to the insertion point).
        const prevEditorScrollTop = editor.scrollTop;
        const prevEditorScrollLeft = editor.scrollLeft;
        const previewEl = this.editor.preview;
        const prevPreviewScrollTop = previewEl ? previewEl.scrollTop : 0;
        const prevPreviewScrollLeft = previewEl ? previewEl.scrollLeft : 0;
        
        // Create markdown image syntax with data URL
        const imageMarkdown = `![${fileName}](${dataUrl})`;
        
        // Insert at cursor position
        const newValue = value.substring(0, start) + imageMarkdown + value.substring(end);
        
        // Use requestAnimationFrame to ensure proper sequence
        requestAnimationFrame(() => {
            // Preserve undo history for programmatic value rewrite.
            this.editor.recordUndoSnapshot?.(true);
            editor.value = newValue;
            
            // Move cursor to end of inserted text
            const newCursorPos = start + imageMarkdown.length;
            
            // Use setTimeout to ensure the value is set before setting selection
            setTimeout(() => {
                editor.setSelectionRange(newCursorPos, newCursorPos);
                editor.focus();

                // Restore scroll positions AFTER selection/focus (these can trigger scroll jumps)
                // and keep scroll sync from reacting to any incidental scroll events.
                editor.scrollTop = prevEditorScrollTop;
                editor.scrollLeft = prevEditorScrollLeft;
                if (previewEl) {
                    previewEl.scrollTop = prevPreviewScrollTop;
                    previewEl.scrollLeft = prevPreviewScrollLeft;
                }
                this.editor._ignoringScrollUntil = Date.now() + 250;
                
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
