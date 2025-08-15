/**
 * Clean Markdown Syntax Highlighting
 * Simple overlay-based approach with perfect alignment
 */
class MarkdownSyntaxHighlighter {
    constructor(editor) {
        this.editor = editor;
        this.textarea = document.getElementById('editor');
        this.wrapper = null;
        this.backdrop = null;
        this.init();
    }

    init() {
        this.createWrapper();
        this.bindEvents();
        this.highlight();
        console.log('✨ Syntax highlighting initialized');
    }

    createWrapper() {
        // Create wrapper container
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'syntax-wrapper';
        
        // Create backdrop for highlighting
        this.backdrop = document.createElement('div');
        this.backdrop.className = 'syntax-backdrop';
        
        // Insert wrapper before textarea
        this.textarea.parentNode.insertBefore(this.wrapper, this.textarea);
        
        // Move textarea into wrapper and add backdrop
        this.wrapper.appendChild(this.backdrop);
        this.wrapper.appendChild(this.textarea);
        
        // Make textarea transparent
        this.textarea.style.background = 'transparent';
        this.textarea.style.color = 'transparent';
        this.textarea.style.caretColor = 'var(--text-primary)';
    }

    bindEvents() {
        this.textarea.addEventListener('input', () => this.highlight());
        this.textarea.addEventListener('scroll', () => this.syncScroll());
        this.textarea.addEventListener('keyup', () => this.highlight());
        this.textarea.addEventListener('paste', () => {
            setTimeout(() => this.highlight(), 10);
        });
    }

    syncScroll() {
        if (this.backdrop && this.textarea) {
            this.backdrop.scrollTop = this.textarea.scrollTop;
            this.backdrop.scrollLeft = this.textarea.scrollLeft;
        }
    }

    highlight() {
        if (!this.backdrop || !this.textarea) return;
        
        const text = this.textarea.value;
        if (!text) {
            this.backdrop.innerHTML = '';
            return;
        }
        
        const highlighted = this.highlightMarkdown(text);
        this.backdrop.innerHTML = highlighted;
        this.syncScroll();
    }

    highlightMarkdown(text) {
        let result = this.escapeHtml(text);
        
        // Process in order to avoid conflicts
        
        // 1. Code blocks first (protect their content)
        result = result.replace(/```[\s\S]*?```/g, (match) => {
            return `<span class="hl-code-block">${match}</span>`;
        });
        
        // 2. Inline code
        result = result.replace(/`([^`\n]+)`/g, '<span class="hl-code">$&</span>');
        
        // 3. Headers
        result = result.replace(/^(#{1,6})\s+(.*)$/gm, '<span class="hl-header">$&</span>');
        
        // 4. Bold **text**
        result = result.replace(/\*\*([^*\n]+)\*\*/g, '<span class="hl-bold">$&</span>');
        
        // 5. Italic *text*
        result = result.replace(/\*([^*\n]+)\*/g, (match, p1, offset, str) => {
            const before = str[offset - 1] || '';
            const after = str[offset + match.length] || '';
            if (before === '*' || after === '*') return match;
            return `<span class="hl-italic">${match}</span>`;
        });
        
        // 6. Strikethrough ~~text~~
        result = result.replace(/~~([^~\n]+)~~/g, '<span class="hl-strikethrough">$&</span>');
        
        // 7. Image placeholders (collapsed images)
        result = result.replace(/!\[([^\]]*)\]\(\.\.\.([^)]+)\.\.\.\)/g, '<span class="hl-image-placeholder">$&</span>');
        
        // 8. Regular images
        result = result.replace(/!\[([^\]]*)\]\((?!\.\.\.)[^)]+\)/g, '<span class="hl-image">$&</span>');
        
        // 9. Links
        result = result.replace(/\[([^\]]*)\]\([^)]+\)/g, '<span class="hl-link">$&</span>');
        
        // 10. Lists
        result = result.replace(/^(\s*)([-*+]|\d+\.)\s+/gm, '$1<span class="hl-list">$2</span> ');
        
        // 11. Blockquotes
        result = result.replace(/^(\s*)(>+)\s*/gm, '$1<span class="hl-quote-marker">$2</span><span class="hl-quote"> ');
        result = result.replace(/(<span class="hl-quote"> .*?)$/gm, '$1</span>');
        
        // 12. Horizontal rules
        result = result.replace(/^(\s*)([-*_]{3,})\s*$/gm, '$1<span class="hl-hr">$2</span>');
        
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
