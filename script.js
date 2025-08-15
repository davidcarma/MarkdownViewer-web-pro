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
    
    bindEvents() {
        // Editor events
        this.editor.addEventListener('input', () => {
            this.updatePreview();
            this.updateStats();
            this.setModified(true);
        });
        
        this.editor.addEventListener('scroll', () => {
            this.syncScroll();
        });
        
        this.editor.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
        
        this.editor.addEventListener('keyup', () => {
            this.updateCursorPosition();
        });
        
        this.editor.addEventListener('click', () => {
            this.updateCursorPosition();
        });
        
        // Toolbar events
        document.getElementById('newFile').addEventListener('click', () => this.newFile());
        document.getElementById('openFile').addEventListener('click', () => this.openFile());
        document.getElementById('saveFile').addEventListener('click', () => this.saveFile());
        document.getElementById('togglePreview').addEventListener('click', () => this.togglePreview());
        document.getElementById('toggleTheme').addEventListener('click', () => this.toggleTheme());
        document.getElementById('copyHtml').addEventListener('click', () => this.copyHtml());
        
        // Format toolbar events
        document.querySelectorAll('.btn-format').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const format = e.currentTarget.getAttribute('data-format');
                this.applyFormat(format);
            });
        });
        
        // File input event
        this.fileInput.addEventListener('change', (e) => this.handleFileOpen(e));
        
        // Drag and drop events
        this.setupDragAndDrop();
        
        // Window events
        window.addEventListener('beforeunload', (e) => {
            if (this.isModified) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'n':
                        e.preventDefault();
                        this.newFile();
                        break;
                    case 'o':
                        e.preventDefault();
                        this.openFile();
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveFile();
                        break;
                    case 'b':
                        e.preventDefault();
                        this.applyFormat('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.applyFormat('italic');
                        break;
                }
            }
        });
    }
    
    updatePreview() {
        try {
            const markdownText = this.editor.value;
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
    
    handleKeydown(e) {
        // Tab handling
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.editor.selectionStart;
            const end = this.editor.selectionEnd;
            const value = this.editor.value;
            
            if (e.shiftKey) {
                // Shift+Tab: Remove indentation
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = value.indexOf('\n', end);
                const selectedLines = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);
                
                if (selectedLines.startsWith('    ')) {
                    this.editor.value = value.substring(0, lineStart) + 
                                      selectedLines.substring(4) + 
                                      value.substring(lineEnd === -1 ? value.length : lineEnd);
                    this.editor.setSelectionRange(start - 4, end - 4);
                } else if (selectedLines.startsWith('\t')) {
                    this.editor.value = value.substring(0, lineStart) + 
                                      selectedLines.substring(1) + 
                                      value.substring(lineEnd === -1 ? value.length : lineEnd);
                    this.editor.setSelectionRange(start - 1, end - 1);
                }
            } else {
                // Tab: Add indentation
                this.editor.value = value.substring(0, start) + '    ' + value.substring(end);
                this.editor.setSelectionRange(start + 4, start + 4);
            }
            
            this.updatePreview();
            this.setModified(true);
        }
        
        // Auto-close brackets and quotes
        const pairs = {
            '(': ')',
            '[': ']',
            '{': '}',
            '"': '"',
            "'": "'",
            '`': '`'
        };
        
        if (pairs[e.key] && this.editor.selectionStart === this.editor.selectionEnd) {
            const start = this.editor.selectionStart;
            const value = this.editor.value;
            
            this.editor.value = value.substring(0, start) + e.key + pairs[e.key] + value.substring(start);
            this.editor.setSelectionRange(start + 1, start + 1);
            e.preventDefault();
            
            this.updatePreview();
            this.setModified(true);
        }
    }
    
    applyFormat(format) {
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const selectedText = this.editor.value.substring(start, end);
        let replacement = '';
        
        switch (format) {
            case 'bold':
                replacement = `**${selectedText || 'bold text'}**`;
                break;
            case 'italic':
                replacement = `*${selectedText || 'italic text'}*`;
                break;
            case 'code':
                replacement = `\`${selectedText || 'code'}\``;
                break;
            case 'h1':
                replacement = `# ${selectedText || 'Heading 1'}`;
                break;
            case 'h2':
                replacement = `## ${selectedText || 'Heading 2'}`;
                break;
            case 'h3':
                replacement = `### ${selectedText || 'Heading 3'}`;
                break;
            case 'ul':
                replacement = selectedText ? 
                    selectedText.split('\n').map(line => `- ${line}`).join('\n') :
                    '- List item 1\n- List item 2\n- List item 3';
                break;
            case 'ol':
                replacement = selectedText ?
                    selectedText.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n') :
                    '1. List item 1\n2. List item 2\n3. List item 3';
                break;
            case 'quote':
                replacement = selectedText ?
                    selectedText.split('\n').map(line => `> ${line}`).join('\n') :
                    '> Quote text';
                break;
            case 'link':
                replacement = `[${selectedText || 'Link text'}](https://example.com)`;
                break;
            case 'image':
                replacement = `![${selectedText || 'Alt text'}](https://example.com/image.jpg)`;
                break;
            case 'table':
                replacement = `| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |`;
                break;
        }
        
        this.editor.value = this.editor.value.substring(0, start) + replacement + this.editor.value.substring(end);
        
        // Set cursor position
        if (selectedText) {
            this.editor.setSelectionRange(start, start + replacement.length);
        } else {
            const cursorPos = start + replacement.length;
            this.editor.setSelectionRange(cursorPos, cursorPos);
        }
        
        this.editor.focus();
        this.updatePreview();
        this.setModified(true);
    }
    
    newFile() {
        if (this.isModified) {
            if (!confirm('You have unsaved changes. Are you sure you want to create a new file?')) {
                return;
            }
        }
        
        this.editor.value = '';
        this.currentFileName = 'Untitled.md';
        this.fileName.textContent = this.currentFileName;
        this.setModified(false);
        this.updatePreview();
        this.updateStats();
        this.editor.focus();
    }
    
    openFile() {
        this.fileInput.click();
    }
    
    handleFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.value = e.target.result;
            this.currentFileName = file.name;
            this.fileName.textContent = this.currentFileName;
            this.lastSavedContent = e.target.result;
            this.setModified(false);
            this.updatePreview();
            this.updateStats();
            this.editor.focus();
        };
        reader.readAsText(file);
        
        // Clear the input so the same file can be opened again
        event.target.value = '';
    }
    
    saveFile() {
        const content = this.editor.value;
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.lastSavedContent = content;
        this.setModified(false);
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
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('markdown-editor-theme', newTheme);
    }
    
    loadTheme() {
        const savedTheme = localStorage.getItem('markdown-editor-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
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
    
    setModified(modified) {
        this.isModified = modified;
        this.fileStatus.textContent = modified ? '●' : '';
        this.fileStatus.className = modified ? 'file-status' : 'file-status saved';
    }
    
    setupDragAndDrop() {
        const editorPane = document.querySelector('.editor-pane');
        const editor = this.editor;
        
        // Prevent default drag behaviors on the entire editor pane
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            editorPane.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        
        // Add visual feedback for drag over
        editorPane.addEventListener('dragenter', (e) => {
            editorPane.classList.add('drag-over');
        });
        
        editorPane.addEventListener('dragleave', (e) => {
            // Only remove drag-over if we're leaving the editor pane entirely
            if (!editorPane.contains(e.relatedTarget)) {
                editorPane.classList.remove('drag-over');
            }
        });
        
        editorPane.addEventListener('dragover', (e) => {
            editorPane.classList.add('drag-over');
        });
        
        // Handle file drop
        editorPane.addEventListener('drop', (e) => {
            editorPane.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files);
            const textFiles = files.filter(file => 
                file.type === 'text/markdown' || 
                file.type === 'text/plain' || 
                file.name.endsWith('.md') || 
                file.name.endsWith('.txt') ||
                file.name.endsWith('.markdown')
            );
            
            if (textFiles.length === 0) {
                this.showNotification('Please drop a markdown or text file', 'error');
                return;
            }
            
            if (textFiles.length > 1) {
                this.showNotification('Please drop only one file at a time', 'error');
                return;
            }
            
            const file = textFiles[0];
            this.handleFileDrop(file);
        });
    }
    
    async handleFileDrop(file) {
        // If current content is modified, ask user what to do
        if (this.isModified) {
            const action = await this.showFileReplaceDialog(file.name);
            
            if (action === 'cancel') {
                return;
            } else if (action === 'save') {
                // Save current file first
                this.saveFile();
            }
            // If action is 'replace', we continue without saving
        }
        
        // Read and load the dropped file
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.value = e.target.result;
            this.currentFileName = file.name;
            this.fileName.textContent = this.currentFileName;
            this.lastSavedContent = e.target.result;
            this.setModified(false);
            this.updatePreview();
            this.updateStats();
            this.updateCursorPosition();
            this.editor.focus();
            
            this.showNotification(`Loaded "${file.name}" successfully`, 'success');
        };
        
        reader.onerror = () => {
            this.showNotification('Error reading file', 'error');
        };
        
        reader.readAsText(file);
    }
    
    showFileReplaceDialog(fileName) {
        return new Promise((resolve) => {
            // Create modal dialog
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-header">
                        <h3>Replace Current File?</h3>
                    </div>
                    <div class="modal-body">
                        <p>You have unsaved changes in the current file.</p>
                        <p>What would you like to do with <strong>"${fileName}"</strong>?</p>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                        <button class="btn btn-primary" data-action="save">Save Current & Load New</button>
                        <button class="btn btn-danger" data-action="replace">Replace Without Saving</button>
                    </div>
                </div>
            `;
            
            // Add event listeners
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    // Clicked outside modal
                    document.body.removeChild(modal);
                    resolve('cancel');
                }
                
                const action = e.target.getAttribute('data-action');
                if (action) {
                    document.body.removeChild(modal);
                    resolve(action);
                }
            });
            
            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.body.removeChild(modal);
                    document.removeEventListener('keydown', handleEscape);
                    resolve('cancel');
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            document.body.appendChild(modal);
            
            // Focus the save button by default
            modal.querySelector('[data-action="save"]').focus();
        });
    }
    
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('notification-fade-out');
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 3000);
    }
}

// Auto-resize functionality for split panes
class PaneResizer {
    constructor() {
        this.divider = document.querySelector('.pane-divider');
        this.editorPane = document.querySelector('.editor-pane');
        this.previewPane = document.querySelector('.preview-pane');
        this.isResizing = false;
        
        this.init();
    }
    
    init() {
        this.divider.addEventListener('mousedown', this.startResize.bind(this));
        document.addEventListener('mousemove', this.resize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));
    }
    
    startResize(e) {
        this.isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }
    
    resize(e) {
        if (!this.isResizing) return;
        
        const container = document.querySelector('.editor-container');
        const containerRect = container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const containerWidth = containerRect.width;
        
        const leftWidth = Math.max(200, Math.min(mouseX, containerWidth - 200));
        const rightWidth = containerWidth - leftWidth - 4; // 4px for divider
        
        this.editorPane.style.flex = `0 0 ${leftWidth}px`;
        this.previewPane.style.flex = `0 0 ${rightWidth}px`;
    }
    
    stopResize() {
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const editor = new MarkdownEditor();
    const resizer = new PaneResizer();
    
    // Add some helpful console messages
    console.log('🚀 Markdown Editor initialized successfully!');
    console.log('💡 Keyboard shortcuts:');
    console.log('   Ctrl/Cmd + N: New file');
    console.log('   Ctrl/Cmd + O: Open file');
    console.log('   Ctrl/Cmd + S: Save file');
    console.log('   Ctrl/Cmd + B: Bold text');
    console.log('   Ctrl/Cmd + I: Italic text');
    console.log('   Tab: Indent');
    console.log('   Shift + Tab: Unindent');
});

// Export for potential future use
window.MarkdownEditor = MarkdownEditor;
