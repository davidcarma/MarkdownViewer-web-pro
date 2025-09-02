/**
 * File operations for the Markdown Editor
 */
class FileOperations {
    constructor(editor) {
        this.editor = editor;
    }
    
    newFile() {
        if (this.editor.isModified) {
            // Offer to save current work first
            const shouldSave = confirm('You have unsaved changes. Would you like to save to localStorage before creating a new file?');
            if (shouldSave) {
                this.editor.saveToLocalStorage();
            }
        }
        
        // Create new file
        this.editor.editor.value = '';
        this.editor.setDocumentTitle('Untitled.md');
        this.editor.setModified(false);
        this.editor.updatePreview();
        this.editor.updateStats();
        
        // Replace localStorage buffer with new empty file
        this.editor.replaceLocalStorageFile();
        
        this.editor.editor.focus();
        
        // Show notification
        this.editor.showNotification('New file created', 'success');
    }
    
    openFile() {
        this.editor.fileInput.click();
    }
    
    openWordFile() {
        this.editor.wordFileInput.click();
    }
    
    handleFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.editor.editor.value = e.target.result;
            this.editor.setDocumentTitle(file.name);
            this.editor.lastSavedContent = e.target.result;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }

            // Replace localStorage buffer with loaded file
            this.editor.replaceLocalStorageFile();
            
            this.editor.editor.focus();
            
            // Show notification
            this.editor.showNotification(`File loaded to localStorage: ${file.name}`, 'success');
        };
        reader.readAsText(file);
        
        // Clear the input so the same file can be opened again
        event.target.value = '';
    }
    
    async handleWordFileOpen(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check if mammoth is available, with retry logic
        const checkMammoth = () => {
            return typeof mammoth !== 'undefined';
        };
        
        if (!checkMammoth()) {
            this.editor.showNotification('Checking mammoth.js availability...', 'info');
            
            // Wait a bit in case mammoth is still loading
            setTimeout(() => {
                if (!checkMammoth()) {
                    console.error('mammoth.js not available. Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('mammoth')));
                    this.editor.showNotification('Word import feature not available. Please check browser console for details.', 'error');
                    return;
                }
                
                // If mammoth became available, continue processing
                this.processWordFile(file);
            }, 200);
            return;
        }
        
        this.processWordFile(file);
    }
    
    async processWordFile(file) {
        // Show processing notification
        this.editor.showNotification('Converting Word document...', 'info');
        
        try {
            // Read file as ArrayBuffer first (mammoth.js requires this format)
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            
            // Convert Word document to HTML using ArrayBuffer
            const result = await mammoth.convertToHtml({arrayBuffer: arrayBuffer});
            const html = result.value;
            
            // Convert HTML to Markdown
            const markdown = this.htmlToMarkdown(html);
            
            // Set the converted content in the editor
            this.editor.editor.value = markdown;
            
            // Set filename with .md extension
            const originalName = file.name.replace(/\.[^/.]+$/, '');
            const newFileName = originalName + '.md';
            this.editor.setDocumentTitle(newFileName);
            
            this.editor.lastSavedContent = markdown;
            this.editor.setModified(false);
            this.editor.updatePreview();
            this.editor.updateStats();
            
            // Auto-collapse images if collapse is enabled
            if (this.editor.imageCollapse && this.editor.imageCollapse.initialize) {
                this.editor.imageCollapse.initialize();
            }

            // Replace localStorage buffer with converted file
            this.editor.replaceLocalStorageFile();
            
            this.editor.editor.focus();
            
            // Show success notification with any warnings
            const warnings = result.messages.filter(msg => msg.type === 'warning');
            let message = `Word document converted successfully: ${newFileName}`;
            if (warnings.length > 0) {
                message += ` (${warnings.length} formatting warnings)`;
            }
            this.editor.showNotification(message, 'success');
            
        } catch (error) {
            console.error('Word conversion error:', error);
            this.editor.showNotification('Failed to convert Word document: ' + error.message, 'error');
        }
    }
    
    // Helper method to read file as ArrayBuffer
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file: ' + e.target.error));
            reader.readAsArrayBuffer(file);
        });
    }
    
    // Convert HTML to Markdown
    htmlToMarkdown(html) {
        // Create a temporary DOM element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        let markdown = '';
        
        // Process each element
        const processElement = (element, indent = '') => {
            let result = '';
            
            switch (element.tagName.toLowerCase()) {
                case 'h1':
                    result = '# ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h2':
                    result = '## ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h3':
                    result = '### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h4':
                    result = '#### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h5':
                    result = '##### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'h6':
                    result = '###### ' + element.textContent.trim() + '\n\n';
                    break;
                case 'p':
                    const pText = this.processInlineElements(element);
                    if (pText.trim()) {
                        result = pText.trim() + '\n\n';
                    }
                    break;
                case 'strong':
                case 'b':
                    result = '**' + element.textContent + '**';
                    break;
                case 'em':
                case 'i':
                    result = '*' + element.textContent + '*';
                    break;
                case 'code':
                    result = '`' + element.textContent + '`';
                    break;
                case 'pre':
                    result = '```\n' + element.textContent + '\n```\n\n';
                    break;
                case 'ul':
                    for (const li of element.children) {
                        if (li.tagName.toLowerCase() === 'li') {
                            result += indent + '- ' + this.processInlineElements(li) + '\n';
                        }
                    }
                    result += '\n';
                    break;
                case 'ol':
                    let counter = 1;
                    for (const li of element.children) {
                        if (li.tagName.toLowerCase() === 'li') {
                            result += indent + counter + '. ' + this.processInlineElements(li) + '\n';
                            counter++;
                        }
                    }
                    result += '\n';
                    break;
                case 'blockquote':
                    const lines = element.textContent.trim().split('\n');
                    for (const line of lines) {
                        result += '> ' + line.trim() + '\n';
                    }
                    result += '\n';
                    break;
                case 'a':
                    const href = element.getAttribute('href') || '';
                    result = '[' + element.textContent + '](' + href + ')';
                    break;
                case 'img':
                    const src = element.getAttribute('src') || '';
                    const alt = element.getAttribute('alt') || 'image';
                    result = '![' + alt + '](' + src + ')';
                    break;
                case 'table':
                    result = this.processTable(element);
                    break;
                case 'br':
                    result = '  \n'; // Markdown line break
                    break;
                default:
                    // For other elements, process children
                    for (const child of element.childNodes) {
                        if (child.nodeType === Node.ELEMENT_NODE) {
                            result += processElement(child, indent);
                        } else if (child.nodeType === Node.TEXT_NODE) {
                            result += child.textContent;
                        }
                    }
                    break;
            }
            
            return result;
        };
        
        // Process all child elements
        for (const child of tempDiv.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
                markdown += processElement(child);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                markdown += child.textContent.trim() + '\n\n';
            }
        }
        
        // Clean up extra whitespace
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
        
        return markdown;
    }
    
    // Process inline elements within a container
    processInlineElements(container) {
        let result = '';
        
        for (const node of container.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                result += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                switch (node.tagName.toLowerCase()) {
                    case 'strong':
                    case 'b':
                        result += '**' + node.textContent + '**';
                        break;
                    case 'em':
                    case 'i':
                        result += '*' + node.textContent + '*';
                        break;
                    case 'code':
                        result += '`' + node.textContent + '`';
                        break;
                    case 'a':
                        const href = node.getAttribute('href') || '';
                        result += '[' + node.textContent + '](' + href + ')';
                        break;
                    case 'img':
                        const src = node.getAttribute('src') || '';
                        const alt = node.getAttribute('alt') || 'image';
                        result += '![' + alt + '](' + src + ')';
                        break;
                    case 'br':
                        result += '  \n';
                        break;
                    default:
                        result += node.textContent;
                        break;
                }
            }
        }
        
        return result;
    }
    
    // Process HTML table to Markdown
    processTable(table) {
        let markdown = '';
        const rows = Array.from(table.querySelectorAll('tr'));
        
        if (rows.length === 0) return '';
        
        // Process header row (assume first row is header)
        const headerRow = rows[0];
        const headerCells = Array.from(headerRow.querySelectorAll('th, td'));
        
        if (headerCells.length > 0) {
            markdown += '| ';
            headerCells.forEach(cell => {
                markdown += cell.textContent.trim().replace(/\|/g, '\\|') + ' | ';
            });
            markdown += '\n|';
            
            // Add separator row
            headerCells.forEach(() => {
                markdown += '----------|';
            });
            markdown += '\n';
            
            // Process remaining rows
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const cells = Array.from(row.querySelectorAll('td, th'));
                
                markdown += '| ';
                cells.forEach(cell => {
                    markdown += cell.textContent.trim().replace(/\|/g, '\\|') + ' | ';
                });
                markdown += '\n';
            }
        }
        
        return markdown + '\n';
    }
    
    saveFile() {
        // Get expanded content for saving (with full image data URLs)
        let content = this.editor.editor.value;
        if (this.editor.imageCollapse && this.editor.imageCollapse.getPreviewContent) {
            content = this.editor.imageCollapse.getPreviewContent();
        }
        
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = this.editor.currentFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.editor.lastSavedContent = content;
        this.editor.setModified(false);
        
        // Also save to localStorage
        this.editor.autoSave();
        
        // Show notification
        this.editor.showNotification(`File saved: ${this.editor.currentFileName}`, 'success');
    }
}

// Extend the main MarkdownEditor class with file operations
MarkdownEditor.prototype.newFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.newFile();
};

MarkdownEditor.prototype.openFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.openFile();
};

MarkdownEditor.prototype.handleFileOpen = function(event) {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.handleFileOpen(event);
};

MarkdownEditor.prototype.saveFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.saveFile();
};

MarkdownEditor.prototype.openWordFile = function() {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.openWordFile();
};

MarkdownEditor.prototype.handleWordFileOpen = function(event) {
    if (!this.fileOps) this.fileOps = new FileOperations(this);
    return this.fileOps.handleWordFileOpen(event);
};
