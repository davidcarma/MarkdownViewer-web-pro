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
        this.imageWidgets = new Map(); // Store image widgets
        this.showImageWidgets = true; // Toggle for widget view
        
        this.init();
    }
    
    init() {
        this.setupMarked();
        this.bindEvents();
        this.updatePreview();
        this.updateStats();
        this.updateCursorPosition();
        this.loadTheme();
        this.scanExistingImages();
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
            
            // Update masked editor if in widget mode
            if (this.showImageWidgets) {
                this.updateMaskedEditor();
            }
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
        
        // Image paste events
        this.setupImagePaste();
        
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
    
    setupImagePaste() {
        // Listen for paste events on the editor
        this.editor.addEventListener('paste', (e) => {
            this.handlePaste(e);
        });
    }
    
    async handlePaste(e) {
        // Check if clipboard contains files (images)
        const items = Array.from(e.clipboardData.items);
        const imageItems = items.filter(item => item.type.startsWith('image/'));
        
        if (imageItems.length === 0) {
            // No images in clipboard, let default paste behavior happen
            return;
        }
        
        // Prevent default paste behavior for images
        e.preventDefault();
        
        try {
            // Process each image
            for (const item of imageItems) {
                await this.processImagePaste(item);
            }
        } catch (error) {
            console.error('Error processing pasted image:', error);
            this.showNotification('Error processing pasted image', 'error');
        }
    }
    
    async processImagePaste(item) {
        return new Promise((resolve, reject) => {
            const file = item.getAsFile();
            if (!file) {
                reject(new Error('Could not get file from clipboard item'));
                return;
            }
            
            // Show visual feedback
            const editorPane = document.querySelector('.editor-pane');
            editorPane.classList.add('processing-image');
            this.showNotification('Processing pasted image...', 'info');
            
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const dataUrl = e.target.result;
                    const fileName = this.generateImageFileName(file.type);
                    
                    // Insert markdown image syntax at cursor position
                    this.insertImageAtCursor(fileName, dataUrl);
                    
                    // Remove processing state
                    const editorPane = document.querySelector('.editor-pane');
                    editorPane.classList.remove('processing-image');
                    
                    this.showNotification('Image pasted successfully!', 'success');
                    resolve();
                } catch (error) {
                    // Remove processing state on error
                    const editorPane = document.querySelector('.editor-pane');
                    editorPane.classList.remove('processing-image');
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                // Remove processing state on error
                const editorPane = document.querySelector('.editor-pane');
                editorPane.classList.remove('processing-image');
                reject(new Error('Failed to read image file'));
            };
            
            // Read the file as data URL
            reader.readAsDataURL(file);
        });
    }
    
    generateImageFileName(mimeType) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = mimeType.split('/')[1] || 'png';
        return `pasted-image-${timestamp}.${extension}`;
    }
    
    insertImageAtCursor(fileName, dataUrl) {
        const editor = this.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;
        
        // Create markdown image syntax with data URL
        const imageMarkdown = `![${fileName}](${dataUrl})`;
        
        // Insert at cursor position
        const newValue = value.substring(0, start) + imageMarkdown + value.substring(end);
        editor.value = newValue;
        
        // Move cursor to end of inserted text
        const newCursorPos = start + imageMarkdown.length;
        editor.setSelectionRange(newCursorPos, newCursorPos);
        
        // Update editor state
        this.updatePreview();
        this.updateStats();
        this.updateCursorPosition();
        this.setModified(true);
        
        // Focus back to editor
        editor.focus();
        
        // Create image widget for the inserted image
        this.createImageWidget(fileName, dataUrl, newCursorPos - imageMarkdown.length);
        this.updateEditorDisplay();
    }
    
    createImageWidget(fileName, dataUrl, position) {
        const widgetId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.imageWidgets.set(widgetId, {
            id: widgetId,
            fileName: fileName,
            dataUrl: dataUrl,
            position: position,
            markdown: `![${fileName}](${dataUrl})`
        });
    }
    
    updateEditorDisplay() {
        const editorContainer = document.querySelector('.editor-pane');
        
        if (!this.showImageWidgets) {
            // Remove widgets and show original text
            editorContainer.querySelectorAll('.image-widget').forEach(widget => widget.remove());
            const overlay = editorContainer.querySelector('.editor-overlay');
            if (overlay) overlay.remove();
            const mask = editorContainer.querySelector('.editor-mask');
            if (mask) mask.remove();
            
            // Remove widget mode class
            editorContainer.classList.remove('widget-mode');
            return;
        }
        
        // Remove existing widgets
        editorContainer.querySelectorAll('.image-widget').forEach(widget => widget.remove());
        
        // Create overlay for widgets
        let overlay = editorContainer.querySelector('.editor-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'editor-overlay';
            editorContainer.appendChild(overlay);
        }
        
        // Add widget mode class
        editorContainer.classList.add('widget-mode');
        
        // Create masked editor content
        this.createMaskedEditor();
        
        const editorValue = this.editor.value;
        
        // Find and create widgets for each image
        for (const [widgetId, widget] of this.imageWidgets) {
            const imageRegex = new RegExp(`!\\[${this.escapeRegex(widget.fileName)}\\]\\(data:image/[^)]+\\)`, 'g');
            let match;
            
            while ((match = imageRegex.exec(editorValue)) !== null) {
                const matchStart = match.index;
                
                // Calculate line and position
                const beforeMatch = editorValue.substring(0, matchStart);
                const lineNumber = beforeMatch.split('\n').length;
                
                // Create widget element
                this.createImageWidgetElement(widget, lineNumber, overlay);
                break; // Only create one widget per image
            }
        }
    }
    
    createMaskedEditor() {
        const editorContainer = document.querySelector('.editor-pane');
        
        // Remove existing masked editor
        const existingMask = editorContainer.querySelector('.editor-mask');
        if (existingMask) existingMask.remove();
        
        // Create masked version of editor content
        const maskedContent = this.createMaskedContent();
        
        const maskedEditor = document.createElement('div');
        maskedEditor.className = 'editor-mask';
        maskedEditor.innerHTML = maskedContent;
        
        // Position it over the real editor
        editorContainer.appendChild(maskedEditor);
    }
    
    createMaskedContent() {
        let content = this.editor.value;
        
        // Replace each image with a placeholder
        for (const [widgetId, widget] of this.imageWidgets) {
            const imageRegex = new RegExp(`!\\[${this.escapeRegex(widget.fileName)}\\]\\(data:image/[^)]+\\)`, 'g');
            content = content.replace(imageRegex, `![${widget.fileName}](...)`);
        }
        
        // Convert to HTML with proper line breaks and syntax highlighting
        const lines = content.split('\n');
        return lines.map((line, index) => {
            // Escape HTML first
            let escapedLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // Simple markdown syntax highlighting
            let highlightedLine = escapedLine
                .replace(/^(#{1,6})\s+(.*)/, '<span class="md-header">$1 $2</span>')
                .replace(/\*\*(.*?)\*\*/g, '<span class="md-bold">**$1**</span>')
                .replace(/\*(.*?)\*/g, '<span class="md-italic">*$1*</span>')
                .replace(/`(.*?)`/g, '<span class="md-code">`$1`</span>')
                .replace(/!\[([^\]]*)\]\(\.\.\.+\)/g, '<span class="md-image">![$1](...)</span>');
            
            return `<div class="editor-line" data-line="${index + 1}">${highlightedLine || '&nbsp;'}</div>`;
        }).join('');
    }
    
    updateMaskedEditor() {
        const editorContainer = document.querySelector('.editor-pane');
        const maskedEditor = editorContainer.querySelector('.editor-mask');
        
        if (maskedEditor) {
            maskedEditor.innerHTML = this.createMaskedContent();
        }
    }
    
    createImageWidgetElement(widget, lineNumber, container) {
        const widgetEl = document.createElement('div');
        widgetEl.className = 'image-widget';
        widgetEl.setAttribute('data-widget-id', widget.id);
        widgetEl.style.top = `${(lineNumber - 1) * 1.5 + 1}rem`; // Approximate line height
        
        widgetEl.innerHTML = `
            <div class="image-widget-content">
                <div class="image-widget-preview">
                    <img src="${widget.dataUrl}" alt="${widget.fileName}" />
                </div>
                <div class="image-widget-info">
                    <span class="image-widget-name">${widget.fileName}</span>
                    <div class="image-widget-controls">
                        <button class="widget-btn" onclick="markdownEditor.expandWidget('${widget.id}')" title="Expand">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="15,3 21,3 21,9"></polyline>
                                <polyline points="9,21 3,21 3,15"></polyline>
                                <line x1="21" y1="3" x2="14" y2="10"></line>
                                <line x1="3" y1="21" x2="10" y2="14"></line>
                            </svg>
                        </button>
                        <button class="widget-btn widget-btn-danger" onclick="markdownEditor.deleteWidget('${widget.id}')" title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3,6 5,6 21,6"></polyline>
                                <path d="M19,6v14a2,2 0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Make widget draggable
        this.makeWidgetDraggable(widgetEl);
        
        container.appendChild(widgetEl);
    }
    
    makeWidgetDraggable(widgetEl) {
        let isDragging = false;
        let startY = 0;
        let startTop = 0;
        
        const handleMouseDown = (e) => {
            if (e.target.closest('.image-widget-controls')) return; // Don't drag when clicking controls
            
            isDragging = true;
            startY = e.clientY;
            startTop = parseInt(widgetEl.style.top);
            widgetEl.classList.add('dragging');
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
        };
        
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            const deltaY = e.clientY - startY;
            const newTop = startTop + deltaY;
            const lineHeight = 24; // Approximate line height in pixels
            const lineNumber = Math.max(1, Math.round(newTop / lineHeight) + 1);
            
            widgetEl.style.top = `${(lineNumber - 1) * 1.5 + 1}rem`;
        };
        
        const handleMouseUp = () => {
            if (!isDragging) return;
            
            isDragging = false;
            widgetEl.classList.remove('dragging');
            
            // Update widget position in markdown
            this.updateWidgetPosition(widgetEl);
            
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        widgetEl.addEventListener('mousedown', handleMouseDown);
    }
    
    updateWidgetPosition(widgetEl) {
        const widgetId = widgetEl.getAttribute('data-widget-id');
        const widget = this.imageWidgets.get(widgetId);
        if (!widget) return;
        
        const currentTop = parseInt(widgetEl.style.top);
        const lineNumber = Math.round((currentTop - 16) / 24) + 1; // Convert back to line number
        
        // Remove the image from current position
        let editorValue = this.editor.value;
        const imageRegex = new RegExp(`!\\[${this.escapeRegex(widget.fileName)}\\]\\(data:image/[^)]+\\)`, 'g');
        editorValue = editorValue.replace(imageRegex, '');
        
        // Insert at new position
        const lines = editorValue.split('\n');
        const targetLine = Math.min(lineNumber - 1, lines.length);
        lines.splice(targetLine, 0, widget.markdown);
        
        this.editor.value = lines.join('\n');
        this.updatePreview();
        this.setModified(true);
    }
    
    expandWidget(widgetId) {
        // Toggle to raw markdown view
        this.showImageWidgets = false;
        this.updateEditorDisplay();
        
        // Find and select the markdown text for this widget
        const widget = this.imageWidgets.get(widgetId);
        if (widget) {
            const imageRegex = new RegExp(`!\\[${this.escapeRegex(widget.fileName)}\\]\\(data:image/[^)]+\\)`, 'g');
            const match = imageRegex.exec(this.editor.value);
            if (match) {
                this.editor.setSelectionRange(match.index, match.index + match[0].length);
                this.editor.focus();
            }
        }
        
        // Add toggle button to switch back
        this.showWidgetToggle();
    }
    
    deleteWidget(widgetId) {
        const widget = this.imageWidgets.get(widgetId);
        if (!widget) return;
        
        if (confirm(`Delete image "${widget.fileName}"?`)) {
            // Remove from editor
            const imageRegex = new RegExp(`!\\[${this.escapeRegex(widget.fileName)}\\]\\(data:image/[^)]+\\)`, 'g');
            this.editor.value = this.editor.value.replace(imageRegex, '');
            
            // Remove from widgets map
            this.imageWidgets.delete(widgetId);
            
            // Update displays
            this.updateEditorDisplay();
            this.updatePreview();
            this.setModified(true);
        }
    }
    
    showWidgetToggle() {
        // Add a toggle button to switch back to widget view
        let toggleBtn = document.querySelector('.widget-toggle-btn');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.className = 'btn btn-sm widget-toggle-btn';
            toggleBtn.innerHTML = '🖼️ Widget View';
            toggleBtn.onclick = () => this.toggleWidgetView();
            
            const editorHeader = document.querySelector('.editor-pane .pane-header');
            editorHeader.appendChild(toggleBtn);
        }
    }
    
    toggleWidgetView() {
        this.showImageWidgets = !this.showImageWidgets;
        this.updateEditorDisplay();
        
        const toggleBtn = document.querySelector('.widget-toggle-btn');
        if (toggleBtn) {
            toggleBtn.innerHTML = this.showImageWidgets ? '📝 Raw View' : '🖼️ Widget View';
        }
    }
    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    scanExistingImages() {
        // Scan editor content for existing images and create widgets
        const imageRegex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g;
        const editorValue = this.editor.value;
        let match;
        
        while ((match = imageRegex.exec(editorValue)) !== null) {
            const fileName = match[1] || 'Untitled Image';
            const dataUrl = match[2];
            
            this.createImageWidget(fileName, dataUrl, match.index);
        }
        
        if (this.imageWidgets.size > 0) {
            this.updateEditorDisplay();
            this.showWidgetToggle();
        }
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
    window.markdownEditor = new MarkdownEditor();
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
