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
        document.getElementById('openWordFile').addEventListener('click', () => this.editor.openWordFile());
        document.getElementById('saveFile').addEventListener('click', () => this.editor.saveFile());
        document.getElementById('exportToPdf').addEventListener('click', () => this.editor.exportToPdf());
        document.getElementById('printFile').addEventListener('click', () => this.editor.printFile());
        document.getElementById('toggleCompact').addEventListener('click', () => this.editor.toggleCompactMode());
        document.getElementById('unescapeContent').addEventListener('click', () => this.editor.unescapePastedContent());
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
        
        // Word file input event
        this.editor.wordFileInput.addEventListener('change', (e) => this.editor.handleWordFileOpen(e));
        
        // Image file input event
        const imageInput = document.getElementById('imageInput');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => this.handleImageFileInsert(e));
        }
        
        // Insert image button event
        const insertImageBtn = document.getElementById('insertImage');
        if (insertImageBtn) {
            insertImageBtn.addEventListener('click', () => {
                document.getElementById('imageInput').click();
            });
        }
        
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
            // Escape key to exit fullscreen mode
            if (e.key === 'Escape') {
                const app = document.querySelector('.app');
                if (app.classList.contains('fullscreen-mode')) {
                    e.preventDefault();
                    this.editor.exitFullscreenMode();
                    return;
                }
            }
            
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
                    case 'e':
                        e.preventDefault();
                        this.editor.exportToPdf();
                        break;
                    case 'p':
                        e.preventDefault();
                        this.editor.printFile();
                        break;
                    case 'b':
                        e.preventDefault();
                        this.applyFormat('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.applyFormat('italic');
                        break;
                    case 'l':
                        e.preventDefault();
                        this.editor.saveToLocalStorage();
                        break;
                    case 'u':
                        e.preventDefault();
                        this.editor.unescapePastedContent();
                        break;
                    // Let browser handle undo/redo natively
                    // case 'z': - Removed to allow native undo
                    // case 'y': - Removed to allow native redo
                }
            }
        });
    }
    
    async handleImageFileInsert(e) {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        try {
            for (const file of files) {
                await this.processImageFile(file);
            }
        } catch (error) {
            console.error('Error processing image file:', error);
            this.editor.showNotification('Error processing image file', 'error');
        }
        
        // Clear the input so the same file can be selected again
        e.target.value = '';
    }
    
    async processImageFile(file) {
        return new Promise((resolve, reject) => {
            // Show visual feedback
            const editorPane = document.querySelector('.editor-pane');
            editorPane.classList.add('processing-image');
            this.editor.showNotification(`Processing ${file.name}...`, 'info');
            
            if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
                // Handle SVG files as text
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const svgText = e.target.result;
                        
                        // Clean SVG for embedding
                        const cleanedSvg = this.cleanSvgForEmbedding(svgText);
                        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cleanedSvg)))}`;
                        
                        // Insert at cursor position
                        this.insertImageAtCursor(file.name, svgDataUrl);
                        
                        editorPane.classList.remove('processing-image');
                        
                        // Check for interactivity
                        const hadInteractivity = svgText.includes('<script>') || svgText.includes('onclick') || svgText.includes('onmouseover');
                        
                        if (hadInteractivity) {
                            this.editor.showNotification(`${file.name} inserted! Interactive elements removed for security`, 'info');
                        } else {
                            this.editor.showNotification(`${file.name} inserted successfully!`, 'success');
                        }
                        resolve();
                    } catch (error) {
                        editorPane.classList.remove('processing-image');
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    editorPane.classList.remove('processing-image');
                    reject(new Error('Failed to read SVG file'));
                };
                reader.readAsText(file);
            } else {
                // Handle regular image files
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const dataUrl = e.target.result;
                        
                        // Insert at cursor position
                        this.insertImageAtCursor(file.name, dataUrl);
                        
                        editorPane.classList.remove('processing-image');
                        this.editor.showNotification(`${file.name} inserted successfully!`, 'success');
                        resolve();
                    } catch (error) {
                        editorPane.classList.remove('processing-image');
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    editorPane.classList.remove('processing-image');
                    reject(new Error('Failed to read image file'));
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    insertImageAtCursor(fileName, dataUrl) {
        const editor = this.editor.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;
        
        // Create markdown image syntax
        const imageMarkdown = `![${fileName}](${dataUrl})`;
        
        // Insert at cursor position
        const newValue = value.substring(0, start) + imageMarkdown + value.substring(end);
        
        // Use requestAnimationFrame to ensure proper sequence
        requestAnimationFrame(() => {
            editor.value = newValue;
            
            // Move cursor to end of inserted text
            const newCursorPos = start + imageMarkdown.length;
            
            setTimeout(() => {
                editor.setSelectionRange(newCursorPos, newCursorPos);
                editor.focus();
                
                // Update editor state
                this.editor.updatePreview();
                this.editor.updateStats();
                this.editor.updateCursorPosition();
                this.editor.setModified(true);
                
                // Auto-collapse if enabled
                if (this.editor.imageCollapse) {
                    setTimeout(() => {
                        this.editor.imageCollapse.handleImagePasted();
                    }, 100);
                }
            }, 10);
        });
    }
    
    cleanSvgForEmbedding(svgText) {
        let cleaned = svgText.trim();
        
        // Remove script tags and their content (security and compatibility)
        cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
        
        // Remove event handlers for security
        cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
        
        // Remove CDATA sections that might cause issues
        cleaned = cleaned.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
        
        // Ensure proper XML declaration if missing
        if (!cleaned.startsWith('<?xml') && !cleaned.startsWith('<svg')) {
            cleaned = '<?xml version="1.0" encoding="UTF-8"?>\n' + cleaned;
        }
        
        // Add proper namespace if missing
        if (cleaned.includes('<svg') && !cleaned.includes('xmlns=')) {
            cleaned = cleaned.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        
        return cleaned;
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
            case 'mermaid':
                replacement = selectedText ? 
                    `\`\`\`mermaid\n${selectedText}\n\`\`\`` :
                    `\`\`\`mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]\n    C --> E[End]\n    D --> E\n\`\`\``;
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
