/**
 * Event handling for the Markdown Editor
 */
class EditorEvents {
    constructor(editor) {
        this.editor = editor;
        this.bindEvents();
    }
    
    bindEvents() {
        // Additional editor events (basic events are handled in core)
        this.editor.editor.addEventListener('input', () => {
            // Handle image collapse if needed
            if (this.editor.imageCollapse && this.editor.imageCollapse.handleImagePasted) {
                this.editor.imageCollapse.handleImagePasted();
            }
        });
        
        this.editor.editor.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
        
        // Toolbar events
        document.getElementById('newFile').addEventListener('click', () => this.editor.newFile());
        document.getElementById('openFile').addEventListener('click', () => this.editor.openFile());
        document.getElementById('saveFile').addEventListener('click', () => this.editor.saveFile());
        document.getElementById('togglePreview').addEventListener('click', () => this.editor.togglePreview());
        document.getElementById('toggleTheme').addEventListener('click', () => this.editor.toggleTheme());
        document.getElementById('copyHtml').addEventListener('click', () => this.editor.copyHtml());
        
        // Format toolbar events
        document.querySelectorAll('.btn-format').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const format = e.currentTarget.getAttribute('data-format');
                this.applyFormat(format);
            });
        });
        
        // File input event
        this.editor.fileInput.addEventListener('change', (e) => this.editor.handleFileOpen(e));
        
        // Window events
        window.addEventListener('beforeunload', (e) => {
            if (this.editor.isModified) {
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
                        this.editor.newFile();
                        break;
                    case 'o':
                        e.preventDefault();
                        this.editor.openFile();
                        break;
                    case 's':
                        e.preventDefault();
                        this.editor.saveFile();
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
    
    handleKeydown(e) {
        // Tab handling
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.editor.editor.selectionStart;
            const end = this.editor.editor.selectionEnd;
            const value = this.editor.editor.value;
            
            if (e.shiftKey) {
                // Shift+Tab: Remove indentation
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = value.indexOf('\n', end);
                const selectedLines = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);
                
                if (selectedLines.startsWith('    ')) {
                    this.editor.editor.value = value.substring(0, lineStart) + 
                                          selectedLines.substring(4) + 
                                          value.substring(lineEnd === -1 ? value.length : lineEnd);
                    this.editor.editor.setSelectionRange(start - 4, end - 4);
                } else if (selectedLines.startsWith('\t')) {
                    this.editor.editor.value = value.substring(0, lineStart) + 
                                          selectedLines.substring(1) + 
                                          value.substring(lineEnd === -1 ? value.length : lineEnd);
                    this.editor.editor.setSelectionRange(start - 1, end - 1);
                }
            } else {
                // Tab: Add indentation
                this.editor.editor.value = value.substring(0, start) + '    ' + value.substring(end);
                this.editor.editor.setSelectionRange(start + 4, start + 4);
            }
            
            this.editor.updatePreview();
            this.editor.setModified(true);
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
        
        if (pairs[e.key] && this.editor.editor.selectionStart === this.editor.editor.selectionEnd) {
            const start = this.editor.editor.selectionStart;
            const value = this.editor.editor.value;
            
            this.editor.editor.value = value.substring(0, start) + e.key + pairs[e.key] + value.substring(start);
            this.editor.editor.setSelectionRange(start + 1, start + 1);
            e.preventDefault();
            
            this.editor.updatePreview();
            this.editor.setModified(true);
        }
    }
    
    applyFormat(format) {
        const start = this.editor.editor.selectionStart;
        const end = this.editor.editor.selectionEnd;
        const selectedText = this.editor.editor.value.substring(start, end);
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
        
        this.editor.editor.value = this.editor.editor.value.substring(0, start) + replacement + this.editor.editor.value.substring(end);
        
        // Set cursor position
        if (selectedText) {
            this.editor.editor.setSelectionRange(start, start + replacement.length);
        } else {
            const cursorPos = start + replacement.length;
            this.editor.editor.setSelectionRange(cursorPos, cursorPos);
        }
        
        this.editor.editor.focus();
        this.editor.updatePreview();
        this.editor.setModified(true);
    }
}
