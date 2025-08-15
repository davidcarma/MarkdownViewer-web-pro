/**
 * Simplified image data collapse functionality
 * Uses a global image store approach for reliability
 */
class SimpleImageCollapseV2 {
    constructor(editor) {
        this.editor = editor;
        this.isCollapsed = true;
        this.imageStore = new Map(); // Global store for all image data
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
    
    // Store an image and return a unique placeholder
    storeImage(imageMarkdown) {
        // Extract filename and data URL
        const match = imageMarkdown.match(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/);
        if (!match) return imageMarkdown;
        
        const [fullMatch, alt, dataUrl] = match;
        
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
            const placeholderRegex = new RegExp(`!\\[([^\\]]*)\\]\\(\\.\\.\\.${imageId}\\.\\.\\.\\)`, 'g');
            expandedContent = expandedContent.replace(placeholderRegex, imageData.fullMarkdown);
        }
        
        return expandedContent;
    }
    
    // Collapse all images in content
    collapseImages(content) {
        if (!content) return content;
        
        let collapsedContent = content;
        
        // Replace all data URLs with placeholders
        collapsedContent = content.replace(
            /!\[([^\]]*)\]\(data:image\/[^)]+\)/g,
            (match) => this.storeImage(match)
        );
        
        return collapsedContent;
    }
    
    toggleCollapse() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        const currentContent = this.editor.editor.value;
        const cursorPos = this.editor.editor.selectionStart;
        
        if (this.isCollapsed) {
            // Show raw data - expand all placeholders
            const expandedContent = this.expandPlaceholders(currentContent);
            this.editor.editor.value = expandedContent;
            this.isCollapsed = false;
            toggleBtn.innerHTML = '🖼️ Collapse Images';
            toggleBtn.title = 'Collapse long image data URLs';
        } else {
            // Collapse images
            const collapsedContent = this.collapseImages(currentContent);
            this.editor.editor.value = collapsedContent;
            this.isCollapsed = true;
            toggleBtn.innerHTML = '📝 Show Raw Data';
            toggleBtn.title = 'Show full image data URLs';
        }
        
        // Restore cursor position (approximate)
        this.editor.editor.setSelectionRange(cursorPos, cursorPos);
        
        // Update preview and stats
        this.editor.updatePreview();
        this.editor.updateStats();
        this.editor.setModified(true);
    }
    
    // Auto-collapse when new images are pasted
    handleImagePasted() {
        if (this.isCollapsed) {
            setTimeout(() => {
                const currentContent = this.editor.editor.value;
                if (currentContent.includes('data:image/')) {
                    const collapsedContent = this.collapseImages(currentContent);
                    this.editor.editor.value = collapsedContent;
                    this.editor.updatePreview();
                }
            }, 50);
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
        if (content.includes('data:image/')) {
            const collapsedContent = this.collapseImages(content);
            this.editor.editor.value = collapsedContent;
            this.editor.updatePreview();
        }
    }
}

// Replace the main MarkdownEditor setupImageCollapse method
MarkdownEditor.prototype.setupImageCollapse = function() {
    this.imageCollapse = new SimpleImageCollapseV2(this);
    this.imageCollapse.initialize();
};
