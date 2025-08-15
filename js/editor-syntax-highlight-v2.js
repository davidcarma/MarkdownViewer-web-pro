/**
 * Simple and reliable markdown syntax highlighting
 */
class MarkdownSyntaxHighlighter {
    constructor(editor) {
        this.editor = editor;
        this.container = null;
        this.highlightDiv = null;
        this.textArea = null;
        this.init();
    }

    init() {
        this.setupHighlightContainer();
        this.bindEvents();
        this.highlight();
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
        
        // Insert wrapper before textarea
        textarea.parentNode.insertBefore(wrapper, textarea);
        
        // Move textarea into wrapper
        wrapper.appendChild(this.highlightDiv);
        wrapper.appendChild(textarea);
        
        this.textArea = textarea;
        
        // Add styles
        this.addStyles();
    }

    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .highlight-wrapper {
                position: relative;
                width: 100%;
                height: 100%;
            }
            
            .highlight-backdrop {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                padding: 1rem;
                font-family: var(--font-family-mono);
                font-size: 16px;
                line-height: 1.6;
                white-space: pre-wrap;
                overflow: hidden;
                pointer-events: none;
                z-index: 1;
                color: var(--text-primary);
                word-wrap: break-word;
                overflow-wrap: break-word;
                font-weight: 400;
                min-height: 0;
            }
            
            .highlight-wrapper #editor {
                position: relative;
                z-index: 2;
                background: transparent;
                color: transparent;
                caret-color: var(--text-primary);
                resize: none;
                font-size: 16px;
                line-height: 1.6;
                font-weight: 400;
            }
            
            /* When editor is empty, show placeholder normally */
            .highlight-wrapper #editor:placeholder-shown {
                color: var(--text-muted);
                background: var(--bg-primary);
            }
            
            .highlight-wrapper #editor::placeholder {
                color: var(--text-muted);
                opacity: 0.8;
                font-size: 16px;
                position: relative;
                z-index: 10;
                line-height: 1.6;
                font-weight: 400;
                white-space: pre-wrap;
            }
            
            .highlight-wrapper #editor::selection {
                background: rgba(0, 123, 255, 0.3);
            }
            
            /* Markdown syntax colors */
            .hl-header { color: var(--accent-color); font-weight: 700; font-size: 16px; }
            .hl-bold { color: var(--text-primary); font-weight: 700; font-size: 16px; }
            .hl-italic { color: var(--text-primary); font-style: italic; font-size: 16px; }
            .hl-code { color: var(--danger-color); background: var(--bg-tertiary); padding: 0.125rem 0.25rem; border-radius: 3px; font-size: 16px; }
            .hl-code-block { color: var(--danger-color); background: var(--bg-tertiary); display: block; padding: 0.5rem; margin: 0.25rem 0; border-radius: 3px; border-left: 3px solid var(--danger-color); font-size: 16px; }
            .hl-link { color: var(--accent-color); font-size: 16px; }
            .hl-image { color: var(--warning-color); font-size: 16px; }
            .hl-image-placeholder { color: var(--success-color); font-weight: 600; background: rgba(25, 135, 84, 0.1); padding: 0.125rem 0.25rem; border-radius: 3px; font-size: 16px; }
            .hl-list { color: var(--accent-color); font-weight: 600; font-size: 16px; }
            .hl-quote { color: var(--text-secondary); font-style: italic; font-size: 16px; }
            .hl-quote-marker { color: var(--accent-color); font-weight: 700; font-size: 16px; }
            .hl-strikethrough { color: var(--text-secondary); text-decoration: line-through; font-size: 16px; }
            .hl-hr { color: var(--text-muted); opacity: 0.6; font-size: 16px; }
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        this.textArea.addEventListener('input', () => this.highlight());
        this.textArea.addEventListener('scroll', () => this.syncScroll());
        this.textArea.addEventListener('keyup', () => this.highlight());
    }

    syncScroll() {
        if (this.highlightDiv && this.textArea) {
            this.highlightDiv.scrollTop = this.textArea.scrollTop;
            this.highlightDiv.scrollLeft = this.textArea.scrollLeft;
        }
    }

    highlight() {
        if (!this.highlightDiv || !this.textArea) return;
        
        const text = this.textArea.value;
        
        // If there's no text, clear the highlight div to avoid placeholder conflicts
        if (!text || text.trim() === '') {
            this.highlightDiv.innerHTML = '';
            return;
        }
        
        const highlighted = this.highlightMarkdown(text);
        this.highlightDiv.innerHTML = highlighted;
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
        
        // Italic *text*
        result = result.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<span class="hl-italic">$&</span>');
        
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
