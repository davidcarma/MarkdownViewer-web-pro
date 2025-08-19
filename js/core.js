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
    
    printFile() {
        try {
            // Get the current theme for proper styling
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            // Get the preview content
            let markdownText = this.editor.value;
            if (this.imageCollapse && this.imageCollapse.getPreviewContent) {
                markdownText = this.imageCollapse.getPreviewContent();
            }
            
            const html = marked.parse(markdownText);
            
            // Create a new window for printing
            const printWindow = window.open('', '_blank');
            
            // Create the print document
            const printContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${this.currentFileName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }
        h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1em; }
        h5 { font-size: 0.875em; }
        h6 { font-size: 0.85em; color: #666; }
        p { margin-bottom: 16px; }
        blockquote {
            margin: 0;
            padding: 0 1em;
            color: #666;
            border-left: 0.25em solid #dfe2e5;
        }
        ul, ol {
            padding-left: 2em;
            margin-bottom: 16px;
        }
        li { margin-bottom: 0.25em; }
        code {
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            background-color: #f6f8fa;
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }
        pre {
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            background-color: #f6f8fa;
            border-radius: 6px;
            margin-bottom: 16px;
        }
        pre code {
            display: inline;
            max-width: auto;
            padding: 0;
            margin: 0;
            overflow: visible;
            line-height: inherit;
            word-wrap: normal;
            background-color: transparent;
            border: 0;
        }
        table {
            border-spacing: 0;
            border-collapse: collapse;
            margin-bottom: 16px;
            width: 100%;
        }
        table th, table td {
            padding: 6px 13px;
            border: 1px solid #dfe2e5;
        }
        table th {
            font-weight: 600;
            background-color: #f6f8fa;
        }
        table tr:nth-child(2n) {
            background-color: #f6f8fa;
        }
        img {
            max-width: 100%;
            height: auto;
            box-sizing: content-box;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
        }
        @media print {
            body { margin: 0; padding: 15px; }
            a[href]:after { content: " (" attr(href) ")"; }
            pre, blockquote { page-break-inside: avoid; }
            h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
        }
    </style>
</head>
<body>
    <div class="print-header">
        <h1 style="margin-top: 0; border-bottom: 2px solid #333; padding-bottom: 10px;">${this.currentFileName}</h1>
    </div>
    ${html}
</body>
</html>`;
            
            printWindow.document.write(printContent);
            printWindow.document.close();
            
            // Wait for content to load, then print
            printWindow.onload = () => {
                setTimeout(() => {
                    printWindow.focus();
                    printWindow.print();
                    printWindow.close();
                }, 250);
            };
            
            // Show success feedback
            const btn = document.getElementById('printFile');
            const originalTitle = btn.title;
            btn.title = 'Print dialog opened';
            
            setTimeout(() => {
                btn.title = originalTitle;
            }, 2000);
            
        } catch (error) {
            console.error('Print error:', error);
            alert('Failed to open print dialog');
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
            
            // Refresh syntax highlighting if available
            if (this.syntaxHighlighter) {
                this.syntaxHighlighter.debouncedHighlight();
            }
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
