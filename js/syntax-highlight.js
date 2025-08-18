/**
 * Simple Markdown Editor - No Complex Highlighting
 * Just a clean, reliable textarea without overlay complications
 */
class MarkdownSyntaxHighlighter {
    constructor(editor) {
        this.editor = editor;
        this.textarea = document.getElementById('editor');
        this.init();
    }

    init() {
        this.setupSimpleEditor();
        console.log('✨ Simple editor initialized - no overlay complexity');
    }
    
    setupSimpleEditor() {
        // Remove any existing wrappers if they exist
        const existingWrapper = this.textarea.closest('.syntax-wrapper');
        if (existingWrapper) {
            const parent = existingWrapper.parentNode;
            parent.insertBefore(this.textarea, existingWrapper);
            parent.removeChild(existingWrapper);
        }
        
        // Reset textarea to normal styling - clean and simple
        this.textarea.style.background = '';
        this.textarea.style.color = '';
        this.textarea.style.caretColor = '';
        this.textarea.style.position = '';
        this.textarea.style.zIndex = '';
    }
    
    // Simple methods for compatibility
    highlight() {
        // No complex highlighting - just a simple, reliable editor
        console.log('Simple editor - no highlighting needed');
    }
    
    refresh() {
        // Nothing to refresh in simple mode
    }
}

// Add to MarkdownEditor
MarkdownEditor.prototype.setupSyntaxHighlighting = function() {
    this.syntaxHighlighter = new MarkdownSyntaxHighlighter(this);
};
