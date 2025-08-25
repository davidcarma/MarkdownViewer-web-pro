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
        
        // Initialize Mermaid
        this.setupMermaid();
    }
    
    setupMermaid() {
        if (typeof mermaid !== 'undefined') {
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
                    htmlLabels: true
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
                }
            });
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
            
            // Re-apply syntax highlighting to new code blocks
            this.preview.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Process Mermaid diagrams
            this.processMermaidDiagrams();
        } catch (error) {
            console.error('Markdown parsing error:', error);
            this.preview.innerHTML = '<div class="error">Error parsing markdown</div>';
        }
    }
    
    processMermaidDiagrams() {
        if (typeof mermaid === 'undefined') return;
        
        // Find all code blocks with mermaid language
        const mermaidBlocks = this.preview.querySelectorAll('pre code.language-mermaid');
        
        mermaidBlocks.forEach((block, index) => {
            try {
                const code = block.textContent;
                const id = `mermaid-diagram-${index}-${Date.now()}`;
                
                // Create a div to hold the mermaid diagram
                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid-diagram';
                mermaidDiv.id = id;
                
                // Replace the code block with the mermaid div
                const preElement = block.closest('pre');
                if (preElement) {
                    preElement.parentNode.replaceChild(mermaidDiv, preElement);
                    
                    // Render the mermaid diagram
                    mermaid.render(id + '-svg', code).then(({ svg, bindFunctions }) => {
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
                const code = block.textContent;
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
