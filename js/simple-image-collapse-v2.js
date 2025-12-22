/**
 * Simplified image data collapse functionality
 * Uses a global image store approach for reliability
 */
class SimpleImageCollapseV2 {
    constructor(editor) {
        this.editor = editor;
        this.isCollapsed = true;
        this.imageStore = new Map(); // Global store for all image data
        // NOTE: We no longer persist imageStore in localStorage because base64 images
        // routinely exceed localStorage quota and cause random "quota exceeded" errors.
        // The store is reconstructed from the document content on load.
        this.setupToggle();
        this.bindInputHandler();
    }
    
    // Clear all stored images (in-memory only)
    clearImageStore() {
        this.imageStore.clear();
    }
    
    setupToggle() {
        // Add toggle button to editor header
        const editorHeader = document.querySelector('.editor-pane .pane-header');
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-sm image-collapse-toggle';
        toggleBtn.innerHTML = '📝 Show Raw Data';
        toggleBtn.onclick = () => this.toggleCollapse();
        
        // Add right-click context menu for advanced options
        toggleBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showAdvancedOptions(e);
        });
        toggleBtn.title = 'Toggle between collapsed and raw image data view';
        
        editorHeader.appendChild(toggleBtn);
    }
    
    // Store an image/SVG and return a unique placeholder
    storeImage(imageMarkdown) {
        // Extract filename and data URL (including SVG data URLs)
        // More flexible regex to handle various data URL formats
        // Allow optional whitespace/newlines between `]` and `(` because long pasted
        // data URLs often wrap in some editors/copy sources.
        const match = imageMarkdown.match(/!\[([^\]]*)\]\s*\((data:image\/[^)]+)\)/);
        if (!match) return imageMarkdown;
        
        const [fullMatch, alt, dataUrl] = match;
        
        // Log for debugging
        console.log('Storing image:', { alt, dataUrlStart: dataUrl.substring(0, 50) + '...' });
        
        // Generate unique ID
        const imageId = `IMG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store the image data
        this.imageStore.set(imageId, {
            id: imageId,
            alt: alt,
            dataUrl: dataUrl,
            fullMarkdown: fullMatch
        });
        
        // Return collapsed placeholder
        return `![${alt}](...${imageId}...)`;
    }
    
    // Expand all placeholders in content
    expandPlaceholders(content) {
        if (!content) return content;
        
        let expandedContent = content;
        
        // Replace all placeholders with actual image data
        for (const [imageId, imageData] of this.imageStore) {
            // Try exact match first
            const placeholderRegex = new RegExp(`!\\[([^\\]]*)\\]\\(\\.\\.\\.${imageId}\\.\\.\\.\\)`, 'g');
            expandedContent = expandedContent.replace(placeholderRegex, imageData.fullMarkdown);
            
            // Also try to recover corrupted placeholders - match partial IDs
            const corruptedRegex = new RegExp(`\\(\\.\\.\\.${imageId.substring(0, 15)}[^)]*\\.\\.\\.[^)]*\\)`, 'g');
            expandedContent = expandedContent.replace(corruptedRegex, `(${imageData.dataUrl})`);
        }
        
        return expandedContent;
    }
    
    // Collapse all images in content
    collapseImages(content) {
        if (!content) return content;
        
        let collapsedContent = content;
        
        // Replace all data URLs with placeholders
        collapsedContent = content.replace(
            /!\[([^\]]*)\]\s*\(data:image\/[^)]+\)/g,
            (match) => this.storeImage(match)
        );
        
        return collapsedContent;
    }
    
    toggleCollapse() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        const currentContent = this.editor.editor.value;
        const cursorPos = this.editor.editor.selectionStart;
        const cursorEnd = this.editor.editor.selectionEnd;
        
        // Calculate better cursor position preservation
        const textBeforeCursor = currentContent.substring(0, cursorPos);
        
        if (this.isCollapsed) {
            // Show raw data - expand all placeholders
            const expandedContent = this.expandPlaceholders(currentContent);
            const expandedTextBeforeCursor = this.expandPlaceholders(textBeforeCursor);
            const newCursorPos = expandedTextBeforeCursor.length;
            
            this.editor.editor.value = expandedContent;
            this.isCollapsed = false;
            this.updateToggleButton();
            
            // Restore cursor position with better accuracy
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
            }, 10);
        } else {
            // Collapse images
            const collapsedContent = this.collapseImages(currentContent);
            const collapsedTextBeforeCursor = this.collapseImages(textBeforeCursor);
            const newCursorPos = collapsedTextBeforeCursor.length;
            
            this.editor.editor.value = collapsedContent;
            this.isCollapsed = true;
            this.updateToggleButton();
            
            // Restore cursor position with better accuracy
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
            }, 10);
        }
        
        // Update editor state
        setTimeout(() => {
            this.editor.updatePreview();
            this.editor.updateStats();
            this.editor.updateCursorPosition();
            this.editor.setModified(true);
            
            // Refresh syntax highlighting if available
            if (this.editor.syntaxHighlighter) {
                this.editor.syntaxHighlighter.highlight();
            }
        }, 20);
    }
    
    // Auto-collapse when new images/SVGs are pasted
    handleImagePasted() {
        if (this.isCollapsed) {
            setTimeout(() => {
                const currentContent = this.editor.editor.value;
                const cursorPos = this.editor.editor.selectionStart;
                
                if (currentContent.includes('data:image/')) {
                    const collapsedContent = this.collapseImages(currentContent);
                    
                    // Calculate new cursor position
                    const textBeforeCursor = currentContent.substring(0, cursorPos);
                    const collapsedTextBeforeCursor = this.collapseImages(textBeforeCursor);
                    const newCursorPos = collapsedTextBeforeCursor.length;
                    
                    this.editor.editor.value = collapsedContent;
                    
                    // Restore cursor position
                    setTimeout(() => {
                        this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                        this.editor.editor.focus();
                        
                        // Update editor state
                        this.editor.updatePreview();
                        this.editor.updateStats();
                        this.editor.updateCursorPosition();
                        
                        // Refresh syntax highlighting
                        if (this.editor.syntaxHighlighter) {
                            this.editor.syntaxHighlighter.highlight();
                        }
                    }, 10);
                }
            }, 100); // Slightly longer delay to ensure image paste is complete
        }
    }
    
    // Get content for preview (always expanded)
    getPreviewContent() {
        const currentContent = this.editor.editor.value;
        if (this.isCollapsed) {
            return this.expandPlaceholders(currentContent);
        }
        return currentContent;
    }
    
    // Initialize with existing content
    initialize() {
        const content = this.editor.editor.value;
        
        // Check if content has image placeholders (from previous session)
        const hasPlaceholders = /\.\.\.[A-Z0-9_]+\.\.\./g.test(content);
        
        if (hasPlaceholders) {
            // Content already has placeholders - we're in collapsed mode
            this.isCollapsed = true;
            this.updateToggleButton();
            console.log('Initialized with existing image placeholders');
        } else if (content.includes('data:image/')) {
            // Content has raw image data URLs - collapse them
            const collapsedContent = this.collapseImages(content);
            this.editor.editor.value = collapsedContent;
            this.isCollapsed = true;
            this.updateToggleButton();
            console.log('Collapsed existing image data URLs');
        }
        
        // Always update preview to ensure images display correctly
        this.editor.updatePreview();
    }
    
    // Update toggle button text and state
    updateToggleButton() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        if (toggleBtn) {
            if (this.isCollapsed) {
                toggleBtn.innerHTML = '📝 Show Raw Data';
                toggleBtn.title = 'Show full image data URLs';
            } else {
                toggleBtn.innerHTML = '🖼️ Collapse Images';
                toggleBtn.title = 'Collapse long image data URLs';
            }
        }
    }
    
    // Bind input handler to detect and restore corrupted placeholders
    bindInputHandler() {
        this.editor.editor.addEventListener('input', () => {
            if (!this.isCollapsed) return; // Only active when collapsed
            
            // Debounce to avoid excessive processing
            if (this.restoreTimeout) {
                clearTimeout(this.restoreTimeout);
            }
            
            this.restoreTimeout = setTimeout(() => {
                this.attemptPlaceholderRestore();
            }, 500); // Wait 500ms after user stops typing
        });
    }
    
    // Attempt to restore corrupted placeholders
    attemptPlaceholderRestore() {
        const currentContent = this.editor.editor.value;
        const cursorPos = this.editor.editor.selectionStart;
        
        // Look for any corrupted placeholder patterns
        let hasCorrupted = false;
        let restoredContent = currentContent;
        
        // Check for partial image ID patterns that might be corrupted
        for (const [imageId, imageData] of this.imageStore) {
            const partialId = imageId.substring(0, 15);
            
            // Look for corrupted patterns like (...IMG_123...corrupted...)
            const corruptedPattern = new RegExp(`\\(\\.\\.\\.${partialId}[^)]*\\.\\.\\.[^)]*\\)`, 'g');
            if (corruptedPattern.test(currentContent)) {
                hasCorrupted = true;
                restoredContent = restoredContent.replace(corruptedPattern, `(...${imageId}...)`);
            }
            
            // Also look for completely broken markdown image syntax
            const brokenPattern = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${partialId}[^)]*\\)`, 'g');
            if (brokenPattern.test(currentContent)) {
                hasCorrupted = true;
                restoredContent = restoredContent.replace(brokenPattern, `![${imageData.alt}](...${imageId}...)`);
            }
        }
        
        // If we found and fixed corrupted placeholders, update the editor
        if (hasCorrupted && restoredContent !== currentContent) {
            const textBeforeCursor = currentContent.substring(0, cursorPos);
            const restoredTextBeforeCursor = textBeforeCursor.replace(
                /\(\.\.\.IMG_[^)]*\.\.\.[^)]*\)/g, 
                (match) => {
                    // Try to find the correct placeholder for this corrupted one
                    for (const [imageId, imageData] of this.imageStore) {
                        if (match.includes(imageId.substring(0, 15))) {
                            return `(...${imageId}...)`;
                        }
                    }
                    return match;
                }
            );
            const newCursorPos = restoredTextBeforeCursor.length;
            
            this.editor.editor.value = restoredContent;
            
            // Restore cursor position
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
                this.editor.updatePreview();
                
                // Show a subtle notification
                if (this.editor.showNotification) {
                    this.editor.showNotification('🔧 Restored corrupted image placeholder', 'info');
                }
            }, 10);
        }
    }
    
    // Show advanced options context menu
    showAdvancedOptions(event) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0.5rem 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            font-size: 0.875rem;
        `;
        
        const restoreOption = document.createElement('div');
        restoreOption.textContent = '🔧 Restore Corrupted Images';
        restoreOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        restoreOption.onclick = () => {
            this.attemptPlaceholderRestore();
            document.body.removeChild(menu);
        };
        
        const debugOption = document.createElement('div');
        debugOption.textContent = '🐛 Debug Image Store';
        debugOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        debugOption.onclick = () => {
            console.log('Image Store:', Array.from(this.imageStore.entries()));
            if (this.editor.showNotification) {
                this.editor.showNotification(`Found ${this.imageStore.size} stored images (check console)`, 'info');
            }
            document.body.removeChild(menu);
        };
        
        const cleanupOption = document.createElement('div');
        cleanupOption.textContent = '🧹 Cleanup Old Images';
        cleanupOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        cleanupOption.onclick = () => {
            const sizeBefore = this.imageStore.size;
            this.cleanupOldImages();
            const sizeAfter = this.imageStore.size;
            const cleanedCount = sizeBefore - sizeAfter;
            if (this.editor.showNotification) {
                this.editor.showNotification(`Cleaned up ${cleanedCount} old images`, 'success');
            }
            document.body.removeChild(menu);
        };
        
        const clearOption = document.createElement('div');
        clearOption.textContent = '🗑️ Clear All Images';
        clearOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
            color: var(--danger-color);
        `;
        clearOption.onclick = () => {
            if (confirm('Are you sure you want to clear all stored images? This cannot be undone.')) {
                const count = this.imageStore.size;
                this.clearImageStore();
                if (this.editor.showNotification) {
                    this.editor.showNotification(`Cleared ${count} stored images`, 'info');
                }
            }
            document.body.removeChild(menu);
        };
        
        menu.appendChild(restoreOption);
        menu.appendChild(debugOption);
        menu.appendChild(cleanupOption);
        menu.appendChild(clearOption);
        document.body.appendChild(menu);
        
        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
            }, { once: true });
        }, 10);
    }
}

// Replace the main MarkdownEditor setupImageCollapse method
MarkdownEditor.prototype.setupImageCollapse = function() {
    this.imageCollapse = new SimpleImageCollapseV2(this);
    // Initialize after the editor has finished restoring content (prevents
    // "sometimes not collapsed after refresh" timing issues).
    const initCollapse = () => this.imageCollapse?.initialize?.();
    if (this.ready && typeof this.ready.then === 'function') {
        this.ready.then(() => setTimeout(initCollapse, 0));
    } else {
        setTimeout(initCollapse, 0);
    }
};
