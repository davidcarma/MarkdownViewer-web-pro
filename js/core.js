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
        
        // Initialize storage managers
        this.storageManager = new LocalStorageManager();
        this.indexedDBManager = new IndexedDBManager();

        // ═══════════════════════════════════════════════════════════════════
        // SCROLL SYNC STATE (clean rewrite - minimal state, single code path)
        // ═══════════════════════════════════════════════════════════════════
        
        // Content-based scroll mapping: [{ line: number, top: number }]
        this._scrollMap = null;
        
        // Which pane currently "owns" the scroll (the user is actively scrolling it)
        // null = no active scroll, 'editor' or 'preview' = that pane is driving
        this._scrollOwner = null;
        this._scrollOwnerTimeout = null;
        
        // Single pending RAF for scroll sync (prevents multiple queued syncs)
        this._scrollRAF = null;
        
        // Guard against programmatic scroll triggering re-sync
        this._ignoringScrollUntil = 0;
        
        // Saved anchor for restoring scroll position after re-render
        this._savedScrollAnchor = null;
        
        // Track when user is actively typing (to suppress scroll sync)
        this._lastInputAt = 0;

        // Expose a promise so other modules can reliably run after content restore.
        this.ready = this.init();
    }

    _escapeRegex(str) {
        return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCROLL SYNC - CLEAN BIDIRECTIONAL IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Design principles:
    // 1. Single "owner" model - whichever pane the user is scrolling owns sync
    // 2. Content-based mapping via line markers (no percentage fallback)
    // 3. Dead-zone threshold prevents micro-corrections / jitter
    // 4. Edge snapping at top/bottom for clean behavior at boundaries
    // 5. Single RAF-throttled execution prevents race conditions
    //
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Get the editor's computed line height in pixels
     */
    _getEditorLineHeight() {
        try {
            const style = getComputedStyle(this.editor);
            const lh = parseFloat(style.lineHeight);
            if (Number.isFinite(lh) && lh > 0) return lh;
            const fs = parseFloat(style.fontSize) || 14;
            return fs * 1.4;
        } catch {
            return 20;
        }
    }

    /**
     * Get the current top line in the editor (fractional for smooth mapping)
     */
    _getEditorScrollLine() {
        const lh = this._getEditorLineHeight();
        return 1 + this.editor.scrollTop / lh;
    }

    /**
     * Line markers disabled - they were breaking code fences and mermaid blocks.
     * Using simple line-ratio sync instead which doesn't need markers.
     */
    _injectLineMarkers(markdown) {
        // Return unchanged - markers caused parsing issues with code blocks
        return markdown;
    }

    /**
     * Build the scroll map from preview DOM markers.
     * Creates array of { line, top } sorted by line number.
     */
    _buildScrollMap() {
        if (!this.preview) return;
        
        const markers = this.preview.querySelectorAll('.src-line-marker[data-line]');
        if (markers.length === 0) {
            this._scrollMap = null;
            return;
        }

        const map = [];
        for (const marker of markers) {
            const line = parseInt(marker.dataset.line, 10);
            if (Number.isFinite(line)) {
                map.push({ line, top: marker.offsetTop });
            }
        }

        map.sort((a, b) => a.line - b.line);
        this._scrollMap = map;
    }

    /**
     * Interpolate: given an editor line number, find the preview scrollTop
     */
    _lineToPreviewTop(line) {
        const map = this._scrollMap;
        if (!map || map.length < 2) return null;

        // Clamp to bounds
        if (line <= map[0].line) return map[0].top;
        if (line >= map[map.length - 1].line) return map[map.length - 1].top;

        // Binary search for bracketing entries
        let lo = 0, hi = map.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (map[mid].line < line) lo = mid + 1;
            else hi = mid;
        }

        const upper = map[lo];
        const lower = map[Math.max(0, lo - 1)];
        
        // Linear interpolation between the two markers
        const ratio = (line - lower.line) / Math.max(1, upper.line - lower.line);
        return lower.top + ratio * (upper.top - lower.top);
    }

    /**
     * Interpolate: given a preview scrollTop, find the editor line number
     */
    _previewTopToLine(scrollTop) {
        const map = this._scrollMap;
        if (!map || map.length < 2) return null;

        // Clamp to bounds
        if (scrollTop <= map[0].top) return map[0].line;
        if (scrollTop >= map[map.length - 1].top) return map[map.length - 1].line;

        // Binary search for bracketing entries
        let lo = 0, hi = map.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (map[mid].top < scrollTop) lo = mid + 1;
            else hi = mid;
        }

        const upper = map[lo];
        const lower = map[Math.max(0, lo - 1)];
        
        // Linear interpolation between the two markers
        const ratio = (scrollTop - lower.top) / Math.max(1, upper.top - lower.top);
        return lower.line + ratio * (upper.line - lower.line);
    }

    /**
     * Called when user scrolls the editor. Syncs preview to match.
     * ONE-WAY SYNC: Editor drives preview. Preview scrolling is independent.
     */
    _onScroll(source) {
        // Only sync when editor scrolls - preview scrolling is independent
        if (source !== 'editor') return;
        
        const now = Date.now();

        // If we're in the ignore window (programmatic scroll), skip
        if (now < this._ignoringScrollUntil) return;
        
        // If user is actively typing, don't sync
        if (now - this._lastInputAt < 200) return;

        // Schedule sync on next frame (if not already scheduled)
        if (this._scrollRAF) return;
        
        this._scrollRAF = requestAnimationFrame(() => {
            this._scrollRAF = null;
            this._performSync();
        });
    }

    /**
     * Execute scroll synchronization: Editor → Preview (one-way)
     * 
     * LINE-RATIO approach:
     * - Calculate which LINE is at top of editor
     * Uses data-line attributes from markdown-it for accurate content sync.
     * Falls back to line-ratio if no data-line elements are found.
     */
    _performSync() {
        if (!this.editor || !this.preview) return;

        const previewMax = Math.max(1, this.preview.scrollHeight - this.preview.clientHeight);
        
        // ─────────────────────────────────────────────────────────────────
        // Calculate which LINE is at top of editor viewport
        // ─────────────────────────────────────────────────────────────────
        const lineHeight = this._getEditorLineHeight();
        const topLine = Math.floor(this.editor.scrollTop / lineHeight) + 1;  // 1-based
        const totalLines = Math.max(1, (this.editor.value || '').split('\n').length);
        
        // Line ratio for edge detection and fallback
        const lineRatio = Math.max(0, Math.min(1, (topLine - 1) / Math.max(1, totalLines - 1)));

        // ─────────────────────────────────────────────────────────────────
        // EDGE SNAPPING: At top or bottom, snap cleanly
        // ─────────────────────────────────────────────────────────────────
        if (lineRatio < 0.01) {
            if (this.preview.scrollTop > 2) {
                this._setScrollWithIgnore(this.preview, 0);
            }
            return;
        }

        if (lineRatio > 0.99) {
            if (this.preview.scrollTop < previewMax - 2) {
                this._setScrollWithIgnore(this.preview, previewMax);
            }
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // CONTENT-BASED SYNC using data-line attributes
        // ─────────────────────────────────────────────────────────────────
        let targetScrollTop = null;
        
        // Find all elements with data-line attributes
        const lineElements = this.preview.querySelectorAll('[data-line]');
        
        if (lineElements.length > 0) {
            // Build a sorted array of { line, top } for binary search
            const lineMap = [];
            for (const el of lineElements) {
                const line = parseInt(el.getAttribute('data-line'), 10);
                if (Number.isFinite(line)) {
                    lineMap.push({ line, top: el.offsetTop });
                }
            }
            lineMap.sort((a, b) => a.line - b.line);
            
            if (lineMap.length >= 2) {
                // Find bracketing elements and interpolate
                let lower = lineMap[0];
                let upper = lineMap[lineMap.length - 1];
                
                for (let i = 0; i < lineMap.length - 1; i++) {
                    if (lineMap[i].line <= topLine && lineMap[i + 1].line > topLine) {
                        lower = lineMap[i];
                        upper = lineMap[i + 1];
                        break;
                    }
                }
                
                // Interpolate between the two elements
                const lineDiff = upper.line - lower.line;
                const topDiff = upper.top - lower.top;
                const progress = lineDiff > 0 ? (topLine - lower.line) / lineDiff : 0;
                targetScrollTop = lower.top + (progress * topDiff);
            } else if (lineMap.length === 1) {
                targetScrollTop = lineMap[0].top;
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // FALLBACK: Line ratio if no data-line elements found
        // ─────────────────────────────────────────────────────────────────
        if (targetScrollTop == null) {
            targetScrollTop = lineRatio * previewMax;
        }

        // Clamp to valid range
        targetScrollTop = Math.max(0, Math.min(previewMax, targetScrollTop));

        // ─────────────────────────────────────────────────────────────────
        // DEAD ZONE: Skip tiny adjustments to prevent jitter
        // ─────────────────────────────────────────────────────────────────
        const DEAD_ZONE = 5;
        const delta = Math.abs(this.preview.scrollTop - targetScrollTop);
        if (delta < DEAD_ZONE) return;

        // Apply the scroll
        this._setScrollWithIgnore(this.preview, targetScrollTop);
    }

    /**
     * Set scrollTop on an element and ignore scroll events briefly
     */
    _setScrollWithIgnore(element, scrollTop) {
        this._ignoringScrollUntil = Date.now() + 50;
        element.scrollTop = Math.max(0, Math.round(scrollTop));
    }

    /**
     * Capture current scroll position for restoration after re-render
     */
    _captureScrollAnchor() {
        const source = this._scrollOwner || 'editor';
        this._savedScrollAnchor = {
            source,
            editorLine: this._getEditorScrollLine(),
            previewTop: this.preview ? this.preview.scrollTop : 0
        };
    }

    /**
     * Restore scroll position after preview re-render
     */
    _restoreScrollAnchor() {
        const anchor = this._savedScrollAnchor;
        if (!anchor) return;
        this._savedScrollAnchor = null;

        // Wait for layout to settle
        requestAnimationFrame(() => {
            this._ignoringScrollUntil = Date.now() + 100;

            if (this._scrollMap && this._scrollMap.length >= 2 && anchor.editorLine) {
                // Use content-based restoration
                const previewTop = this._lineToPreviewTop(anchor.editorLine);
                if (previewTop != null && this.preview) {
                    this.preview.scrollTop = previewTop;
                }
            } else if (anchor.source === 'preview' && this.preview) {
                // Fallback: restore raw preview position
                this.preview.scrollTop = anchor.previewTop;
            }
        });
    }

    // Legacy method name for compatibility
    _rebuildScrollMap() {
        this._buildScrollMap();
    }

    /**
     * Reset scroll sync state - call this after loading a new document
     * to ensure scroll sync works immediately without needing to type first.
     * Also scrolls both panes to the top.
     */
    resetScrollState() {
        this._scrollOwner = null;
        this._ignoringScrollUntil = 0;
        this._lastInputAt = 0;
        if (this._scrollOwnerTimeout) {
            clearTimeout(this._scrollOwnerTimeout);
            this._scrollOwnerTimeout = null;
        }
        if (this._scrollRAF) {
            cancelAnimationFrame(this._scrollRAF);
            this._scrollRAF = null;
        }
        
        // Scroll both panes to the top
        if (this.editor) this.editor.scrollTop = 0;
        if (this.preview) this.preview.scrollTop = 0;
        
        // Rebuild scroll map after a short delay to let DOM settle
        setTimeout(() => {
            this._buildScrollMap();
        }, 100);
    }
    
    async init() {
        this.setupMarked();
        this.bindEvents();
        
        // Initialize IndexedDB
        if (this.indexedDBManager) {
            await this.indexedDBManager.init();
        }
        
        // Load saved file if available
        await this.loadSavedFile();
        
        this.updatePreview();
        this.updateStats();
        this.updateCursorPosition();
        this.loadTheme();
        this.updateDocumentTitle();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    extractMermaidBlocks(markdownText) {
        // Extract all mermaid code blocks from the markdown before processing
        // Pattern matches: ```mermaid\n<code>\n```
        const mermaidPattern = /```mermaid\n([\s\S]*?)\n```/g;
        let match;
        let index = 0;
        
        while ((match = mermaidPattern.exec(markdownText)) !== null) {
            const code = match[1];
            const cacheKey = `mermaid_block_${index}`;
            this.mermaidCodeCache.set(cacheKey, code);
            console.log(`📦 Cached mermaid block ${index}:`, code.substring(0, 100) + (code.length > 100 ? '...' : ''));
            console.log(`   Contains <br/>: ${code.includes('<br/>')}`);
            index++;
        }
        
        console.log(`✅ Extracted ${index} mermaid blocks from markdown`);
        if (index === 0) {
            console.warn('⚠️ No mermaid blocks found! Checking markdown format...');
            const hasMermaid = markdownText.includes('```mermaid');
            console.log(`   Markdown contains \`\`\`mermaid: ${hasMermaid}`);
            if (hasMermaid) {
                console.log('   First 200 chars of markdown:', markdownText.substring(0, 200));
            }
        }
    }
    
    setupMarked() {
        // Try markdown-it first (has source line support), fallback to marked.js
        if (typeof markdownit !== 'undefined') {
            this.setupMarkdownIt();
            return;
        }
        
        // Fallback to marked.js
        if (typeof marked === 'undefined') {
            console.error('No markdown parser loaded - delaying setupMarked()');
            this.preview.innerHTML = '<div class="error">Markdown library not loaded</div>';
            this._markedRetryCount = (this._markedRetryCount || 0) + 1;
            if (this._markedRetryCount <= 20) {
                setTimeout(() => this.setupMarked(), 50);
            }
            return;
        }

        console.log('Using marked.js (fallback)');
        this.useMarkdownIt = false;
        
        // Store original mermaid code blocks before marked.js processing
        this.mermaidCodeCache = new Map();
        
        // Configure custom renderer to make all links open in new tab
        const renderer = new marked.Renderer();
        
        // Override link rendering to add target="_blank" and security attributes
        renderer.link = function(href, title, text) {
            const link = marked.Renderer.prototype.link.call(this, href, title, text);
            return link.replace('<a', '<a target="_blank" rel="noopener noreferrer"');
        };
        
        // Configure marked.js
        marked.setOptions({
            renderer: renderer,
            highlight: (code, lang) => {
                if (typeof hljs === 'undefined') return code;
                if (lang && hljs.getLanguage && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.error('Highlight.js error:', err);
                    }
                }
                try {
                    return hljs.highlightAuto ? hljs.highlightAuto(code).value : code;
                } catch (err) {
                    return code;
                }
            },
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        
        this.setupMermaid();
    }
    
    /**
     * Setup markdown-it with source line tracking for accurate scroll sync.
     * Each rendered element gets a data-line attribute with its source line number.
     */
    setupMarkdownIt() {
        console.log('Using markdown-it with source line tracking');
        this.useMarkdownIt = true;
        this.mermaidCodeCache = new Map();
        
        // Create markdown-it instance with common options
        this.md = markdownit({
            html: true,
            breaks: true,
            linkify: true,
            typographer: false,
            highlight: (code, lang) => {
                if (typeof hljs === 'undefined') return '';
                if (lang && hljs.getLanguage && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {}
                }
                try {
                    return hljs.highlightAuto ? hljs.highlightAuto(code).value : '';
                } catch (err) {
                    return '';
                }
            }
        });
        
        // Add source line tracking to tokens
        // markdown-it tokens have a 'map' property: [startLine, endLine]
        this._addSourceLinePlugin();
        
        // Make links open in new tab
        const defaultLinkRender = this.md.renderer.rules.link_open || 
            function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
        
        this.md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
            tokens[idx].attrSet('target', '_blank');
            tokens[idx].attrSet('rel', 'noopener noreferrer');
            return defaultLinkRender(tokens, idx, options, env, self);
        };
        
        this.setupMermaid();
    }
    
    /**
     * Plugin to add data-line attributes to rendered HTML elements.
     * This enables accurate scroll sync between editor and preview.
     */
    _addSourceLinePlugin() {
        const md = this.md;
        
        // Helper to inject line number into opening tag
        const injectLineAttr = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            if (token.map && token.map.length >= 1) {
                // map[0] is the starting line (0-based), add 1 for 1-based
                token.attrSet('data-line', token.map[0] + 1);
            }
            return self.renderToken(tokens, idx, options);
        };
        
        // Override renderers for block elements to add data-line
        const blockElements = [
            'paragraph_open', 'heading_open', 'blockquote_open',
            'bullet_list_open', 'ordered_list_open', 'list_item_open',
            'code_block', 'fence', 'table_open', 'hr'
        ];
        
        for (const rule of blockElements) {
            const defaultRender = md.renderer.rules[rule] || 
                function(tokens, idx, options, env, self) {
                    return self.renderToken(tokens, idx, options);
                };
            
            md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
                const token = tokens[idx];
                if (token.map && token.map.length >= 1) {
                    token.attrSet('data-line', token.map[0] + 1);
                }
                return defaultRender(tokens, idx, options, env, self);
            };
        }
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
                // High-contrast dark palette (avoid "bright on bright" labels)
                background: '#0b1220',
                mainBkg: '#0f172a',
                secondBkg: '#111827',
                tertiaryBkg: '#1f2937',
                primaryColor: '#111827',
                secondaryColor: '#0f172a',
                tertiaryColor: '#1f2937',
                primaryBorderColor: '#60a5fa',
                nodeBorder: '#60a5fa',
                lineColor: '#94a3b8',
                defaultLinkColor: '#94a3b8',
                gridColor: '#334155',

                // Global text colors (Mermaid uses these broadly; missing them can yield black text)
                textColor: '#e5e7eb',
                primaryTextColor: '#e5e7eb',
                labelColor: '#e5e7eb',
                labelTextColor: '#e5e7eb',
                nodeTextColor: '#e5e7eb',
                clusterTextColor: '#e5e7eb',
                titleColor: '#e5e7eb',

                // Clusters / labels
                clusterBkg: '#0f172a',
                clusterBorder: '#334155',
                edgeLabelBackground: '#111827',
                labelBoxBkgColor: '#111827',
                labelBoxBorderColor: '#334155',

                // Sequence diagrams
                actorBorder: '#60a5fa',
                actorBkg: '#111827',
                actorTextColor: '#e5e7eb',
                actorLineColor: '#94a3b8',
                signalColor: '#e5e7eb',
                signalTextColor: '#e5e7eb',
                loopTextColor: '#e5e7eb',
                noteBorderColor: '#60a5fa',
                noteBkgColor: '#111827',
                noteTextColor: '#e5e7eb',
                activationBorderColor: '#60a5fa',
                activationBkgColor: '#1f2937',
                sequenceNumberColor: '#e5e7eb',
                sectionBkgColor: '#111827',
                altSectionBkgColor: '#0f172a',
                sectionBkgColor2: '#1f2937',
                excludeBkgColor: '#1f2937',

                // Gantt / journey task colors
                taskBorderColor: '#60a5fa',
                taskBkgColor: '#111827',
                taskTextColor: '#e5e7eb',
                activeTaskBorderColor: '#a78bfa',
                activeTaskBkgColor: '#1f2937',
                doneTaskBkgColor: '#065f46',
                doneTaskBorderColor: '#10b981',
                critBorderColor: '#ef4444',
                critBkgColor: '#7f1d1d',
                todayLineColor: '#fbbf24',

                // ER / misc
                personBorder: '#60a5fa',
                personBkg: '#111827'
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
            // Clear old mermaid cache entries and extract new ones
            if (this.mermaidCodeCache) {
                this.mermaidCodeCache.clear();
            }
            
            // Check if marked.js is available
            if (typeof marked === 'undefined') {
                console.error('marked.js not loaded!');
                this.preview.innerHTML = '<div class="error">Marked.js library not loaded</div>';
                return;
            }
            
            // Get markdown content based on current mode.
            // IMPORTANT: Do NOT treat any `\\n` inside a normal multi-line document as "escaped mode".
            // Large docs often contain `\\n` sequences inside code blocks, and auto-unescaping breaks
            // rendering (including collapsed image placeholders).
            const rawText = this.editor.value;

            const shouldUnescapeForPreview = () => {
                if (this.isCompactMode) return true;
                const trimmed = (rawText || '').trim();
                if (!trimmed) return false;
                const hasEscapedNewlines = trimmed.includes('\\n');
                const hasActualNewlines = trimmed.includes('\n');
                const wrappedInQuotes = trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2;
                // Only unescape if it really looks like a JSON-escaped *whole document*.
                return wrappedInQuotes || (hasEscapedNewlines && !hasActualNewlines);
            };

            let markdownText;
            if (shouldUnescapeForPreview()) {
                markdownText = this.getLiveUnescapedContent();
            } else if (this.imageCollapse && this.imageCollapse.getPreviewContent) {
                // Prefer imageCollapse expansion so placeholders never become network URLs.
                markdownText = this.imageCollapse.getPreviewContent();
            } else {
                markdownText = rawText;
            }

            // Extract and cache mermaid code blocks BEFORE parsing
            this.extractMermaidBlocks(markdownText);
            
            let html = '';
            try {
                // Pause scroll sync while we update the preview to prevent jumping
                this._ignoringScrollUntil = Date.now() + 150;
                
                // Use markdown-it if available (has source line tracking)
                if (this.useMarkdownIt && this.md) {
                    html = this.md.render(markdownText);
                } else if (typeof marked !== 'undefined') {
                    html = marked.parse(markdownText);
                } else {
                    throw new Error('No markdown parser available');
                }
            } catch (e) {
                console.error('Markdown parsing error:', e);
                this.preview.innerHTML =
                    '<div class="error">' +
                    '<strong>Error parsing markdown</strong>' +
                    `<pre style="white-space: pre-wrap; margin-top: .75rem;">${this.escapeHtml(String(e && e.message ? e.message : e))}</pre>` +
                    '</div>';
                return; // Contain failure: keep the rest of the app alive
            }
            this.preview.innerHTML = html;
            this._rebuildScrollMap();
            
            // Re-apply syntax highlighting to new code blocks (but skip mermaid blocks)
            if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
                this.preview.querySelectorAll('pre code:not(.language-mermaid)').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
            
            // Render math equations with KaTeX (non-fatal)
            try {
                this.renderMath();
            } catch (e) {
                console.warn('Math render failed (non-fatal):', e);
            }
            
            // Process Mermaid diagrams with proper timing and retry logic (non-fatal)
            setTimeout(() => {
                try {
                    this.processMermaidDiagrams();
                } catch (e) {
                    console.warn('Mermaid processing failed (non-fatal):', e);
                }
                // Retry if no blocks found initially (DOM timing issue)
                setTimeout(() => {
                    try {
                        const blocks = this.preview.querySelectorAll('pre code.language-mermaid');
                        if (blocks.length > 0) {
                            console.log('Retrying Mermaid processing for any missed blocks');
                            this.processMermaidDiagrams();
                        }
                    } catch (e) {
                        console.warn('Mermaid retry failed (non-fatal):', e);
                    }

                    // Mermaid rendering can change layout heights; refresh scroll map after it settles.
                    setTimeout(() => {
                        this._rebuildScrollMap();
                    }, 50);
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
                let code;
                
                // Try to get the original code from cache first (by index)
                const cacheKey = `mermaid_block_${index}`;
                if (this.mermaidCodeCache.has(cacheKey)) {
                    code = this.mermaidCodeCache.get(cacheKey);
                    console.log(`Using cached mermaid code for block ${index}`);
                } else {
                    // Fallback to textContent if cache is not available
                    code = block.textContent.trim();
                    console.log(`No cache found for block ${index}, using textContent`);
                }
                
                // Clean and validate the code before processing
                code = this.sanitizeMermaidCode(code);
                
                if (!this.isValidMermaidCode(code)) {
                    console.warn(`Skipping invalid Mermaid diagram ${index + 1}`);
                    return;
                }
                
                console.log(`Processing Mermaid diagram ${index + 1}:`, code.substring(0, 50) + '...');
                console.log(`🎨 Rendering Mermaid with code (first 200 chars):`, code.substring(0, 200));
                console.log(`   Code length: ${code.length}, Has <br/>: ${code.includes('<br/>')}`);
                
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
                        const errorMsg = this.escapeHtml(error.message || error.toString());
                        const errorCode = this.escapeHtml(code);
                        mermaidDiv.innerHTML = `<div class="mermaid-error" style="display: block; margin: 1rem 0; padding: 1rem; background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px;">
                            <p style="margin: 0 0 0.5rem 0;"><strong>❌ Mermaid Diagram Error</strong></p>
                            <div style="background: white; padding: 0.75rem; border-radius: 4px; margin: 0.5rem 0; font-family: monospace; font-size: 0.9em; white-space: pre-wrap; word-break: break-word; user-select: all; cursor: text;">${errorMsg}</div>
                            <details style="margin-top: 1rem;">
                                <summary style="cursor: pointer; font-weight: 600; color: #dc2626;">📋 Show diagram code (click to expand)</summary>
                                <pre style="margin-top: 0.5rem; background: white; padding: 0.75rem; border-radius: 4px; overflow-x: auto; user-select: all;"><code>${errorCode}</code></pre>
                            </details>
                            <p style="margin-top: 1rem; margin-bottom: 0;">
                                <a href="https://mermaid.live/edit" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: 600;">
                                    🔧 Test &amp; Fix in Mermaid Live Editor
                                </a>
                                <br><small style="color: #666; display: block; margin-top: 0.5rem;">💡 Tip: Enclose labels with special characters (like →, •, parentheses) in double quotes</small>
                            </p>
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
    
    syncScroll(source = 'editor') {
        this._onScroll(source);
    }
    
    setModified(modified) {
        this.isModified = modified;
        this.fileStatus.textContent = modified ? '●' : '';
        this.fileStatus.className = modified ? 'file-status' : 'file-status saved';
        this.updateDocumentTitle();
        
        // Update LED indicator - unsaved (orange) vs saved (green)
        const led = document.getElementById('saveLed');
        if (led) {
            if (modified) {
                led.classList.add('unsaved');
            } else {
                led.classList.remove('unsaved');
            }
        }
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
        
        // Extract mermaid blocks before processing (for export)
        this.extractMermaidBlocks(markdownText);
        
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
                let code;
                
                // Try to get the original code from cache first (by index)
                const cacheKey = `mermaid_block_${index}`;
                if (this.mermaidCodeCache.has(cacheKey)) {
                    code = this.mermaidCodeCache.get(cacheKey);
                } else {
                    // Fallback to textContent if cache is not available
                    code = block.textContent.trim();
                }
                
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
                        console.error('Mermaid rendering error during export:', error);
                        const errorMsg = this.escapeHtml(error.message || error.toString());
                        const errorCode = this.escapeHtml(code);
                        mermaidDiv.innerHTML = `<div class="mermaid-error">
                            <p><strong>Mermaid Diagram Error:</strong> ${errorMsg}</p>
                            <pre><code>${errorCode}</code></pre>
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
        // Minimal sanitizer - only fix what we KNOW needs fixing
        // Let Mermaid's own parser handle everything else
        
        // 1. Security: Remove dangerous HTML/scripts
        code = code.replace(/<script[\s\S]*?<\/script>/gi, '');
        code = code.replace(/<style[\s\S]*?<\/style>/gi, '');
        
        // 2. Compatibility: Mermaid requires <br> not <br/>
        code = code.replace(/<br\s*\/>/gi, '<br>');
        
        // 3. Fix unescaped double braces in node labels (common AI hallucination)
        // Looks for [Text {{val}}] and converts to ["Text {{val}}"] to prevent parsing as shape
        // Only applies if the content doesn't already contain quotes to avoid breaking complex strings
        code = code.replace(/\[([^"\]]*?\{\{.*?\}\}[^"\]]*?)\]/g, '["$1"]');
        
        // 4. Fix unescaped parentheses in node labels
        // Looks for [Text (val)] and converts to ["Text (val)"]
        code = code.replace(/\[([^"\]]*?\(.*?\)[^"\]]*?)\]/g, '["$1"]');
        
        // 5. Normalize whitespace
        code = code.replace(/\r\n/g, '\n');
        code = code.trim();
        
        return code;
    }
    
    isValidMermaidCode(code) {
        // Minimal validation - let Mermaid's parser do the heavy lifting
        if (!code || code.length < 5) return false;
        
        // Check for basic Mermaid diagram types
        const validStartPatterns = [
            /^\s*graph\s+/i,
            /^\s*flowchart\s+/i,
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
        
        return validStartPatterns.some(pattern => pattern.test(code));
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
    <link rel="stylesheet" href="katex.min.css">
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
    <link rel="stylesheet" href="katex.min.css">
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
    async autoSave() {
        // Auto-save content, cursor position, and state changes
        // Save to localStorage for backward compatibility
        // Avoid writing very large documents (especially base64 images) to localStorage,
        // which causes "quota exceeded" warnings. IndexedDB handles large content.
        const content = this.editor?.value || '';
        const tooLargeForLocalStorage = content.length > 200_000 || content.includes('data:image/');

        if (this.storageManager && !tooLargeForLocalStorage) {
            this.storageManager.autoSave(
                this.currentFileName,
                content,
                this.editor.selectionStart,
                this.isModified
            );
        }
        
        // Also save to IndexedDB (debounced)
        if (this.fileBrowser && this.indexedDBManager && this.indexedDBManager.isSupported) {
            // Debounce IndexedDB saves to avoid too frequent writes
            if (this.indexedDBSaveTimeout) {
                clearTimeout(this.indexedDBSaveTimeout);
            }
            this.indexedDBSaveTimeout = setTimeout(async () => {
                try {
                    await this.fileBrowser.saveCurrentFile();
                } catch (error) {
                    console.warn('Failed to auto-save to IndexedDB:', error);
                }
            }, 1000); // Wait 1 second after last change
        }
    }
    
    // Replace current localStorage file (for new file or file loading)
    replaceLocalStorageFile() {
        const content = this.editor?.value || '';
        const tooLargeForLocalStorage = content.length > 200_000 || content.includes('data:image/');

        if (this.storageManager && !tooLargeForLocalStorage) {
            this.storageManager.replaceCurrentFile(
                this.currentFileName,
                content,
                this.editor.selectionStart,
                this.isModified
            );
        }
    }
    
    async migrateLocalStorageToIndexedDB(clearLocalStorage = false) {
        // Check if migration has already been done (unless forced)
        const migrationFlag = localStorage.getItem('markdown-editor-migrated-to-indexeddb');
        if (migrationFlag === 'true' && !clearLocalStorage) {
            console.log('ℹ️ Migration already completed, skipping...');
            return { migrated: 0, skipped: 0, cleared: false };
        }
        
        if (!this.indexedDBManager || !this.indexedDBManager.isSupported) {
            console.log('ℹ️ IndexedDB not available, skipping migration');
            return { migrated: 0, skipped: 0, cleared: false };
        }
        
        if (!this.storageManager) {
            return { migrated: 0, skipped: 0, cleared: false };
        }
        
        try {
            // Get all files from localStorage
            const localStorageData = this.storageManager.getAllData();
            if (!localStorageData || !localStorageData.files) {
                console.log('ℹ️ No files in localStorage to migrate');
                // Mark migration as done even if no files
                localStorage.setItem('markdown-editor-migrated-to-indexeddb', 'true');
                return { migrated: 0, skipped: 0, cleared: false };
            }
            
            const files = Object.values(localStorageData.files);
            if (files.length === 0) {
                console.log('ℹ️ No files in localStorage to migrate');
                localStorage.setItem('markdown-editor-migrated-to-indexeddb', 'true');
                return { migrated: 0, skipped: 0, cleared: false };
            }
            
            console.log(`🔄 Migrating ${files.length} file(s) from localStorage to IndexedDB...`);
            
            let migratedCount = 0;
            let skippedCount = 0;
            
            // Migrate each file to IndexedDB
            for (const file of files) {
                try {
                    // Check if file already exists in IndexedDB
                    const existingFile = await this.indexedDBManager.getFile(file.id);
                    
                    if (existingFile) {
                        // File already exists, skip or update if localStorage is newer
                        const localStorageDate = new Date(file.modified || file.created || 0);
                        const indexedDBDate = new Date(existingFile.modified || existingFile.created || 0);
                        
                        if (localStorageDate > indexedDBDate) {
                            // localStorage version is newer, update IndexedDB
                            await this.indexedDBManager.saveFile(file);
                            migratedCount++;
                            console.log(`  ✅ Updated: ${file.name}`);
                        } else {
                            skippedCount++;
                            console.log(`  ⏭️ Skipped (already exists): ${file.name}`);
                        }
                    } else {
                        // File doesn't exist in IndexedDB, migrate it
                        await this.indexedDBManager.saveFile(file);
                        migratedCount++;
                        console.log(`  ✅ Migrated: ${file.name}`);
                    }
                } catch (error) {
                    console.error(`  ❌ Failed to migrate ${file.name}:`, error);
                }
            }
            
            console.log(`✅ Migration complete: ${migratedCount} migrated, ${skippedCount} skipped`);
            
            // Mark migration as complete
            localStorage.setItem('markdown-editor-migrated-to-indexeddb', 'true');
            
            // Clear localStorage if requested (after processing all files)
            let cleared = false;
            if (clearLocalStorage && files.length > 0) {
                try {
                    this.storageManager.clearAllData();
                    cleared = true;
                    console.log('🗑️ localStorage cleared after migration');
                } catch (error) {
                    console.error('Failed to clear localStorage:', error);
                }
            }
            
            if (migratedCount > 0 || (cleared && files.length > 0)) {
                const message = cleared 
                    ? `Migrated ${migratedCount} file(s) to IndexedDB and cleared localStorage (${files.length} total processed)`
                    : `Migrated ${migratedCount} file(s) to IndexedDB`;
                this.showNotification(message, 'success');
            }
            
            return { migrated: migratedCount, skipped: skippedCount, cleared };
        } catch (error) {
            console.error('❌ Migration failed:', error);
            this.showNotification('Migration from localStorage failed', 'error');
            return { migrated: 0, skipped: 0, cleared: false };
        }
    }
    
    /**
     * Manually trigger migration and optionally clear localStorage
     * @param {boolean} clearLocalStorage - If true, clears localStorage after migration
     * @returns {Promise<Object>} Migration result with counts
     */
    async migrateAndCleanup(clearLocalStorage = true) {
        // Reset migration flag to force migration
        localStorage.removeItem('markdown-editor-migrated-to-indexeddb');
        return await this.migrateLocalStorageToIndexedDB(clearLocalStorage);
    }
    
    async loadSavedFile() {
        // Backward compatibility:
        // - DO NOT delete legacy localStorage data automatically (annoying and can break older docs).
        // - Migrate localStorage files to IndexedDB, but keep localStorage as a backup by default.
        // - If there is a legacy `markdown-editor-image-store`, attempt to migrate it to IndexedDB images store.
        await this.migrateLegacyImageStoreToIndexedDB();
        await this.migrateLocalStorageToIndexedDB(false);
        
        // Try to load from IndexedDB first (preferred)
        if (this.indexedDBManager && this.indexedDBManager.isSupported) {
            try {
                const files = await this.indexedDBManager.getAllFiles();
                if (files.length > 0) {
                    // Load the most recently modified file
                    const sortedFiles = [...files].sort((a, b) => {
                        const dateA = new Date(a.modified || a.created || 0);
                        const dateB = new Date(b.modified || b.created || 0);
                        return dateB - dateA;
                    });
                    
                    const savedFile = sortedFiles[0];
                    console.log('✅ Found saved file in IndexedDB:', savedFile.name);
                    
                    this.editor.value = savedFile.content || '';
                    this.currentFileName = savedFile.name || 'Untitled.md';
                    this.documentTitle.value = this.currentFileName;
                    this.fileName.textContent = this.currentFileName;
                    this.lastSavedContent = savedFile.content || '';
                    this.setModified(false);
                    
                    // Restore cursor position
                    if (savedFile.cursorPosition) {
                        setTimeout(() => {
                            this.editor.setSelectionRange(savedFile.cursorPosition, savedFile.cursorPosition);
                            this.editor.focus();
                        }, 100);
                    }
                    
                    this.showNotification(`Restored: ${savedFile.name}`, 'info');
                    
                    // Reset scroll state so scroll sync works immediately
                    this.resetScrollState();
                    return;
                }
            } catch (error) {
                console.warn('Failed to load from IndexedDB, trying localStorage:', error);
            }
        }
        
        // Fallback to localStorage (for backward compatibility)
        if (this.storageManager) {
            console.log('🔍 Checking for saved file in localStorage...');
            const savedFile = this.storageManager.getCurrentFile();
            
            if (savedFile) {
                console.log('✅ Found saved file:', savedFile.name);
                
                this.editor.value = savedFile.content || '';
                this.currentFileName = savedFile.name || 'Untitled.md';
                this.documentTitle.value = this.currentFileName;
                this.fileName.textContent = this.currentFileName;
                this.setModified(savedFile.isModified || false);
                
                if (savedFile.cursorPosition) {
                    setTimeout(() => {
                        this.editor.setSelectionRange(savedFile.cursorPosition, savedFile.cursorPosition);
                        this.editor.focus();
                    }, 100);
                }
                
                this.showNotification(`Restored: ${savedFile.name}`, 'info');
                
                // Reset scroll state so scroll sync works immediately
                this.resetScrollState();
                return;
            }
        }
        
        console.log('ℹ️ No saved file found, loading welcome content');
        this.loadWelcomeContent();
        
        // Reset scroll state for welcome content too
        this.resetScrollState();
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
                // Flash LED instead of notification
                if (this.storageManager && this.storageManager.showAutoSaveIndicator) {
                    this.storageManager.showAutoSaveIndicator();
                }
                return true;
            } else {
                // Keep error notification - user needs to know about failures
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

    async exportData() {
        try {
            const buildInfo = (typeof BUILD_INFO !== 'undefined') ? BUILD_INFO : null;
            const localData = this.storageManager ? this.storageManager.getAllData() : null;

            let files = [];
            let images = [];
            if (this.indexedDBManager && this.indexedDBManager.isSupported) {
                files = await this.indexedDBManager.getAllFiles();
                if (typeof this.indexedDBManager.getAllImages === 'function') {
                    images = await this.indexedDBManager.getAllImages();
                }
            }

            const payload = {
                schema: 'markdown-pro-backup',
                schemaVersion: 1,
                exportedAt: new Date().toISOString(),
                origin: window.location.origin,
                build: buildInfo,
                localStorage: localData,
                indexedDB: {
                    files,
                    images
                }
            };

            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const a = document.createElement('a');
            a.href = url;
            a.download = `markdown-pro-backup-${stamp}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Backup exported', 'success');
        } catch (e) {
            console.error('Export failed:', e);
            this.showNotification('Export failed (see console)', 'error');
        }
    }

    async importData(file) {
        try {
            if (!file) return;
            const text = await file.text();
            const payload = JSON.parse(text);

            if (!payload || payload.schema !== 'markdown-pro-backup') {
                this.showNotification('Invalid backup file', 'error');
                return;
            }

            if (!confirm('Importing a backup will merge/overwrite saved browser data. Continue?')) {
                return;
            }

            // Restore localStorage data (non-destructive merge: we replace the root object)
            if (this.storageManager && payload.localStorage) {
                this.storageManager.saveAllData(payload.localStorage);
            }

            // Restore IndexedDB files/images
            if (this.indexedDBManager && this.indexedDBManager.isSupported && payload.indexedDB) {
                const files = Array.isArray(payload.indexedDB.files) ? payload.indexedDB.files : [];
                for (const f of files) {
                    if (!f || !f.id) continue;
                    await this.indexedDBManager.saveFile({
                        ...f,
                        // ensure minimal required fields
                        id: f.id,
                        name: f.name || 'Untitled.md',
                        content: f.content || ''
                    });
                }

                const images = Array.isArray(payload.indexedDB.images) ? payload.indexedDB.images : [];
                for (const img of images) {
                    if (!img || !img.id || !img.dataUrl) continue;
                    await this.indexedDBManager.saveImage({
                        id: img.id,
                        alt: img.alt || '',
                        dataUrl: img.dataUrl,
                        fullMarkdown: img.fullMarkdown || `![${img.alt || ''}](${img.dataUrl})`,
                        created: img.created
                    });
                }
            }

            // Reload most recent file
            await this.loadSavedFile();
            this.updatePreview();
            this.updateStats();
            this.showNotification('Backup imported', 'success');
        } catch (e) {
            console.error('Import failed:', e);
            this.showNotification('Import failed (see console)', 'error');
        }
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

    /**
     * Migrate legacy image store from localStorage (if present) into IndexedDB images store.
     * This prevents older documents that contain `...IMG_...` placeholders from becoming unreadable
     * after upgrades. This is best-effort and intentionally non-destructive (we keep localStorage).
     */
    async migrateLegacyImageStoreToIndexedDB() {
        try {
            if (!this.indexedDBManager || !this.indexedDBManager.isSupported) return;
            if (typeof localStorage === 'undefined') return;

            const raw = localStorage.getItem('markdown-editor-image-store');
            if (!raw) return;

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (_) {
                // Unknown format or corrupted; keep it as-is.
                return;
            }

            // Support a few common shapes:
            // - { IMG_...: { id, alt, dataUrl, fullMarkdown } , ... }
            // - { images: { ... } }
            // - [ [id, {..}], [id, {..}] ] (Map entries)
            let entries = [];
            if (Array.isArray(parsed)) {
                entries = parsed;
            } else if (parsed && typeof parsed === 'object') {
                const obj = parsed.images && typeof parsed.images === 'object' ? parsed.images : parsed;
                entries = Object.entries(obj);
            }

            let migrated = 0;
            for (const [id, value] of entries) {
                const v = value && typeof value === 'object' ? value : null;
                const imageId = (v && v.id) ? v.id : id;
                const dataUrl = v && typeof v.dataUrl === 'string' ? v.dataUrl : null;
                if (!imageId || !dataUrl) continue;

                const alt = (v && typeof v.alt === 'string') ? v.alt : '';
                const fullMarkdown =
                    (v && typeof v.fullMarkdown === 'string')
                        ? v.fullMarkdown
                        : `![${alt}](${dataUrl})`;

                await this.indexedDBManager.saveImage({
                    id: imageId,
                    alt,
                    dataUrl,
                    fullMarkdown
                });
                migrated++;
            }

            if (migrated > 0) {
                console.log(`✅ Migrated ${migrated} legacy image(s) from localStorage to IndexedDB`);
            }
        } catch (e) {
            console.warn('Legacy image store migration failed (non-fatal):', e);
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
            // Track typing to suppress scroll sync during input
            this._lastInputAt = Date.now();
            
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
            this.syncScroll('editor');
        });

        // Note: Preview scroll is independent (one-way sync: editor → preview only)
        
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
