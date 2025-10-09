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
        this.wordFileInput = document.getElementById('wordFileInput');
        this.documentTitle = document.getElementById('documentTitle');
        
        this.currentFileName = 'Untitled.md';
        this.isModified = false;
        this.lastSavedContent = '';
        
        // Compact/Expand mode state
        this.isCompactMode = false;
        this.expandedContent = '';
        
        // Undo/Redo handled natively by browser - no custom implementation needed
        
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
            this.updateMermaidTheme();
            console.log('Mermaid initialized successfully');
        } else {
            console.error('Mermaid library not found');
        }
    }

    updateMermaidTheme() {
        if (typeof mermaid === 'undefined') return;

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        let mermaidConfig = {
            startOnLoad: false,
            theme: 'base',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis',
                padding: 20
            },
            sequence: {
                useMaxWidth: true,
                wrap: true,
                diagramMarginX: 20,
                diagramMarginY: 20,
                actorMargin: 80,
                width: 180,
                height: 65,
                boxMargin: 15,
                messageMargin: 45
            },
            gantt: {
                useMaxWidth: true,
                leftPadding: 80,
                gridLineStartPadding: 40,
                fontSize: 12,
                sectionFontSize: 14,
                numberSectionStyles: 4,
                axisFormat: '%Y-%m-%d'
            },
            journey: {
                useMaxWidth: true,
                diagramMarginX: 50,
                diagramMarginY: 20
            },
            class: {
                useMaxWidth: true,
                padding: 15
            },
            state: {
                useMaxWidth: true,
                padding: 15
            },
            er: {
                useMaxWidth: true,
                layoutDirection: 'TB',
                diagramPadding: 30,
                entityPadding: 20,
                fontSize: 14
            },
            pie: {
                useMaxWidth: true
            },
            git: {
                useMaxWidth: true
            },
            graph: {
                useMaxWidth: true,
                htmlLabels: true
            }
        };

        // Theme-specific colors
        if (currentTheme === 'dark') {
            mermaidConfig.themeVariables = {
                darkMode: true,
                background: '#1f2937',
                primaryColor: '#818cf8',
                primaryTextColor: '#f9fafb',
                primaryBorderColor: '#6366f1',
                lineColor: '#9ca3af',
                secondaryColor: '#374151',
                tertiaryColor: '#4b5563',
                mainBkg: '#374151',
                secondBkg: '#4b5563',
                tertiaryBkg: '#6b7280',
                nodeBorder: '#818cf8',
                clusterBkg: '#374151',
                clusterBorder: '#6366f1',
                defaultLinkColor: '#9ca3af',
                titleColor: '#f9fafb',
                edgeLabelBackground: '#374151',
                actorBorder: '#818cf8',
                actorBkg: '#4b5563',
                actorTextColor: '#f9fafb',
                actorLineColor: '#9ca3af',
                signalColor: '#f9fafb',
                signalTextColor: '#f9fafb',
                labelBoxBkgColor: '#4b5563',
                labelBoxBorderColor: '#818cf8',
                labelTextColor: '#f9fafb',
                loopTextColor: '#f9fafb',
                noteBorderColor: '#818cf8',
                noteBkgColor: '#374151',
                noteTextColor: '#f9fafb',
                activationBorderColor: '#6366f1',
                activationBkgColor: '#4b5563',
                sequenceNumberColor: '#1f2937',
                sectionBkgColor: '#4b5563',
                altSectionBkgColor: '#374151',
                sectionBkgColor2: '#6b7280',
                excludeBkgColor: '#6b7280',
                taskBorderColor: '#818cf8',
                taskBkgColor: '#4b5563',
                taskTextColor: '#f9fafb',
                activeTaskBorderColor: '#a78bfa',
                activeTaskBkgColor: '#6366f1',
                gridColor: '#6b7280',
                doneTaskBkgColor: '#10b981',
                doneTaskBorderColor: '#059669',
                critBorderColor: '#ef4444',
                critBkgColor: '#dc2626',
                todayLineColor: '#f59e0b',
                personBorder: '#818cf8',
                personBkg: '#4b5563'
            };
        } else if (currentTheme === 'gwyneth') {
            mermaidConfig.themeVariables = {
                darkMode: false,
                background: '#faf5ff',
                primaryColor: '#c7d2fe',
                primaryTextColor: '#1e293b',
                primaryBorderColor: '#a78bfa',
                lineColor: '#8e7cc3',
                secondaryColor: '#e9d5ff',
                tertiaryColor: '#f3e8ff',
                mainBkg: '#ddd6fe',
                secondBkg: '#ede9fe',
                tertiaryBkg: '#f3e8ff',
                nodeBorder: '#a78bfa',
                clusterBkg: '#f3e8ff',
                clusterBorder: '#c084fc',
                defaultLinkColor: '#8e7cc3',
                titleColor: '#1e293b',
                edgeLabelBackground: '#faf5ff',
                actorBorder: '#a78bfa',
                actorBkg: '#ddd6fe',
                actorTextColor: '#1e293b',
                actorLineColor: '#8e7cc3',
                signalColor: '#1e293b',
                signalTextColor: '#1e293b',
                labelBoxBkgColor: '#e9d5ff',
                labelBoxBorderColor: '#a78bfa',
                labelTextColor: '#1e293b',
                loopTextColor: '#1e293b',
                noteBorderColor: '#c084fc',
                noteBkgColor: '#f3e8ff',
                noteTextColor: '#1e293b',
                activationBorderColor: '#a78bfa',
                activationBkgColor: '#e9d5ff',
                sequenceNumberColor: '#ffffff',
                sectionBkgColor: '#e9d5ff',
                altSectionBkgColor: '#f3e8ff',
                sectionBkgColor2: '#ddd6fe',
                excludeBkgColor: '#f5f3ff',
                taskBorderColor: '#a78bfa',
                taskBkgColor: '#e9d5ff',
                taskTextColor: '#1e293b',
                activeTaskBorderColor: '#c084fc',
                activeTaskBkgColor: '#c7d2fe',
                gridColor: '#d8b4fe',
                doneTaskBkgColor: '#a7f3d0',
                doneTaskBorderColor: '#6ee7b7',
                critBorderColor: '#fda4af',
                critBkgColor: '#fecdd3',
                todayLineColor: '#fbbf24',
                personBorder: '#a78bfa',
                personBkg: '#e9d5ff'
            };
        } else {
            // Light theme
            mermaidConfig.themeVariables = {
                darkMode: false,
                background: '#ffffff',
                primaryColor: '#dbeafe',
                primaryTextColor: '#1e293b',
                primaryBorderColor: '#3b82f6',
                lineColor: '#64748b',
                secondaryColor: '#f1f5f9',
                tertiaryColor: '#f8fafc',
                mainBkg: '#bfdbfe',
                secondBkg: '#e0f2fe',
                tertiaryBkg: '#f0f9ff',
                nodeBorder: '#3b82f6',
                clusterBkg: '#f0f9ff',
                clusterBorder: '#60a5fa',
                defaultLinkColor: '#64748b',
                titleColor: '#0f172a',
                edgeLabelBackground: '#ffffff',
                actorBorder: '#3b82f6',
                actorBkg: '#bfdbfe',
                actorTextColor: '#1e293b',
                actorLineColor: '#64748b',
                signalColor: '#1e293b',
                signalTextColor: '#1e293b',
                labelBoxBkgColor: '#e0f2fe',
                labelBoxBorderColor: '#3b82f6',
                labelTextColor: '#1e293b',
                loopTextColor: '#1e293b',
                noteBorderColor: '#60a5fa',
                noteBkgColor: '#f0f9ff',
                noteTextColor: '#1e293b',
                activationBorderColor: '#3b82f6',
                activationBkgColor: '#dbeafe',
                sequenceNumberColor: '#ffffff',
                sectionBkgColor: '#e0f2fe',
                altSectionBkgColor: '#f0f9ff',
                sectionBkgColor2: '#bfdbfe',
                excludeBkgColor: '#f8fafc',
                taskBorderColor: '#3b82f6',
                taskBkgColor: '#dbeafe',
                taskTextColor: '#1e293b',
                activeTaskBorderColor: '#2563eb',
                activeTaskBkgColor: '#60a5fa',
                gridColor: '#cbd5e1',
                doneTaskBkgColor: '#86efac',
                doneTaskBorderColor: '#4ade80',
                critBorderColor: '#f87171',
                critBkgColor: '#fca5a5',
                todayLineColor: '#fbbf24',
                personBorder: '#3b82f6',
                personBkg: '#dbeafe'
            };
        }

        mermaid.initialize(mermaidConfig);
        console.log(`Mermaid theme updated to: ${currentTheme}`);
    }
    
    updatePreview() {
        try {
            // Check if marked.js is available
            if (typeof marked === 'undefined') {
                console.error('marked.js not loaded!');
                this.preview.innerHTML = '<div class="error">Marked.js library not loaded</div>';
                return;
            }
            
            // Get markdown content based on current mode
            let markdownText = this.editor.value;
            
            // Auto-detect escaped content even if not in compact mode
            const hasEscapedSequences = markdownText.includes('\\n') || markdownText.includes('\\"');
            
            // If in compact mode OR content has escaped sequences, unescape for preview
            if (this.isCompactMode || hasEscapedSequences) {
                markdownText = this.getLiveUnescapedContent();
            } else if (this.imageCollapse && this.imageCollapse.getPreviewContent) {
                markdownText = this.imageCollapse.getPreviewContent();
            }
            
            const html = marked.parse(markdownText);
            this.preview.innerHTML = html;
            
            // Re-apply syntax highlighting to new code blocks (but skip mermaid blocks)
            this.preview.querySelectorAll('pre code:not(.language-mermaid)').forEach((block) => {
                hljs.highlightElement(block);
            });
            
            // Render math equations with KaTeX
            this.renderMath();
            
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
            this.preview.innerHTML = '<div class="error">Error parsing markdown: ' + error.message + '</div>';
        }
    }
    
    renderMath() {
        // Render math equations using KaTeX
        if (typeof renderMathInElement !== 'undefined') {
            try {
                renderMathInElement(this.preview, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    trust: false,
                    strict: 'warn',
                    output: 'html',
                    fleqn: false,
                    macros: {
                        "\\text": "\\textrm"
                    }
                });
            } catch (error) {
                console.error('KaTeX rendering error:', error);
            }
        } else {
            console.warn('KaTeX not loaded yet');
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
        this.updateThemeIcon();
        
        // Initialize Mermaid with the correct theme
        this.updateMermaidTheme();
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        let newTheme;
        
        // Cycle through: light -> dark -> gwyneth -> light
        if (currentTheme === 'light') {
            newTheme = 'dark';
        } else if (currentTheme === 'dark') {
            newTheme = 'gwyneth';
        } else {
            newTheme = 'light';
        }
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('markdown-editor-theme', newTheme);
        this.updateThemeIcon();
        
        // Update Mermaid theme and force complete re-render of diagrams
        this.updateMermaidTheme();
        
        // Force complete regeneration of preview to apply new Mermaid theme
        setTimeout(() => {
            this.updatePreview();
        }, 100);
        
        // Show notification about theme
        const themeNames = {
            'light': 'Light Theme',
            'dark': 'Dark Theme',
            'gwyneth': 'Gwyneth Theme'
        };
        this.showNotification(`Switched to ${themeNames[newTheme]}`, 'info');
    }
    
    updateThemeIcon() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const themeBtn = document.getElementById('toggleTheme');
        
        if (!themeBtn) return;
        
        // Update icon based on theme
        let icon;
        if (currentTheme === 'light') {
            // Sun icon for light theme
            icon = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
            `;
        } else if (currentTheme === 'dark') {
            // Moon icon for dark theme
            icon = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            `;
        } else {
            // Stars icon for gwyneth theme
            icon = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            `;
        }
        
        themeBtn.innerHTML = icon;
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
        
        // Render math equations
        if (typeof renderMathInElement !== 'undefined') {
            try {
                renderMathInElement(tempContainer, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\[', right: '\\]', display: true},
                        {left: '\\(', right: '\\)', display: false}
                    ],
                    throwOnError: false,
                    errorColor: '#cc0000',
                    trust: false,
                    strict: 'warn',
                    output: 'html',
                    fleqn: false,
                    macros: {
                        "\\text": "\\textrm"
                    }
                });
            } catch (error) {
                console.error('KaTeX rendering error during export:', error);
            }
        }
        
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
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">
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
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">
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
        // Auto-save content, cursor position, and state changes
        if (this.storageManager) {
            this.storageManager.autoSave(
                this.currentFileName,
                this.editor.value,
                this.editor.selectionStart,
                this.isModified
            );
        }
    }
    
    // Replace current localStorage file (for new file or file loading)
    replaceLocalStorageFile() {
        if (this.storageManager) {
            this.storageManager.replaceCurrentFile(
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

This is a **powerful** markdown editor with live preview and compact/expand functionality.

## Features
- Real-time preview
- Syntax highlighting  
- File operations
- Dark/Light themes
- Format toolbar
- Auto-save to localStorage
- **Compact/Expand mode** for JSON string handling

## Compact/Expand Feature

Use the compact button (📝) to convert markdown to JSON-safe strings:

### Example Usage:
1. Write your markdown normally
2. Click compact to get: \`"# Title\\n\\nContent here"\`
3. Copy the escaped string for JSON use
4. Click expand to return to normal editing

### Code Example
\`\`\`javascript
function hello() {
    console.log('Hello, World!');
}
\`\`\`

> This is perfect for API payloads, configuration files, and prompt engineering!

**Your work is automatically saved to localStorage!**`;

        this.editor.value = welcomeContent;
        console.log('Loading welcome content for new user');
        
        // Force immediate preview update
        this.updatePreview();
        
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

    // JSON string utilities for compact mode
    escapeJsonString(str) {
        // Use JSON.stringify for proper escaping, then remove outer quotes
        return JSON.stringify(str).slice(1, -1);
    }

    unescapeJsonString(str) {
        try {
            // Use JSON.parse for proper unescaping by wrapping in quotes
            return JSON.parse('"' + str + '"');
        } catch (error) {
            // Fallback to manual unescaping if JSON.parse fails
            return str.replace(/\\n/g, '\n')
                      .replace(/\\r/g, '\r')
                      .replace(/\\t/g, '\t')
                      .replace(/\\"/g, '"')
                      .replace(/\\\//g, '/')
                      .replace(/\\\\/g, '\\');
        }
    }

    // Get live unescaped content for real-time preview 
    getLiveUnescapedContent() {
        let currentValue = this.editor.value.trim();
        
        // If empty, return stored expanded content or empty
        if (!currentValue) {
            return this.expandedContent || '';
        }
        
        // Check if content looks like it needs unescaping
        const needsUnescaping = currentValue.includes('\\n') || currentValue.includes('\\"') || 
                               (currentValue.startsWith('"') && currentValue.endsWith('"'));
        
        if (!needsUnescaping) {
            return currentValue;
        }
        
        try {
            // Remove surrounding quotes if present
            let valueToUnescape = currentValue;
            if (currentValue.startsWith('"') && currentValue.endsWith('"') && currentValue.length > 2) {
                valueToUnescape = currentValue.slice(1, -1);
            }
            
            // Try to unescape the current content
            const unescaped = this.unescapeJsonString(valueToUnescape);
            
            // Update stored expanded content with successful unescape (only if in compact mode)
            if (this.isCompactMode) {
                this.expandedContent = unescaped;
            }
            
            return unescaped;
            
        } catch (error) {
            // If unescaping fails, fall back to stored expanded content or original
            return this.expandedContent || currentValue;
        }
    }

    // Compact/Expand mode methods
    toggleCompactMode() {
        if (this.isCompactMode) {
            this.expandMode();
        } else {
            this.compactMode();
        }
        this.updateCompactModeUI();
    }

    compactMode() {
        // Store the current content as expanded content
        this.expandedContent = this.editor.value;
        
        // Convert to compact (single-line JSON-escaped) format
        const compactString = this.escapeJsonString(this.expandedContent);
        
        this.editor.value = `"${compactString}"`;
        this.isCompactMode = true;
        
        
        // Update preview to show the original markdown rendered
        this.updatePreview();
        this.updateStats();
        this.setModified(true);
    }

    expandMode() {
        let currentValue = this.editor.value;
        
        // If the content is wrapped in quotes, remove them and unescape
        if (currentValue.startsWith('"') && currentValue.endsWith('"')) {
            currentValue = currentValue.slice(1, -1);
            try {
                currentValue = this.unescapeJsonString(currentValue);
            } catch (error) {
                console.warn('Failed to unescape during expand, using stored content:', error);
                currentValue = this.expandedContent || currentValue;
            }
        }
        
        // Update the expanded content with current live content
        this.expandedContent = currentValue || this.expandedContent;
        
        // Restore the content
        this.editor.value = this.expandedContent;
        this.isCompactMode = false;
        
        // Update preview and stats
        this.updatePreview();
        this.updateStats();
        this.setModified(true);
        
        console.log('Switched to expand mode');
    }

    updateCompactModeUI() {
        const toggleBtn = document.getElementById('toggleCompact');
        const editorPane = document.querySelector('.editor-pane .pane-title');
        
        if (toggleBtn) {
            if (this.isCompactMode) {
                toggleBtn.title = 'Expand to Multi-line Mode';
                toggleBtn.classList.add('active');
                // Change icon to expand/unfold icon (arrows pointing outward)
                toggleBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="3 8 7 12 3 16"></polyline>
                        <polyline points="21 8 17 12 21 16"></polyline>
                        <line x1="11" y1="4" x2="13" y2="20"></line>
                    </svg>
                `;
            } else {
                toggleBtn.title = 'Compact to Single-line Mode';
                toggleBtn.classList.remove('active');
                // Change icon to compress/fold icon (arrows pointing inward)
                toggleBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="7 8 3 12 7 16"></polyline>
                        <polyline points="17 8 21 12 17 16"></polyline>
                        <line x1="11" y1="4" x2="13" y2="20"></line>
                    </svg>
                `;
            }
        }

        // Update editor pane title to indicate mode
        if (editorPane) {
            editorPane.textContent = this.isCompactMode ? 'Editor (Compact)' : 'Editor';
        }
    }

    // Detect if pasted content contains escaped strings and offer to unescape
    detectAndOfferUnescape() {
        const content = this.editor.value.trim();
        
        // Skip if in compact mode or content is too short
        if (this.isCompactMode || content.length < 10) return;
        
        // Check for escaped newlines (the main indicator)
        const hasEscapedNewlines = content.includes('\\n');
        
        // Check for other JSON escape sequences
        const hasEscapedQuotes = content.includes('\\"');
        const hasEscapedBackslashes = content.includes('\\\\');
        
        // More sophisticated check: content should look like it has multiple lines but all on one line
        const looksLikeSingleLineMarkdown = hasEscapedNewlines && !content.includes('\n');
        
        // Check if it starts with markdown-like content (after potential quote removal)
        const testContent = content.startsWith('"') ? content.slice(1) : content;
        const startsWithMarkdown = /^#\s+\w+|^\*\*\w+|^-\s+\w+/i.test(testContent);
        
        // Only show notification if it really looks like escaped markdown
        if (hasEscapedNewlines && (looksLikeSingleLineMarkdown || startsWithMarkdown || hasEscapedQuotes)) {
            this.showUnescapeNotification();
        }
    }

    showUnescapeNotification() {
        // Remove any existing unescape notification
        const existingNotification = document.querySelector('.unescape-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'unescape-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span>🔧 Escaped content detected! Would you like to unescape it?</span>
                <div class="notification-buttons">
                    <button class="btn btn-sm btn-primary" id="unescapeBtn">Unescape</button>
                    <button class="btn btn-sm" id="dismissUnescapeBtn">Dismiss</button>
                </div>
            </div>
        `;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10002;
            max-width: 350px;
            background-color: var(--bg-secondary);
            border: 2px solid var(--accent-color);
            box-shadow: var(--shadow-lg);
            opacity: 0;
            transform: translateY(-20px);
            transition: all 0.3s ease;
        `;

        // Add notification styles
        const style = document.createElement('style');
        style.textContent = `
            .unescape-notification .notification-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .unescape-notification .notification-buttons {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            .unescape-notification .btn {
                font-size: 12px;
                padding: 0.25rem 0.5rem;
            }
        `;
        document.head.appendChild(style);

        // Add to DOM
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Add event listeners
        document.getElementById('unescapeBtn').addEventListener('click', () => {
            this.unescapePastedContent();
            notification.remove();
            style.remove();
        });

        document.getElementById('dismissUnescapeBtn').addEventListener('click', () => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
        });

        // Auto-dismiss after 10 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-20px)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                        style.remove();
                    }
                }, 300);
            }
        }, 10000);
    }

    unescapePastedContent() {
        let content = this.editor.value;
        
        // Remove surrounding quotes if present
        if (content.startsWith('"') && content.endsWith('"')) {
            content = content.slice(1, -1);
        }
        
        // Unescape the content
        const unescapedContent = this.unescapeJsonString(content);
        
        // Update the editor
        this.editor.value = unescapedContent;
        
        // Update preview and stats
        this.updatePreview();
        this.updateStats();
        this.setModified(true);
        
        // Show success message
        this.showNotification('Content unescaped successfully! ✨', 'success');
        
        // Focus the editor
        this.editor.focus();
    }
    
    
    bindEvents() {
        // Basic editor events - specific handlers will be added by modules
        if (!this.editor) {
            console.error('Editor element not found!');
            return;
        }
        
        this.editor.addEventListener('input', () => {
            try {
                this.updatePreview();
                this.updateStats();
                this.setModified(true);
                
                // Auto-save content as user types (debounced)
                this.autoSave();
                
                // Refresh syntax highlighting if available
                if (this.syntaxHighlighter) {
                    this.syntaxHighlighter.debouncedHighlight();
                }
            } catch (error) {
                console.error('Error in input handler:', error);
                // Try to keep basic functionality working
                this.setModified(true);
            }
        });

        // Add paste event listener for auto-detection of escaped strings
        this.editor.addEventListener('paste', (e) => {
            setTimeout(() => {
                this.detectAndOfferUnescape();
            }, 100);
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
