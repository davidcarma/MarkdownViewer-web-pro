/**
 * Simple and reliable markdown syntax highlighting
 */
class MarkdownSyntaxHighlighter {
    constructor(editor) {
        this.editor = editor;
        this.container = null;
        this.highlightDiv = null;
        this.helpOverlay = null;
        this.helpContent = null;
        this.textArea = null;
        this.init();
    }

    init() {
        this.setupHighlightContainer();
        this.bindEvents();
        this.highlight();
        
        // Show help overlay after everything is set up
        setTimeout(() => {
            this.updateHelpOverlay();
        }, 100);
        
        console.log('🎨 Markdown syntax highlighter initialized');
    }

    setupHighlightContainer() {
        const editorPane = document.querySelector('.editor-pane');
        const textarea = document.querySelector('#editor');
        
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'highlight-wrapper';
        
        // Create highlight div
        this.highlightDiv = document.createElement('div');
        this.highlightDiv.className = 'highlight-backdrop';

        // Create help overlay (shown when editor is empty)
        this.helpOverlay = document.createElement('div');
        this.helpOverlay.className = 'editor-help-overlay';
        this.helpContent = document.createElement('div');
        this.helpContent.className = 'editor-help-content';
        this.helpOverlay.appendChild(this.helpContent);
        
        // Insert wrapper before textarea
        textarea.parentNode.insertBefore(wrapper, textarea);
        
        // Move textarea into wrapper
        wrapper.appendChild(this.highlightDiv);
        wrapper.appendChild(this.helpOverlay);
        wrapper.appendChild(textarea);
        
        this.textArea = textarea;
        // Capture and remove native placeholder to avoid double rendering
        this.originalPlaceholder = this.textArea.getAttribute('placeholder') || '';
        this.textArea.setAttribute('data-placeholder', this.originalPlaceholder);
        this.textArea.setAttribute('placeholder', '');
        
        // Styles are defined in css/editor.css
    }



    bindEvents() {
        // Only handle scroll sync here - other events are handled by core.js
        this.textArea.addEventListener('scroll', () => this.syncScroll());
        
        // Handle paste events for syntax highlighting
        this.textArea.addEventListener('paste', () => { 
            console.log('PASTE event triggered');
            setTimeout(() => { 
                this.highlight();
                this.updateHelpOverlay(); 
            }, 10); 
        });
    }

    syncScroll() {
        if (this.highlightDiv && this.textArea) {
            this.highlightDiv.scrollTop = this.textArea.scrollTop;
            this.highlightDiv.scrollLeft = this.textArea.scrollLeft;
            if (this.helpContent) {
                const y = this.textArea.scrollTop;
                this.helpContent.style.transform = `translateY(${-y}px)`;
            }
        }
    }

    highlight() {
        if (!this.highlightDiv || !this.textArea) return;
        
        const text = this.textArea.value;
        
        // If there's no text, clear the highlight and show help
        if (!text || text.trim() === '') {
            this.highlightDiv.innerHTML = '';
            this.updateHelpOverlay();
            return;
        }
        
        const highlighted = this.highlightMarkdown(text);
        this.highlightDiv.innerHTML = highlighted;
        this.syncScroll();
    }

    showHelpOverlay() {
        if (!this.helpOverlay) return;
        
        // Populate with help text
        const helpText = this.originalPlaceholder || 'Start typing your markdown here...';
        if (this.helpContent) {
            this.helpContent.textContent = helpText;
        }
        
        // Show the overlay
        this.helpOverlay.style.display = 'block';
        this.helpOverlay.style.opacity = '0.9';
        this.helpOverlay.style.visibility = 'visible';
        
        console.log('✅ Help overlay SHOWN');
    }
    
    hideHelpOverlay() {
        if (!this.helpOverlay) return;
        
        this.helpOverlay.style.display = 'none';
        this.helpOverlay.style.opacity = '0';
        this.helpOverlay.style.visibility = 'hidden';
        
        console.log('❌ Help overlay HIDDEN');
    }
    
    updateHelpOverlay() {
        if (!this.textArea || !this.helpOverlay) {
            console.log('❌ Missing textArea or helpOverlay');
            return;
        }
        
        const hasContent = this.textArea.value && this.textArea.value.trim().length > 0;
        
        console.log('🔍 Update help overlay:');
        console.log('  - hasContent:', hasContent);
        console.log('  - value length:', this.textArea.value.length);
        console.log('  - current display:', this.helpOverlay.style.display);
        console.log('  - current visibility:', this.helpOverlay.style.visibility);
        
        if (hasContent) {
            console.log('  → Should HIDE overlay');
            this.hideHelpOverlay();
        } else {
            console.log('  → Should SHOW overlay');
            this.showHelpOverlay();
        }
    }

    refresh() {
        // Public method to recompute everything after programmatic content changes
        this.highlight();
        this.updateHelpOverlay();
        this.syncScroll();
    }

    highlightMarkdown(text) {
        if (!text) return '';
        
        let result = this.escapeHtml(text);
        
        // Process in order to avoid conflicts
        
        // Code blocks first (to protect their content)
        result = this.highlightCodeBlocks(result);
        
        // Then inline code
        result = result.replace(/`([^`\n]+)`/g, '<span class="hl-code">$&</span>');
        
        // Headers
        result = result.replace(/^(#{1,6})\s+(.*)$/gm, '<span class="hl-header">$&</span>');
        
        // Bold **text**
        result = result.replace(/\*\*([^*\n]+)\*\*/g, '<span class="hl-bold">$&</span>');
        
        // Italic *text* (avoid lookbehind for Safari compatibility)
        result = result.replace(/\*([^*\n]+)\*/g, (match, p1, offset, str) => {
            const before = str[offset - 1] || '';
            const after = str[offset + match.length] || '';
            // Skip if part of bold **text**
            if (before === '*' || after === '*') return match;
            return `<span class="hl-italic">${match}</span>`;
        });
        
        // Strikethrough ~~text~~
        result = result.replace(/~~([^~\n]+)~~/g, '<span class="hl-strikethrough">$&</span>');
        
        // Image placeholders (green)
        result = result.replace(/!\[([^\]]*)\]\(\.\.\.([^)]+)\.\.\.\)/g, '<span class="hl-image-placeholder">$&</span>');
        
        // Regular images
        result = result.replace(/!\[([^\]]*)\]\((?!\.\.\.)[^)]+\)/g, '<span class="hl-image">$&</span>');
        
        // Links
        result = result.replace(/\[([^\]]*)\]\([^)]+\)/g, '<span class="hl-link">$&</span>');
        
        // Lists
        result = result.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '$1<span class="hl-list">$2</span> ');
        
        // Blockquotes
        result = result.replace(/^(\s*)(>+)\s*/gm, '$1<span class="hl-quote-marker">$2</span><span class="hl-quote"> ');
        result = result.replace(/(<span class="hl-quote"> .*?)$/gm, '$1</span>');
        
        // Horizontal rules
        result = result.replace(/^(\s*)([-*_]{3,})\s*$/gm, '$1<span class="hl-hr">$2</span>');
        
        return result;
    }

    highlightCodeBlocks(text) {
        // Handle code blocks
        return text.replace(/```[\s\S]*?```/g, (match) => {
            return `<span class="hl-code-block">${match}</span>`;
        });
    }

    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// Add to MarkdownEditor
MarkdownEditor.prototype.setupSyntaxHighlighting = function() {
    this.syntaxHighlighter = new MarkdownSyntaxHighlighter(this);
};
