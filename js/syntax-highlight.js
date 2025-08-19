/**
 * Simple Image Highlighting for Markdown Editor
 * Lightweight overlay just for highlighting collapsed images
 */
class MarkdownSyntaxHighlighter {
    constructor(editor) {
        this.editor = editor;
        this.textarea = document.getElementById('editor');
        this.overlay = null;
        this.highlightTimeout = null;
        this.init();
    }

    init() {
        this.setupImageHighlighting();
        this.bindEvents();
        this.highlight();
        console.log('✨ Image highlighting initialized');
    }
    
    setupImageHighlighting() {
        // Remove any existing complex wrappers
        const existingWrapper = this.textarea.closest('.syntax-wrapper');
        if (existingWrapper) {
            const parent = existingWrapper.parentNode;
            parent.insertBefore(this.textarea, existingWrapper);
            parent.removeChild(existingWrapper);
        }
        
        // Reset textarea to normal styling
        this.textarea.style.background = '';
        this.textarea.style.color = '';
        this.textarea.style.caretColor = '';
        this.textarea.style.position = 'relative';
        this.textarea.style.zIndex = '2';
        
        // Create simple overlay just for image highlighting
        this.overlay = document.createElement('div');
        this.overlay.className = 'image-highlight-overlay';
        
        // Insert overlay before textarea
        this.textarea.parentNode.insertBefore(this.overlay, this.textarea);
    }
    
    bindEvents() {
        // Debounced highlighting for better performance
        this.textarea.addEventListener('input', () => this.debouncedHighlight());
        this.textarea.addEventListener('scroll', () => this.syncScroll());
        // Note: Paste events are handled by ImagePasteHandler - we'll get called via refresh() if needed
    }
    
    debouncedHighlight() {
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
        }
        
        this.highlightTimeout = setTimeout(() => {
            this.highlight();
        }, 300); // Longer delay since we only highlight images
    }
    
    syncScroll() {
        if (this.overlay && this.textarea) {
            requestAnimationFrame(() => {
                this.overlay.scrollTop = this.textarea.scrollTop;
                this.overlay.scrollLeft = this.textarea.scrollLeft;
            });
        }
    }
    
    highlight() {
        if (!this.overlay || !this.textarea) return;
        
        const text = this.textarea.value;
        if (!text) {
            this.overlay.innerHTML = '';
            return;
        }
        
        const highlighted = this.highlightImages(text);
        this.overlay.innerHTML = highlighted;
        this.syncScroll();
    }
    
    highlightImages(text) {
        let result = this.escapeHtml(text);
        
        // Highlight collapsed images (green)
        result = result.replace(
            /!\[([^\]]*)\]\(\.\.\.([^)]+)\.\.\.\)/g, 
            '<span class="collapsed-image-highlight">$&</span>'
        );
        
        // Highlight regular images (orange) - but not collapsed ones
        result = result.replace(
            /!\[([^\]]*)\]\((?!\.\.\.)[^)]+\)/g, 
            '<span class="regular-image-highlight">$&</span>'
        );
        
        return result;
    }
    
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    refresh() {
        this.highlight();
    }
}

// Add to MarkdownEditor
MarkdownEditor.prototype.setupSyntaxHighlighting = function() {
    this.syntaxHighlighter = new MarkdownSyntaxHighlighter(this);
};
