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
        this.documentTitle = document.getElementById('documentTitle');
        
        this.currentFileName = 'Untitled.md';
        this.isModified = false;
        this.lastSavedContent = '';
        
        // Initialize storage manager
        this.storageManager = new LocalStorageManager();
        
        this.init();
    }
    
    init() {
        this.setupMarked();
        this.bindEvents();
        
        // Load saved file if available
        this.loadSavedFile();
        
        this.updatePreview();
        this.updateStats();
        this.updateCursorPosition();
        this.loadTheme();
        this.updateDocumentTitle();
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
        
        // Initialize Mermaid
        this.setupMermaid();
    }
    
    setupMermaid() {
        if (typeof mermaid !== 'undefined') {
            console.log('Initializing Mermaid...');
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                themeVariables: {
                    primaryColor: '#4f46e5',
                    primaryTextColor: '#1f2937',
                    primaryBorderColor: '#6366f1',
                    lineColor: '#6b7280',
                    secondaryColor: '#f3f4f6',
                    tertiaryColor: '#ffffff',
                    background: '#ffffff',
                    mainBkg: '#ffffff',
                    secondBkg: '#f9fafb',
                    tertiaryBkg: '#f3f4f6'
                },
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis'
                },
                sequence: {
                    useMaxWidth: true,
                    wrap: true
                },
                gantt: {
                    useMaxWidth: true
                },
                journey: {
                    useMaxWidth: true
                },
                // Ensure Graph TD syntax is properly supported
                graph: {
                    useMaxWidth: true,
                    htmlLabels: true
                }
            });
            console.log('Mermaid initialized successfully');
        } else {
            console.error('Mermaid library not found');
        }
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
            
            // Re-apply syntax highlighting to new code blocks (but skip mermaid blocks)
            this.preview.querySelectorAll('pre code:not(.language-mermaid)').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Process Mermaid diagrams with proper timing and retry logic
            setTimeout(() => {
                this.processMermaidDiagrams();
                // Retry if no blocks found initially (DOM timing issue)
                setTimeout(() => {
                    const blocks = this.preview.querySelectorAll('pre code.language-mermaid');
                    if (blocks.length > 0) {
                        console.log('Retrying Mermaid processing for any missed blocks');
                        this.processMermaidDiagrams();
                    }
                }, 100);
            }, 50);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            this.preview.innerHTML = '<div class="error">Error parsing markdown</div>';
        }
    }
    
    processMermaidDiagrams() {
        if (typeof mermaid === 'undefined') {
            console.warn('Mermaid is not loaded');
            return;
        }
        
        // Find all code blocks with mermaid language that haven't been processed yet
        const mermaidBlocks = this.preview.querySelectorAll('pre code.language-mermaid');
        console.log(`Found ${mermaidBlocks.length} Mermaid blocks to process`);
        
        if (mermaidBlocks.length === 0) {
            console.log('No Mermaid blocks found - checking if DOM is ready');
            return;
        }
        
        mermaidBlocks.forEach((block, index) => {
            try {
                let code = block.textContent.trim();
                
                // Clean and validate the code before processing
                code = this.sanitizeMermaidCode(code);
                
                if (!this.isValidMermaidCode(code)) {
                    console.warn(`Skipping invalid Mermaid diagram ${index + 1}`);
                    return;
                }
                
                console.log(`Processing Mermaid diagram ${index + 1}:`, code.substring(0, 50) + '...');
                
                const id = `mermaid-diagram-${index}-${Date.now()}`;
                
                // Create a div to hold the mermaid diagram
                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid-diagram';
                mermaidDiv.id = id;
                
                // Replace the code block with the mermaid div
                const preElement = block.closest('pre');
                if (preElement && preElement.parentNode) {
                    preElement.parentNode.replaceChild(mermaidDiv, preElement);
                    
                    // Render the mermaid diagram
                    mermaid.render(id + '-svg', code).then(({ svg, bindFunctions }) => {
                        console.log(`Successfully rendered Mermaid diagram ${index + 1}`);
                        mermaidDiv.innerHTML = svg;
                        if (bindFunctions) {
                            bindFunctions(mermaidDiv);
                        }
                    }).catch(error => {
                        console.error('Mermaid rendering error:', error);
                        mermaidDiv.innerHTML = `<div class="mermaid-error">
                            <p><strong>Mermaid Diagram Error:</strong></p>
                            <pre>${error.message}</pre>
                            <details>
                                <summary>Show diagram code</summary>
                                <pre><code>${code}</code></pre>
                            </details>
                        </div>`;
                    });
                } else {
                    console.error('Could not find parent pre element for Mermaid block');
                }
            } catch (error) {
                console.error('Mermaid processing error:', error);
            }
        });
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
        this.updateDocumentTitle();
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
        const app = document.querySelector('.app');
        
        // Check if we're already in fullscreen mode
        if (app.classList.contains('fullscreen-mode')) {
            // Exit fullscreen mode
            this.exitFullscreenMode();
        } else {
            // Enter fullscreen mode
            this.enterFullscreenMode();
        }
    }
    
    enterFullscreenMode() {
        const app = document.querySelector('.app');
        const toolbar = document.querySelector('.toolbar');
        const statusBar = document.querySelector('.status-bar');
        const formatToolbar = document.querySelector('.format-toolbar');
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');
        const divider = document.querySelector('.pane-divider');
        
        // Add fullscreen class
        app.classList.add('fullscreen-mode');
        
        // Hide toolbar, status bar, and format toolbar
        toolbar.style.display = 'none';
        statusBar.style.display = 'none';
        formatToolbar.style.display = 'none';
        divider.style.display = 'none';
        
        // Create and add mode toggle button
        this.createModeToggleButton();
        
        // Start in preview mode
        this.currentFullscreenMode = 'preview';
        this.switchFullscreenMode('preview');
    }
    
    exitFullscreenMode() {
        const app = document.querySelector('.app');
        const toolbar = document.querySelector('.toolbar');
        const statusBar = document.querySelector('.status-bar');
        const formatToolbar = document.querySelector('.format-toolbar');
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');
        const divider = document.querySelector('.pane-divider');
        
        // Remove fullscreen class
        app.classList.remove('fullscreen-mode');
        
        // Show toolbar, status bar, and format toolbar
        toolbar.style.display = 'flex';
        statusBar.style.display = 'flex';
        formatToolbar.style.display = 'flex';
        divider.style.display = 'block';
        
        // Remove mode toggle button with smooth animation
        const modeToggle = document.querySelector('.fullscreen-mode-toggle');
        if (modeToggle) {
            modeToggle.classList.add('exiting');
            setTimeout(() => {
                if (modeToggle.parentNode) {
                    modeToggle.remove();
                }
            }, 300);
        }
        
        // Restore normal dual pane view
        editorPane.style.display = 'flex';
        previewPane.style.display = 'flex';
        editorPane.style.flex = '1';
        previewPane.style.flex = '1';
        
        // Reset current mode
        this.currentFullscreenMode = null;
    }
    
    createModeToggleButton() {
        // Remove existing button if present
        const existingButton = document.querySelector('.fullscreen-mode-toggle');
        if (existingButton) {
            existingButton.remove();
        }
        
        const modeToggle = document.createElement('div');
        modeToggle.className = 'fullscreen-mode-toggle';
        modeToggle.innerHTML = `
            <button class="btn btn-icon mode-btn" id="editModeBtn" title="Edit Mode">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
            </button>
            <button class="btn btn-icon mode-btn active" id="previewModeBtn" title="Preview Mode">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </button>
            <button class="btn btn-icon" id="exitFullscreenBtn" title="Exit Fullscreen">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"></path>
                </svg>
            </button>
        `;
        
        document.body.appendChild(modeToggle);
        
        // Add event listeners
        document.getElementById('editModeBtn').addEventListener('click', () => {
            this.switchFullscreenMode('edit');
        });
        
        document.getElementById('previewModeBtn').addEventListener('click', () => {
            this.switchFullscreenMode('preview');
        });
        
        document.getElementById('exitFullscreenBtn').addEventListener('click', () => {
            this.exitFullscreenMode();
        });
    }
    
    switchFullscreenMode(mode) {
        const editorPane = document.querySelector('.editor-pane');
        const previewPane = document.querySelector('.preview-pane');
        const editBtn = document.getElementById('editModeBtn');
        const previewBtn = document.getElementById('previewModeBtn');
        
        this.currentFullscreenMode = mode;
        
        if (mode === 'edit') {
            // Show only editor
            editorPane.style.display = 'flex';
            previewPane.style.display = 'none';
            editorPane.style.flex = '1 1 100%';
            
            // Update button states
            editBtn.classList.add('active');
            previewBtn.classList.remove('active');
            
            // Focus the editor
            this.editor.focus();
        } else {
            // Show only preview
            editorPane.style.display = 'none';
            previewPane.style.display = 'flex';
            previewPane.style.flex = '1 1 100%';
            
            // Update button states
            previewBtn.classList.add('active');
            editBtn.classList.remove('active');
        }
    }
    
    async copyHtml() {
        try {
            // Get the processed HTML with Mermaid diagrams rendered
            const processedHtml = await this.getProcessedHtml();
            
            navigator.clipboard.writeText(processedHtml).then(() => {
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
    
    async getProcessedHtml() {
        // Create a temporary container to process the HTML
        const tempContainer = document.createElement('div');
        
        // Use expanded content for processing if images are collapsed
        let markdownText = this.editor.value;
        if (this.imageCollapse && this.imageCollapse.getPreviewContent) {
            markdownText = this.imageCollapse.getPreviewContent();
        }
        
        const html = marked.parse(markdownText);
        tempContainer.innerHTML = html;
        
        // Apply syntax highlighting
        tempContainer.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
        
        // Process Mermaid diagrams
        await this.processMermaidDiagramsForExport(tempContainer);
        
        return tempContainer.innerHTML;
    }
    
    async processMermaidDiagramsForExport(container) {
        if (typeof mermaid === 'undefined') return;
        
        // Find all code blocks with mermaid language
        const mermaidBlocks = container.querySelectorAll('pre code.language-mermaid');
        
        // Process each mermaid block
        const promises = Array.from(mermaidBlocks).map(async (block, index) => {
            try {
                let code = block.textContent.trim();
                
                // Clean the code using the same sanitization
                code = this.sanitizeMermaidCode(code);
                
                if (!this.isValidMermaidCode(code)) {
                    console.warn(`Skipping invalid Mermaid diagram ${index + 1} during export`);
                    return;
                }
                
                const id = `mermaid-export-${index}-${Date.now()}`;
                
                // Create a div to hold the mermaid diagram
                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid-diagram';
                mermaidDiv.id = id;
                
                // Replace the code block with the mermaid div
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.parentNode.replaceChild(mermaidDiv, preElement);
                    
                    try {
                        // Render the mermaid diagram
                        const { svg } = await mermaid.render(id + '-svg', code);
                        // Clean up the SVG for export (remove any script tags for security)
                        const cleanedSvg = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
                        mermaidDiv.innerHTML = cleanedSvg;
                    } catch (error) {
                        console.error('Mermaid rendering error:', error);
                        mermaidDiv.innerHTML = `<div class="mermaid-error">
                            <p><strong>Mermaid Diagram Error:</strong> ${error.message}</p>
                            <pre><code>${code}</code></pre>
                        </div>`;
                    }
                }
            } catch (error) {
                console.error('Mermaid processing error:', error);
            }
        });
        
        // Wait for all diagrams to be processed
        await Promise.all(promises);
    }
    
    sanitizeMermaidCode(code) {
        // Clean up common issues that cause Mermaid parsing errors
        
        // Remove any stray HTML that might have leaked in
        code = code.replace(/<script[\s\S]*?<\/script>/gi, '');
        code = code.replace(/<style[\s\S]*?<\/style>/gi, '');
        
        // Handle problematic template-like syntax
        code = code.replace(/\{\{[^}]*\}\}/g, '');
        
        // Clean up any malformed quotes or brackets
        code = code.replace(/[""]([^""]*)[""]/g, '"$1"');
        
        // Remove extra whitespace and normalize line endings
        code = code.replace(/\r\n/g, '\n');
        code = code.replace(/\s+$/gm, '');
        
        return code.trim();
    }
    
    isValidMermaidCode(code) {
        if (!code || code.length < 5) return false;
        
        // Check for basic Mermaid diagram types
        const validStartPatterns = [
            /^\s*graph\s+(TD|TB|BT|RL|LR)/i,
            /^\s*flowchart\s+(TD|TB|BT|RL|LR)/i,
            /^\s*sequenceDiagram/i,
            /^\s*classDiagram/i,
            /^\s*stateDiagram/i,
            /^\s*journey/i,
            /^\s*gantt/i,
            /^\s*pie/i,
            /^\s*gitgraph/i,
            /^\s*erDiagram/i,
            /^\s*mindmap/i
        ];
        
        const hasValidStart = validStartPatterns.some(pattern => pattern.test(code));
        if (!hasValidStart) {
            console.warn('Mermaid code does not start with a recognized diagram type:', code.substring(0, 50));
            return false;
        }
        
        // Check for obviously malformed syntax
        const problematicPatterns = [
            /\{\{.*\}\}/,  // Template syntax
            /<\/?\w+[^>]*>/,  // HTML tags (except in quotes)
            /[^\w\s\[\](){}<>|:;.,=+\-*/_"'`~!@#$%^&?\\]/  // Unexpected characters
        ];
        
        // Only flag as invalid if problematic patterns exist outside of quoted strings
        const quotedStrings = code.match(/"[^"]*"/g) || [];
        let codeWithoutQuotes = code;
        quotedStrings.forEach(quote => {
            codeWithoutQuotes = codeWithoutQuotes.replace(quote, '');
        });
        
        const hasProblematicSyntax = problematicPatterns.some(pattern => pattern.test(codeWithoutQuotes));
        if (hasProblematicSyntax) {
            console.warn('Mermaid code contains potentially problematic syntax');
        }
        
        return true; // Let Mermaid handle the detailed validation
    }
    
    async printFile() {
        try {
            // Get the current theme for proper styling
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            
            // Get the processed HTML with Mermaid diagrams rendered
            const html = await this.getProcessedHtml();
            
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
        /* Mermaid diagram styles for print */
        .mermaid-diagram {
            margin: 1.5rem 0;
            padding: 1rem;
            background-color: #ffffff;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            text-align: center;
            page-break-inside: avoid;
        }
        
        .mermaid-diagram svg {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        
        .mermaid-error {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            padding: 1rem;
            margin: 1rem 0;
            color: #dc2626;
            page-break-inside: avoid;
        }
        
        .mermaid-error p {
            margin: 0 0 0.5rem 0;
            font-weight: 600;
        }
        
        .mermaid-error pre {
            background-color: rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(0, 0, 0, 0.1);
            font-size: 0.8rem;
            margin: 0.5rem 0;
        }
        
        @media print {
            body { margin: 0; padding: 15px; }
            a[href]:after { content: " (" attr(href) ")"; }
            pre, blockquote { page-break-inside: avoid; }
            h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
            .mermaid-diagram { page-break-inside: avoid; }
            .mermaid-error { page-break-inside: avoid; }
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
    
    async exportToPdf() {
        try {
            // Get the processed HTML with Mermaid diagrams rendered
            const html = await this.getProcessedHtml();
            
            // Create a new window for PDF export
            const pdfWindow = window.open('', '_blank');
            
            // Generate filename for PDF
            const pdfFileName = this.currentFileName.replace(/\.[^/.]+$/, "") + '.pdf';
            
            // Create the PDF document with enhanced styling for PDF output
            const pdfContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${pdfFileName}</title>
    <style>
        @page {
            margin: 0.75in;
            size: A4;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            font-size: 12pt;
        }
        .pdf-header {
            margin-bottom: 2em;
            border-bottom: 2px solid #333;
            padding-bottom: 0.5em;
        }
        .pdf-header h1 {
            margin: 0;
            font-size: 1.8em;
            font-weight: 600;
        }
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.8em;
            font-weight: 600;
            line-height: 1.25;
            page-break-after: avoid;
        }
        h1 { font-size: 1.6em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
        h2 { font-size: 1.4em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
        h3 { font-size: 1.2em; }
        h4 { font-size: 1.1em; }
        h5 { font-size: 1em; font-weight: 700; }
        h6 { font-size: 0.95em; color: #666; font-weight: 700; }
        p { 
            margin-bottom: 1em; 
            orphans: 2;
            widows: 2;
        }
        blockquote {
            margin: 1em 0;
            padding: 0 1em;
            color: #666;
            border-left: 0.25em solid #dfe2e5;
            page-break-inside: avoid;
        }
        ul, ol {
            padding-left: 1.5em;
            margin-bottom: 1em;
        }
        li { 
            margin-bottom: 0.3em;
            page-break-inside: avoid;
        }
        code {
            padding: 0.1em 0.3em;
            margin: 0;
            font-size: 0.9em;
            background-color: #f6f8fa;
            border-radius: 3px;
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        }
        pre {
            padding: 1em;
            overflow: visible;
            font-size: 0.85em;
            line-height: 1.4;
            background-color: #f6f8fa;
            border-radius: 6px;
            margin-bottom: 1em;
            page-break-inside: avoid;
            border: 1px solid #e1e4e8;
        }
        pre code {
            display: block;
            padding: 0;
            margin: 0;
            background-color: transparent;
            border: 0;
            font-size: inherit;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        table {
            border-spacing: 0;
            border-collapse: collapse;
            margin-bottom: 1em;
            width: 100%;
            page-break-inside: avoid;
        }
        table th, table td {
            padding: 0.4em 0.8em;
            border: 1px solid #dfe2e5;
            font-size: 0.9em;
        }
        table th {
            font-weight: 600;
            background-color: #f6f8fa;
        }
        table tr:nth-child(2n) {
            background-color: #f9f9f9;
        }
        img {
            max-width: 100%;
            height: auto;
            box-sizing: content-box;
            page-break-inside: avoid;
        }
        a {
            color: #0366d6;
            text-decoration: none;
        }
        a:after {
            content: " (" attr(href) ")";
            font-size: 0.8em;
            color: #666;
        }
        hr {
            height: 0.2em;
            padding: 0;
            margin: 1.5em 0;
            background-color: #e1e4e8;
            border: 0;
            page-break-after: avoid;
        }
        .page-break {
            page-break-before: always;
        }
        
        /* Mermaid diagram styles for PDF */
        .mermaid-diagram {
            margin: 1.5rem 0;
            padding: 1rem;
            background-color: #ffffff;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            text-align: center;
            page-break-inside: avoid;
        }
        
        .mermaid-diagram svg {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 0 auto;
        }
        
        .mermaid-error {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 6px;
            padding: 1rem;
            margin: 1rem 0;
            color: #dc2626;
            page-break-inside: avoid;
        }
        
        .mermaid-error p {
            margin: 0 0 0.5rem 0;
            font-weight: 600;
        }
        
        .mermaid-error pre {
            background-color: rgba(0, 0, 0, 0.05);
            border: 1px solid rgba(0, 0, 0, 0.1);
            font-size: 0.8rem;
            margin: 0.5rem 0;
        }
    </style>
</head>
<body>
    <div class="pdf-header">
        <h1>${this.currentFileName}</h1>
    </div>
    ${html}
    <script>
        // Auto-print to PDF when page loads
        window.onload = function() {
            setTimeout(() => {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>`;
            
            pdfWindow.document.write(pdfContent);
            pdfWindow.document.close();
            
            // Show success feedback
            const btn = document.getElementById('exportToPdf');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"></polyline></svg>';
            btn.classList.add('success');
            btn.title = 'PDF export dialog opened';
            
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.classList.remove('success');
                btn.title = 'Export to PDF';
            }, 2000);
            
        } catch (error) {
            console.error('PDF export error:', error);
            alert('Failed to export to PDF');
        }
    }
    
    handleTitleChange() {
        const newTitle = this.documentTitle.value.trim();
        this.currentFileName = newTitle || 'Untitled.md';
        this.fileName.textContent = this.currentFileName;
        this.updateDocumentTitle();
    }

    validateAndFormatTitle() {
        let title = this.documentTitle.value.trim();
        
        // If empty, set to default
        if (!title) {
            title = 'Untitled.md';
        } else if (!title.toLowerCase().endsWith('.md')) {
            // Add .md extension if not present
            title = title + '.md';
        }
        
        // Update the input field and internal state
        this.documentTitle.value = title;
        this.currentFileName = title;
        this.fileName.textContent = this.currentFileName;
        this.updateDocumentTitle();
    }

    updateDocumentTitle() {
        // Update the browser tab title
        const baseTitle = this.currentFileName === 'Untitled.md' ? 'Markdown Editor' : this.currentFileName;
        document.title = this.isModified ? `${baseTitle} • (Modified)` : baseTitle;
    }

    setDocumentTitle(fileName) {
        // Method to programmatically set the document title (used by file operations)
        this.currentFileName = fileName;
        this.documentTitle.value = fileName;
        this.fileName.textContent = fileName;
        this.updateDocumentTitle();
        
        // Save the file name change
        this.autoSave();
    }
    
    // localStorage integration methods
    autoSave() {
        if (this.storageManager) {
            this.storageManager.autoSave(
                this.currentFileName,
                this.editor.value,
                this.editor.selectionStart,
                this.isModified
            );
        }
    }
    
    loadSavedFile() {
        if (!this.storageManager) return;
        
        const savedFile = this.storageManager.getCurrentFile();
        if (savedFile) {
            console.log('Loading saved file:', savedFile.name);
            
            // Restore file content and state
            this.editor.value = savedFile.content || '';
            this.currentFileName = savedFile.name || 'Untitled.md';
            this.documentTitle.value = this.currentFileName;
            this.fileName.textContent = this.currentFileName;
            this.setModified(savedFile.isModified || false);
            
            // Restore cursor position
            if (savedFile.cursorPosition) {
                setTimeout(() => {
                    this.editor.setSelectionRange(savedFile.cursorPosition, savedFile.cursorPosition);
                    this.editor.focus();
                }, 100);
            }
            
            // Show restoration notification
            this.showNotification(`Restored: ${savedFile.name}`, 'info');
        } else {
            // No saved file, show welcome content
            this.loadWelcomeContent();
        }
    }
    
    loadWelcomeContent() {
        // Load default welcome content
        const welcomeContent = `# Welcome to Markdown Editor

This is a **powerful** markdown editor with live preview.

## Features
- Real-time preview
- Syntax highlighting  
- File operations
- Dark/Light themes
- Format toolbar
- Auto-save to localStorage
- Fullscreen editing mode

### Code Example
\`\`\`javascript
function hello() {
    console.log('Hello, World!');
}
\`\`\`

### Mermaid Diagram Example
\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> E[Fix issues]
    E --> B
    C --> F[Deploy]
    F --> G[End]
\`\`\`

> This is a blockquote

- List item 1
- List item 2
- List item 3

[Link](https://example.com) | ![Image](https://via.placeholder.com/150)

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

**Your work is automatically saved to localStorage!**`;

        this.editor.value = welcomeContent;
        console.log('Loading welcome content for new user');
        
        // Save welcome content to localStorage
        this.autoSave();
    }
    
    // Manual save to localStorage (for explicit save actions)
    saveToLocalStorage() {
        if (this.storageManager) {
            const success = this.storageManager.saveCurrentFile(
                this.currentFileName,
                this.editor.value,
                this.editor.selectionStart,
                this.isModified
            );
            
            if (success) {
                this.showNotification('Saved to local storage', 'success');
                return true;
            } else {
                this.showNotification('Failed to save to local storage', 'error');
                return false;
            }
        }
        return false;
    }
    
    // Get storage information
    getStorageInfo() {
        return this.storageManager ? this.storageManager.getStorageInfo() : null;
    }
    
    // Notification system
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            bottom: 80px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10001;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: var(--shadow-lg);
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s ease;
        `;
        
        // Set colors based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = 'var(--success-color)';
                notification.style.color = 'white';
                break;
            case 'error':
                notification.style.backgroundColor = 'var(--danger-color)';
                notification.style.color = 'white';
                break;
            case 'warning':
                notification.style.backgroundColor = 'var(--warning-color)';
                notification.style.color = 'white';
                break;
            default: // info
                notification.style.backgroundColor = 'var(--accent-color)';
                notification.style.color = 'white';
                break;
        }
        
        // Add to DOM
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
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
            
            // Auto-save to localStorage
            this.autoSave();
            
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
            // Save cursor position for restoration
            this.autoSave();
        });
        
        this.editor.addEventListener('click', () => {
            this.updateCursorPosition();
            // Save cursor position for restoration
            this.autoSave();
        });

        // Document title events
        this.documentTitle.addEventListener('input', () => {
            this.handleTitleChange();
        });

        this.documentTitle.addEventListener('blur', () => {
            this.validateAndFormatTitle();
            // Save file name change
            this.autoSave();
        });

        this.documentTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.documentTitle.blur();
            }
        });
    }
}
