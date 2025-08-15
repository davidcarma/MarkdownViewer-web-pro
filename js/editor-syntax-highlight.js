/**
 * Editor syntax highlighting functionality
 */
class EditorSyntaxHighlight {
    constructor(editor) {
        this.editor = editor;
        this.highlightOverlay = null;
        this.setupHighlighting();
    }
    
    setupHighlighting() {
        // Create highlight overlay
        this.createHighlightOverlay();
        
        // Add class for CSS
        const editorPane = document.querySelector('.editor-pane');
        editorPane.classList.add('has-syntax-highlight');
        
        // Bind events
        this.editor.editor.addEventListener('input', () => this.updateHighlighting());
        this.editor.editor.addEventListener('scroll', () => this.syncScroll());
        this.editor.editor.addEventListener('keyup', () => this.updateHighlighting());
        
        // Initial highlighting
        setTimeout(() => this.updateHighlighting(), 100);
    }
    
    createHighlightOverlay() {
        const editorPane = document.querySelector('.editor-pane');
        
        // Remove existing overlay
        const existingOverlay = editorPane.querySelector('.syntax-highlight-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        // Create new overlay
        this.highlightOverlay = document.createElement('div');
        this.highlightOverlay.className = 'syntax-highlight-overlay';
        this.highlightOverlay.setAttribute('aria-hidden', 'true');
        editorPane.appendChild(this.highlightOverlay);
        
        console.log('✅ Syntax highlight overlay created');
    }
    
    updateHighlighting() {
        if (!this.highlightOverlay) {
            console.warn('⚠️ No highlight overlay found');
            return;
        }
        
        const content = this.editor.editor.value;
        const highlightedContent = this.highlightMarkdown(content);
        this.highlightOverlay.innerHTML = highlightedContent;
        
        // Debug
        console.log('🎨 Highlighting updated, content length:', content.length);
    }
    
    highlightMarkdown(content) {
        if (!content) return '';
        
        const lines = content.split('\n');
        let inCodeBlock = false;
        let codeBlockLanguage = '';
        
        return lines.map((line, index) => {
            let highlightedLine = this.escapeHtml(line);
            
            // Handle code blocks first
            if (line.trim().startsWith('```')) {
                if (!inCodeBlock) {
                    // Starting a code block
                    inCodeBlock = true;
                    codeBlockLanguage = line.trim().substring(3);
                    highlightedLine = `<span class="md-code-block-start">\`\`\`</span><span class="md-code-block-lang">${this.escapeHtml(codeBlockLanguage)}</span>`;
                } else {
                    // Ending a code block
                    inCodeBlock = false;
                    codeBlockLanguage = '';
                    highlightedLine = `<span class="md-code-block-end">\`\`\`</span>`;
                }
                return `<div class="syntax-line code-block-delimiter" data-line="${index + 1}">${highlightedLine}</div>`;
            }
            
            // If we're inside a code block, just highlight as code
            if (inCodeBlock) {
                return `<div class="syntax-line code-block-content" data-line="${index + 1}"><span class="md-code-block-content">${highlightedLine}</span></div>`;
            }
            
            // Headers (must be at start of line)
            highlightedLine = highlightedLine.replace(
                /^(#{1,6})\s+(.*)$/,
                '<span class="md-header-marker">$1</span><span class="md-header-text"> $2</span>'
            );
            
            // Bold text **text**
            highlightedLine = highlightedLine.replace(
                /\*\*([^*]+)\*\*/g,
                '<span class="md-bold-marker">**</span><span class="md-bold-text">$1</span><span class="md-bold-marker">**</span>'
            );
            
            // Italic text *text* (avoid conflict with bold)
            highlightedLine = highlightedLine.replace(
                /\*([^*\n]+)\*/g,
                (match, content) => {
                    // Don't match if it's part of bold text
                    if (match.includes('**') || highlightedLine.includes('**' + content + '**')) {
                        return match;
                    }
                    return `<span class="md-italic-marker">*</span><span class="md-italic-text">${content}</span><span class="md-italic-marker">*</span>`;
                }
            );
            
            // Inline code `code`
            highlightedLine = highlightedLine.replace(
                /`([^`\n]+)`/g,
                '<span class="md-code-marker">`</span><span class="md-code-text">$1</span><span class="md-code-marker">`</span>'
            );
            
            // Image placeholders (green) - must come before regular images
            highlightedLine = highlightedLine.replace(
                /!\[([^\]]*)\]\(\.\.\.([^)]+)\.\.\.\)/g,
                '<span class="md-image-placeholder">![</span><span class="md-image-alt">$1</span><span class="md-image-placeholder">](...</span><span class="md-image-id">$2</span><span class="md-image-placeholder">...)</span>'
            );
            
            // Regular images ![alt](url)
            highlightedLine = highlightedLine.replace(
                /!\[([^\]]*)\]\((?!\.\.\.)((?:data:image\/|https?:\/\/)[^)]+)\)/g,
                '<span class="md-image-marker">![</span><span class="md-image-alt">$1</span><span class="md-image-marker">](</span><span class="md-image-url">$2</span><span class="md-image-marker">)</span>'
            );
            
            // Links [text](url)
            highlightedLine = highlightedLine.replace(
                /\[([^\]]*)\]\(([^)]+)\)/g,
                '<span class="md-link-marker">[</span><span class="md-link-text">$1</span><span class="md-link-marker">](</span><span class="md-link-url">$2</span><span class="md-link-marker">)</span>'
            );
            
            // Lists (unordered and ordered)
            highlightedLine = highlightedLine.replace(
                /^(\s*)([-*+]|\d+\.)\s+(.*)$/,
                '$1<span class="md-list-marker">$2</span> <span class="md-list-text">$3</span>'
            );
            
            // Blockquotes
            highlightedLine = highlightedLine.replace(
                /^(\s*)(>+)\s*(.*)$/,
                '$1<span class="md-quote-marker">$2</span><span class="md-quote-text"> $3</span>'
            );
            
            // Strikethrough ~~text~~
            highlightedLine = highlightedLine.replace(
                /~~([^~\n]+)~~/g,
                '<span class="md-strikethrough-marker">~~</span><span class="md-strikethrough-text">$1</span><span class="md-strikethrough-marker">~~</span>'
            );
            
            // Horizontal rules
            highlightedLine = highlightedLine.replace(
                /^(\s*)([-*_]{3,})\s*$/,
                '$1<span class="md-hr">$2</span>'
            );
            
            return `<div class="syntax-line" data-line="${index + 1}">${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    }
    
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    syncScroll() {
        if (this.highlightOverlay) {
            this.highlightOverlay.scrollTop = this.editor.editor.scrollTop;
            this.highlightOverlay.scrollLeft = this.editor.editor.scrollLeft;
        }
    }
}

// Add syntax highlighting to MarkdownEditor
MarkdownEditor.prototype.setupSyntaxHighlighting = function() {
    this.syntaxHighlight = new EditorSyntaxHighlight(this);
};
