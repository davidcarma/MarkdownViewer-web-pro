/**
 * Core Markdown Editor functionality
 */
class MarkdownEditor {
    constructor() {
        this.editor = document.getElementById('editor');
        this.preview = document.getElementById('preview');
        this.fileName = document.getElementById('fileName');
        this.fileStatus = document.getElementById('fileStatus');
        this.lineCount = document.getElementById('lineCount');
        this.wordCount = document.getElementById('wordCount');
        this.charCount = document.getElementById('charCount');
        this.cursorPosition = document.getElementById('cursorPosition');
        this.fileInput = document.getElementById('fileInput');
        
        this.currentFileName = 'Untitled.md';
        this.isModified = false;
        this.lastSavedContent = '';
        
        this.init();
    }
    
    init() {
        this.setupMarked();
        this.bindEvents();
        this.updatePreview();
        this.updateStats();
        this.updateCursorPosition();
        this.loadTheme();
    }
    
    setupMarked() {
        // Configure marked.js
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.error('Highlight.js error:', err);
                    }
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
    }
    
    updatePreview() {
        try {
            // Use expanded content for preview if images are collapsed
            let markdownText = this.editor.value;
            if (this.imageCollapse && this.imageCollapse.getPreviewContent) {
                markdownText = this.imageCollapse.getPreviewContent();
            }
            
            const html = marked.parse(markdownText);
            this.preview.innerHTML = html;
            
            // Re-apply syntax highlighting to new code blocks
            this.preview.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        } catch (error) {
            console.error('Markdown parsing error:', error);
            this.preview.innerHTML = '<div class="error">Error parsing markdown</div>';
        }
    }
    
    updateStats() {
        const text = this.editor.value;
        const lines = text.split('\n').length;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        const chars = text.length;
        
        this.lineCount.textContent = `Lines: ${lines}`;
        this.wordCount.textContent = `Words: ${words}`;
        this.charCount.textContent = `Characters: ${chars}`;
    }
    
    updateCursorPosition() {
        const textarea = this.editor;
        const text = textarea.value;
        const cursorPos = textarea.selectionStart;
        
        const textBeforeCursor = text.substring(0, cursorPos);
        const lines = textBeforeCursor.split('\n');
        const lineNumber = lines.length;
        const columnNumber = lines[lines.length - 1].length + 1;
        
        this.cursorPosition.textContent = `Line ${lineNumber}, Column ${columnNumber}`;
    }
    
    syncScroll() {
        const editorScrollPercentage = this.editor.scrollTop / (this.editor.scrollHeight - this.editor.clientHeight);
        const previewScrollTop = editorScrollPercentage * (this.preview.scrollHeight - this.preview.clientHeight);
        this.preview.scrollTop = previewScrollTop;
    }
    
    setModified(modified) {
        this.isModified = modified;
        this.fileStatus.textContent = modified ? '●' : '';
        this.fileStatus.className = modified ? 'file-status' : 'file-status saved';
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('markdown-editor-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('markdown-editor-theme', newTheme);
    }
    
    togglePreview() {
        const previewPane = document.querySelector('.preview-pane');
        const editorPane = document.querySelector('.editor-pane');
        const divider = document.querySelector('.pane-divider');
        
        if (previewPane.style.display === 'none') {
            previewPane.style.display = 'flex';
            divider.style.display = 'block';
            editorPane.style.flex = '1';
        } else {
            previewPane.style.display = 'none';
            divider.style.display = 'none';
            editorPane.style.flex = '1 1 100%';
        }
    }
    
    copyHtml() {
        try {
            const html = this.preview.innerHTML;
            navigator.clipboard.writeText(html).then(() => {
                // Show success feedback
                const btn = document.getElementById('copyHtml');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"></polyline></svg>Copied!';
                btn.classList.add('success');
                
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('success');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy HTML:', err);
                alert('Failed to copy HTML to clipboard');
            });
        } catch (error) {
            console.error('Copy HTML error:', error);
            alert('Failed to copy HTML');
        }
    }
    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    bindEvents() {
        // Basic editor events - specific handlers will be added by modules
        this.editor.addEventListener('input', () => {
            this.updatePreview();
            this.updateStats();
            this.setModified(true);
        });
        
        this.editor.addEventListener('scroll', () => {
            this.syncScroll();
        });
        
        this.editor.addEventListener('keyup', () => {
            this.updateCursorPosition();
        });
        
        this.editor.addEventListener('click', () => {
            this.updateCursorPosition();
        });
    }
}
