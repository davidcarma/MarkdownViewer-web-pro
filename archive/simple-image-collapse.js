/**
 * Simple image data collapse functionality
 * Replaces long base64 data URLs with simple text placeholders
 */
class SimpleImageCollapse {
    constructor(editor) {
        this.editor = editor;
        this.isCollapsed = true;
        this.originalContent = '';
        this.collapsedContent = '';
        this.imageMap = new Map(); // Track images by unique ID
        this.imageCounter = 0;
        this.setupToggle();
    }
    
    setupToggle() {
        // Add toggle button to editor header
        const editorHeader = document.querySelector('.editor-pane .pane-header');
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-sm image-collapse-toggle';
        toggleBtn.innerHTML = '📝 Show Raw Data';
        toggleBtn.onclick = () => this.toggleCollapse();
        toggleBtn.title = 'Toggle between collapsed and raw image data view';
        
        editorHeader.appendChild(toggleBtn);
    }
    
    collapseImageData() {
        const content = this.editor.editor.value;
        this.originalContent = content;
        
        // Don't clear existing image map, instead rebuild it properly
        const newImageMap = new Map();
        let counter = 0;
        
        // Replace image data URLs with unique placeholders
        this.collapsedContent = content.replace(
            /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
            (match, alt, offset) => {
                // Generate unique ID for this image
                const imageId = `img_${++counter}`;
                
                // Store the full image data in new map
                newImageMap.set(imageId, {
                    fullMatch: match,
                    alt: alt,
                    id: imageId
                });
                
                // Return placeholder with unique ID
                return `![${alt}](...IMAGE_${imageId}...)`;
            }
        );
        
        // Update image map and counter
        this.imageMap = newImageMap;
        this.imageCounter = counter;
        
        if (this.collapsedContent !== content) {
            // Store cursor position
            const cursorPos = this.editor.editor.selectionStart;
            
            // Calculate new cursor position in collapsed content
            const beforeCursor = content.substring(0, cursorPos);
            let collapsedBefore = beforeCursor;
            
            // Apply same replacement to content before cursor
            let tempCounter = 0;
            collapsedBefore = beforeCursor.replace(
                /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
                (match, alt) => {
                    tempCounter++;
                    return `![${alt}](...IMAGE_img_${tempCounter}...)`;
                }
            );
            
            this.editor.editor.value = this.collapsedContent;
            this.editor.editor.setSelectionRange(collapsedBefore.length, collapsedBefore.length);
            
            return true; // Content was changed
        }
        
        return false; // No images found
    }
    
    expandImageData() {
        if (this.originalContent) {
            // Store cursor position
            const cursorPos = this.editor.editor.selectionStart;
            
            // Get current content and expand it
            const currentContent = this.editor.editor.value;
            const expandedContent = this.expandContent(currentContent);
            
            // Calculate cursor position in expanded content
            const beforeCursor = currentContent.substring(0, cursorPos);
            const expandedBefore = this.expandContent(beforeCursor);
            
            this.editor.editor.value = expandedContent;
            this.editor.editor.setSelectionRange(expandedBefore.length, expandedBefore.length);
            
            // Update original content to current expanded content
            this.originalContent = expandedContent;
        }
    }
    
    toggleCollapse() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        
        if (this.isCollapsed) {
            // Show raw data
            this.expandImageData();
            this.isCollapsed = false;
            toggleBtn.innerHTML = '🖼️ Collapse Images';
            toggleBtn.title = 'Collapse long image data URLs';
        } else {
            // Collapse data
            const hasImages = this.collapseImageData();
            if (hasImages) {
                this.isCollapsed = true;
                toggleBtn.innerHTML = '📝 Show Raw Data';
                toggleBtn.title = 'Show full image data URLs';
            }
        }
        
        // Update preview and stats
        this.editor.updatePreview();
        this.editor.updateStats();
        this.editor.setModified(true);
    }
    
    // Auto-collapse when new images are pasted
    handleImagePasted() {
        if (this.isCollapsed) {
            // Small delay to let the paste complete
            setTimeout(() => {
                // Get current content which should have the new image
                const currentContent = this.editor.editor.value;
                
                // Check if there are any new raw data URLs that need collapsing
                if (currentContent.includes('data:image/')) {
                    // Collapse all images (including new ones)
                    const hasImages = this.collapseImageData();
                    if (hasImages) {
                        this.editor.updatePreview();
                    }
                }
            }, 50);
        }
    }
    
    // Update original content when in expanded mode
    updateOriginalContent() {
        if (!this.isCollapsed) {
            this.originalContent = this.editor.editor.value;
            // Also rebuild the image map from current content
            this.rebuildImageMapFromContent(this.originalContent);
        }
    }
    
    rebuildImageMapFromContent(content) {
        // Clear and rebuild image map from current content
        this.imageMap.clear();
        let counter = 0;
        
        content.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, (match, alt) => {
            const imageId = `img_${++counter}`;
            this.imageMap.set(imageId, {
                fullMatch: match,
                alt: alt,
                id: imageId
            });
            return match;
        });
        
        this.imageCounter = counter;
    }
    
    expandContent(collapsedContent) {
        if (!collapsedContent || this.imageMap.size === 0) {
            console.log('expandContent: no content or empty image map', { 
                hasContent: !!collapsedContent, 
                mapSize: this.imageMap.size 
            });
            return collapsedContent;
        }
        
        console.log('expandContent: processing', { 
            collapsedLength: collapsedContent.length,
            mapSize: this.imageMap.size,
            mapKeys: Array.from(this.imageMap.keys())
        });
        
        // Replace unique image placeholders with actual data URLs
        let expandedContent = collapsedContent;
        
        // Replace each unique placeholder with its corresponding image data
        for (const [imageId, imageData] of this.imageMap) {
            const placeholderRegex = new RegExp(`!\\[([^\\]]*)\\]\\(\\.\\.\\.IMAGE_${imageId}\\.\\.\\.\\)`, 'g');
            const beforeReplace = expandedContent;
            expandedContent = expandedContent.replace(placeholderRegex, imageData.fullMatch);
            
            if (beforeReplace !== expandedContent) {
                console.log(`Replaced placeholder for ${imageId}`);
            }
        }
        
        console.log('expandContent: result', { 
            originalLength: collapsedContent.length,
            expandedLength: expandedContent.length,
            changed: collapsedContent !== expandedContent
        });
        
        return expandedContent;
    }
}

// Extend the main MarkdownEditor class
MarkdownEditor.prototype.setupImageCollapse = function() {
    this.imageCollapse = new SimpleImageCollapse(this);
    
    // Auto-collapse on load if there are images
    const hasImages = this.imageCollapse.collapseImageData();
    if (hasImages) {
        this.updatePreview();
    }
};


