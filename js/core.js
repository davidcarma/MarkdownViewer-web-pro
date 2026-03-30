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
        this.currentDriveFileId = null;
        this.isModified = false;
        this.lastSavedContent = '';
        
        // Compact/Expand mode state
        this.isCompactMode = false;
        this.expandedContent = '';
        
        // ═══════════════════════════════════════════════════════════════════
        // UNDO / REDO (CUSTOM, RELIABLE)
        // ═══════════════════════════════════════════════════════════════════
        // Native textarea undo history can be wiped by programmatic `.value = ...`
        // (we do that for image collapse, unescape, tab indent, etc).
        // Implement a lightweight history so Cmd+Z / Cmd+Shift+Z / Cmd+Y works reliably.
        this._undoStack = [];
        this._redoStack = [];
        this._historyApplying = false;
        this._historyLastSnapshotAt = 0;
        this._historySnapshotMinIntervalMs = 250;
        this._historyMaxDepth = 200;
        
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

        // ═══════════════════════════════════════════════════════════════════
        // EDITOR WRAP-AWARE METRICS (for accurate scroll→line mapping)
        // Textarea uses white-space: pre-wrap, so scrollTop/lineHeight is NOT a
        // reliable way to infer the top logical line when lines wrap.
        // We build an offscreen mirror to map logical line starts to pixel Y.
        // ═══════════════════════════════════════════════════════════════════
        this._editorMirrorEl = null;
        this._editorLineTops = null; // number[] (0-based line index -> y px)
        this._editorMetricsDirty = true;
        this._editorMetricsBuilding = false;
        this._editorMetricsKey = '';

        // Expose a promise so other modules can reliably run after content restore.
        this.ready = this.init();
    }

    _captureEditorState() {
        const el = this.editor;
        return {
            value: el ? el.value : '',
            selectionStart: el ? (el.selectionStart || 0) : 0,
            selectionEnd: el ? (el.selectionEnd || 0) : 0,
            scrollTop: el ? (el.scrollTop || 0) : 0,
            scrollLeft: el ? (el.scrollLeft || 0) : 0
        };
    }

    _applyEditorState(state) {
        if (!state || !this.editor) return;
        this._historyApplying = true;
        try {
            this.editor.value = state.value || '';
            try {
                this.editor.setSelectionRange(
                    state.selectionStart || 0,
                    state.selectionEnd || 0
                );
            } catch (_) {
                // ignore
            }
            this.editor.scrollTop = state.scrollTop || 0;
            this.editor.scrollLeft = state.scrollLeft || 0;
        } finally {
            this._historyApplying = false;
        }

        // Refresh UI derived from editor content
        try {
            this.updatePreview();
            this.updateStats();
            this.updateCursorPosition();
            this.setModified((this.editor.value || '') !== (this.lastSavedContent || ''));
            if (this.syntaxHighlighter) {
                this.syntaxHighlighter.debouncedHighlight?.();
            }
        } catch (_) {
            // best-effort
        }
    }

    /**
     * Record an undo snapshot of the editor state.
     * Call this before programmatic edits that bypass native undo.
     */
    recordUndoSnapshot(force = false) {
        if (this._historyApplying) return;
        if (!this.editor) return;

        const now = Date.now();
        if (!force && (now - this._historyLastSnapshotAt) < this._historySnapshotMinIntervalMs) {
            return;
        }

        const snap = this._captureEditorState();
        const prev = this._undoStack.length ? this._undoStack[this._undoStack.length - 1] : null;
        if (prev && prev.value === snap.value &&
            prev.selectionStart === snap.selectionStart &&
            prev.selectionEnd === snap.selectionEnd &&
            prev.scrollTop === snap.scrollTop &&
            prev.scrollLeft === snap.scrollLeft) {
            return;
        }

        this._undoStack.push(snap);
        if (this._undoStack.length > this._historyMaxDepth) {
            this._undoStack.shift();
        }
        this._redoStack.length = 0;
        this._historyLastSnapshotAt = now;
    }

    resetUndoHistory() {
        this._undoStack.length = 0;
        this._redoStack.length = 0;
        this._historyLastSnapshotAt = 0;
    }

    undo() {
        if (this._historyApplying) return;
        if (!this._undoStack.length) return;
        const current = this._captureEditorState();
        const prev = this._undoStack.pop();
        this._redoStack.push(current);
        if (this._redoStack.length > this._historyMaxDepth) {
            this._redoStack.shift();
        }
        this._applyEditorState(prev);
    }

    redo() {
        if (this._historyApplying) return;
        if (!this._redoStack.length) return;
        const current = this._captureEditorState();
        const next = this._redoStack.pop();
        this._undoStack.push(current);
        if (this._undoStack.length > this._historyMaxDepth) {
            this._undoStack.shift();
        }
        this._applyEditorState(next);
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
     * Ensure the offscreen editor mirror exists.
     */
    _ensureEditorMirror() {
        if (this._editorMirrorEl) return this._editorMirrorEl;
        const el = document.createElement('div');
        el.setAttribute('aria-hidden', 'true');
        el.style.position = 'absolute';
        el.style.left = '-100000px';
        el.style.top = '0';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.whiteSpace = 'pre-wrap';
        el.style.wordBreak = 'break-word';
        el.style.overflow = 'hidden';
        el.style.boxSizing = 'border-box';
        document.body.appendChild(el);
        this._editorMirrorEl = el;
        return el;
    }

    /**
     * Mark editor metrics dirty (call when text or layout changes).
     */
    _markEditorMetricsDirty() {
        this._editorMetricsDirty = true;
    }

    /**
     * Rebuild wrap-aware mapping from logical line index -> pixel Y in editor.
     * This is critical for scroll sync accuracy on wrapped lines.
     */
    _rebuildEditorLineTops() {
        if (!this.editor) return;
        if (this._editorMetricsBuilding) return;
        this._editorMetricsBuilding = true;

        try {
            const textarea = this.editor;
            const mirror = this._ensureEditorMirror();
            const style = getComputedStyle(textarea);

            // Key includes factors that affect wrapping/layout.
            const key = [
                textarea.clientWidth,
                style.fontFamily,
                style.fontSize,
                style.fontWeight,
                style.letterSpacing,
                style.lineHeight,
                style.paddingTop,
                style.paddingRight,
                style.paddingBottom,
                style.paddingLeft,
                textarea.value.length
            ].join('|');

            // If not dirty and key unchanged, skip.
            if (!this._editorMetricsDirty && this._editorMetricsKey === key && Array.isArray(this._editorLineTops)) {
                return;
            }

            this._editorMetricsKey = key;
            this._editorMetricsDirty = false;

            // Mirror must match textarea content box sizing and wrapping.
            mirror.style.width = `${textarea.clientWidth}px`;
            mirror.style.fontFamily = style.fontFamily;
            mirror.style.fontSize = style.fontSize;
            mirror.style.fontWeight = style.fontWeight;
            mirror.style.fontStyle = style.fontStyle;
            mirror.style.letterSpacing = style.letterSpacing;
            mirror.style.lineHeight = style.lineHeight;
            mirror.style.paddingTop = style.paddingTop;
            mirror.style.paddingRight = style.paddingRight;
            mirror.style.paddingBottom = style.paddingBottom;
            mirror.style.paddingLeft = style.paddingLeft;
            mirror.style.borderTopWidth = '0px';
            mirror.style.borderRightWidth = '0px';
            mirror.style.borderBottomWidth = '0px';
            mirror.style.borderLeftWidth = '0px';

            // Build a marker span at the start of each logical line.
            // We measure marker.offsetTop to map logical lines → pixel Y.
            mirror.innerHTML = '';
            const frag = document.createDocumentFragment();
            const lines = String(textarea.value || '').split('\n');

            for (let i = 0; i < lines.length; i++) {
                const marker = document.createElement('span');
                marker.className = '__editor_line_marker';
                // Zero-size marker, but still in flow for offsetTop.
                marker.style.display = 'inline-block';
                marker.style.width = '0px';
                marker.style.height = '0px';
                frag.appendChild(marker);
                frag.appendChild(document.createTextNode(lines[i]));
                // Preserve explicit newlines so wrapping matches textarea.
                frag.appendChild(document.createTextNode('\n'));
            }

            mirror.appendChild(frag);

            const markers = mirror.querySelectorAll('span.__editor_line_marker');
            const tops = new Array(markers.length);
            for (let i = 0; i < markers.length; i++) {
                tops[i] = markers[i].offsetTop;
            }
            this._editorLineTops = tops;
        } catch (err) {
            // If mirror measurement fails for any reason, keep syncing functional.
            console.warn('Editor mirror metrics rebuild failed; falling back to lineHeight model.', err);
            this._editorLineTops = null;
            this._editorMetricsDirty = true;
        } finally {
            this._editorMetricsBuilding = false;
        }
    }

    /**
     * Get the current top logical line in the editor (wrap-aware), fractional.
     * Returns: { exactTopLine0, topLineInt, lineFraction, totalLines }
     * - exactTopLine0 is 0-based logical line index + fraction into that line.
     */
    _getEditorTopLogicalLine() {
        const totalLines = Math.max(1, String(this.editor?.value || '').split('\n').length);

        // Attempt wrap-aware mapping; build metrics if needed.
        const currentWidth = this.editor?.clientWidth || 0;
        const prevWidth = this._editorMetricsKey ? parseInt(String(this._editorMetricsKey).split('|')[0], 10) : null;
        const widthChanged = Number.isFinite(prevWidth) ? (prevWidth !== currentWidth) : true;
        if (this._editorMetricsDirty || widthChanged || !Array.isArray(this._editorLineTops) || this._editorLineTops.length !== totalLines) {
            // Rebuild synchronously once; if it fails, we fall back below.
            this._rebuildEditorLineTops();
        }

        const tops = this._editorLineTops;
        const scrollTop = this.editor.scrollTop;

        if (!Array.isArray(tops) || tops.length === 0) {
            // Fallback: assumes no wraps (less accurate).
            const lh = this._getEditorLineHeight();
            const exactTopLine0 = scrollTop / lh;
            const topLineInt = Math.floor(exactTopLine0) + 1;
            const lineFraction = exactTopLine0 - Math.floor(exactTopLine0);
            return { exactTopLine0, topLineInt, lineFraction, totalLines, usedFallback: true };
        }

        // Binary search: find greatest i such that tops[i] <= scrollTop.
        let lo = 0;
        let hi = tops.length - 1;
        while (lo < hi) {
            const mid = ((lo + hi + 1) >> 1);
            if (tops[mid] <= scrollTop) lo = mid;
            else hi = mid - 1;
        }

        const lineIdx0 = Math.max(0, Math.min(tops.length - 1, lo));
        const lineTop = tops[lineIdx0];
        const nextTop = (lineIdx0 + 1 < tops.length) ? tops[lineIdx0 + 1] : (lineTop + this._getEditorLineHeight());
        const linePx = Math.max(1, nextTop - lineTop);

        const lineFraction = Math.max(0, Math.min(0.999, (scrollTop - lineTop) / linePx));
        const exactTopLine0 = lineIdx0 + lineFraction;
        const topLineInt = lineIdx0 + 1;

        return { exactTopLine0, topLineInt, lineFraction, totalLines, usedFallback: false };
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
        if (!this.preview) return null;

        // Build reverse-map points from real rendered blocks (same source as forward sync)
        const lineElements = this.preview.querySelectorAll('[data-line][data-line-end]');
        if (!lineElements || lineElements.length === 0) return null;

        const previewRect = this.preview.getBoundingClientRect();
        const points = [];
        for (const el of lineElements) {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'ul' || tag === 'ol' || tag === 'li' || tag === 'blockquote') continue;

            const line = parseInt(el.getAttribute('data-line'), 10);
            const lineEnd = parseInt(el.getAttribute('data-line-end'), 10) || line;
            if (!Number.isFinite(line)) continue;

            const rect = el.getBoundingClientRect();
            const top = rect.top - previewRect.top + this.preview.scrollTop;
            const height = Math.max(1, rect.height);

            // Add start and end anchors so interpolation stays smooth inside tall blocks.
            points.push({ top, line });
            points.push({ top: top + height, line: lineEnd + 1 });
        }

        if (points.length < 2) return null;
        points.sort((a, b) => a.top - b.top);

        if (scrollTop <= points[0].top) return points[0].line;
        if (scrollTop >= points[points.length - 1].top) return points[points.length - 1].line;

        let lo = 0, hi = points.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (points[mid].top < scrollTop) lo = mid + 1;
            else hi = mid;
        }
        const upper = points[lo];
        const lower = points[Math.max(0, lo - 1)];
        const ratio = (scrollTop - lower.top) / Math.max(1, upper.top - lower.top);
        return lower.line + ratio * (upper.line - lower.line);
    }

    /**
     * Called when user scrolls the editor. Syncs preview to match.
     * One-way sync: editor/raw drives preview.
     */
    _onScroll(source) {
        if (source !== 'editor') return;
        
        const now = Date.now();

        // If we're in the ignore window (programmatic scroll), skip
        if (now < this._ignoringScrollUntil) return;
        
        // If user is actively typing, don't sync
        if (now - this._lastInputAt < 200) return;

        // Track current user-driven scroll owner
        this._scrollOwner = 'editor';
        if (this._scrollOwnerTimeout) clearTimeout(this._scrollOwnerTimeout);
        this._scrollOwnerTimeout = setTimeout(() => {
            if (this._scrollOwner === 'editor') this._scrollOwner = null;
        }, 250);

        if (this._scrollRAF) return;
        
        this._scrollRAF = requestAnimationFrame(() => {
            this._scrollRAF = null;
            this._performSync();
        });
    }

    /**
     * Execute scroll synchronization.
     * 
     * ADAPTIVE SYNC with acceleration/deceleration:
     * - For TEXT: Lock sync so top-of-editor text = top-of-preview text
     * - For CODE BLOCKS: Proportional scroll within the block (1:1 lines)
     * - For IMAGES/DIAGRAMS: Fast-forward/rewind to resync text after them
     * 
     * Uses data-line attributes to map editor lines to preview positions.
     */
    _performSync() {
        if (!this.editor || !this.preview) return;
        
        // Debug flag - enable by setting localStorage key:
        // localStorage.setItem('markdownpro-debug-scroll', '1')
        const DEBUG_SCROLL = (localStorage.getItem('markdownpro-debug-scroll') === '1');

        const previewMax = Math.max(1, this.preview.scrollHeight - this.preview.clientHeight);
        const editorMax = Math.max(0, this.editor.scrollHeight - this.editor.clientHeight);
        
        // ─────────────────────────────────────────────────────────────────
        // Calculate which LOGICAL line is at TOP of editor viewport (fractional)
        // Wrap-aware via mirror metrics; falls back to lineHeight model if needed.
        // ─────────────────────────────────────────────────────────────────
        const { exactTopLine0, topLineInt, lineFraction, totalLines, usedFallback } = this._getEditorTopLogicalLine();

        // ─────────────────────────────────────────────────────────────────
        // EDGE SNAPPING: At top or bottom, snap cleanly
        // ─────────────────────────────────────────────────────────────────
        if (this.editor.scrollTop <= 2) {
            if (this.preview.scrollTop > 2) {
                this._setScrollWithIgnore(this.preview, 0);
            }
            return;
        }

        if (this.editor.scrollTop >= editorMax - 2) {
            if (this.preview.scrollTop < previewMax - 2) {
                this._setScrollWithIgnore(this.preview, previewMax);
            }
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Build LINE MAP: Map editor lines to preview pixel positions
        // ─────────────────────────────────────────────────────────────────
        // Prefer leaf block markers (paragraphs/headings/fences/etc.).
        // Container markers (ul/ol/li/blockquote) span large ranges and distort interpolation.
        const lineElements = this.preview.querySelectorAll('[data-line][data-line-end]');
        
        if (lineElements.length === 0) {
            // FALLBACK: No line markers, use simple ratio
            const lineRatio = Math.max(0, Math.min(1, exactTopLine0 / Math.max(1, totalLines - 1)));
            const targetScrollTop = lineRatio * previewMax;
            const delta = Math.abs(this.preview.scrollTop - targetScrollTop);
            if (delta >= 3) {
                this._setScrollWithIgnore(this.preview, targetScrollTop);
            }
            return;
        }

        // Build sorted line map with accurate positions
        // Includes both start line and end line for multi-line blocks
        const lineMap = [];
        const previewRect = this.preview.getBoundingClientRect();
        
        for (const el of lineElements) {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag === 'ul' || tag === 'ol' || tag === 'li' || tag === 'blockquote') {
                continue;
            }
            const line = parseInt(el.getAttribute('data-line'), 10);
            const lineEnd = parseInt(el.getAttribute('data-line-end'), 10) || line;
            if (Number.isFinite(line)) {
                const rect = el.getBoundingClientRect();
                // Position relative to preview scroll container
                const top = rect.top - previewRect.top + this.preview.scrollTop;
                const height = rect.height;
                // lineSpan = how many editor lines this element covers (inclusive)
                // lineEnd is the LAST line of the element (inclusive), so span = end - start + 1
                const lineSpan = Math.max(1, lineEnd - line + 1);
                lineMap.push({ line, lineEnd, lineSpan, top, height, el });
            }
        }
        lineMap.sort((a, b) => a.line - b.line);

        if (lineMap.length === 0) return;
        
        // Log full line map once per render (on first scroll after update)
        if (DEBUG_SCROLL && !this._lastLineMapLog) {
            console.log(`[LINE MAP] Total ${lineMap.length} markers for ${totalLines} editor lines:`);
            for (const entry of lineMap) {
                const tag = entry.el.tagName.toLowerCase();
                // Show inclusive range: lineEnd is the LAST line (inclusive)
                console.log(`  Lines ${entry.line}-${entry.lineEnd} (${entry.lineSpan} lines, inclusive) → <${tag}> @ ${entry.top.toFixed(0)}px, h=${entry.height.toFixed(0)}px`);
            }
            this._lastLineMapLog = true;
        }

        // ─────────────────────────────────────────────────────────────────
        // FIND BRACKETING ELEMENTS: Elements before and after our target line
        // ─────────────────────────────────────────────────────────────────
        let before = null;  // Element AT or BEFORE our line
        let after = null;   // Element AFTER our line
        
        for (let i = 0; i < lineMap.length; i++) {
            if (lineMap[i].line <= topLineInt) {
                before = lineMap[i];
            }
            if (lineMap[i].line > topLineInt && !after) {
                after = lineMap[i];
                break;
            }
        }

        // If no before, use first; if no after, use last
        if (!before) before = lineMap[0];
        if (!after) after = lineMap[lineMap.length - 1];

        // ─────────────────────────────────────────────────────────────────
        // CALCULATE TARGET SCROLL with adaptive interpolation
        // Handles both acceleration (images) and deceleration (compact code)
        // ─────────────────────────────────────────────────────────────────
        let targetScrollTop;
        
        // ─────────────────────────────────────────────────────────────────
        // DEBUG LOGGING - Enable to diagnose scroll sync issues
        // ─────────────────────────────────────────────────────────────────
        if (DEBUG_SCROLL) {
            console.log(`[SCROLL] Editor: line ${topLineInt} + ${lineFraction.toFixed(3)} frac | scrollTop: ${this.editor.scrollTop.toFixed(0)}px`);
            if (usedFallback) {
                console.log(`[SCROLL] Editor mapping: FALLBACK (lineHeight model) - wraps may reduce accuracy`);
            } else {
                console.log(`[SCROLL] Editor mapping: WRAP-AWARE (mirror model)`);
            }
            console.log(`[SCROLL] Before element: line ${before.line}-${before.lineEnd} (${before.lineSpan} lines) @ ${before.top.toFixed(0)}px, height: ${before.height.toFixed(0)}px`);
            if (after) {
                console.log(`[SCROLL] After element: line ${after.line}-${after.lineEnd} (${after.lineSpan} lines) @ ${after.top.toFixed(0)}px, height: ${after.height.toFixed(0)}px`);
            }
        }

        // Check if we're WITHIN the 'before' element's line range
        // Use <= for lineEnd since it's the LAST line (inclusive) of the element
        const withinBeforeElement = topLineInt >= before.line && topLineInt <= before.lineEnd;
        
        if (withinBeforeElement) {
            // ─────────────────────────────────────────────────────────────
            // WITHIN A MULTI-LINE BLOCK (e.g., code fence, long paragraph)
            // Use proportional scroll within the element itself
            // ─────────────────────────────────────────────────────────────
            
            // How far into this element are we? (in editor lines from element start)
            const linesIntoElement = (topLineInt - before.line) + lineFraction;
            
            // What fraction of the element have we traversed?
            const elementProgress = linesIntoElement / before.lineSpan;
            
            // Scroll proportionally through the element's rendered height
            // This gives us:
            // - SLOW scroll for dense code blocks (many lines, similar height)
            // - FAST scroll for images/diagrams (few lines, large height)
            const pixelOffset = elementProgress * before.height;
            targetScrollTop = before.top + pixelOffset;
            
            if (DEBUG_SCROLL) {
                const pxPerLine = before.height / before.lineSpan;
                console.log(`[SCROLL] MODE: WITHIN element | progress: ${(elementProgress * 100).toFixed(1)}% | ${pxPerLine.toFixed(1)}px/line | target: ${targetScrollTop.toFixed(0)}px`);
            }
            
        } else if (before && after && topLineInt > before.lineEnd && topLineInt < after.line) {
            // ─────────────────────────────────────────────────────────────
            // BETWEEN ELEMENTS: In the gap after 'before' ends
            // ─────────────────────────────────────────────────────────────
            
            // Gap between end of 'before' element and start of 'after' element
            const gapStartLine = before.lineEnd;
            const gapEndLine = after.line;
            const gapStartPixel = before.top + before.height;
            const gapEndPixel = after.top;
            
            const gapLines = gapEndLine - gapStartLine;
            const gapPixels = gapEndPixel - gapStartPixel;
            
            // How far into the gap are we?
            const linesIntoGap = (topLineInt - gapStartLine) + lineFraction;
            const gapProgress = gapLines > 0 ? linesIntoGap / gapLines : 0;
            
            targetScrollTop = gapStartPixel + (gapProgress * gapPixels);
            
            if (DEBUG_SCROLL) {
                console.log(`[SCROLL] MODE: BETWEEN | gap: lines ${gapStartLine}-${gapEndLine} (${gapLines}), pixels ${gapStartPixel.toFixed(0)}-${gapEndPixel.toFixed(0)} (${gapPixels.toFixed(0)}) | progress: ${(gapProgress * 100).toFixed(1)}% | target: ${targetScrollTop.toFixed(0)}px`);
            }
            
        } else {
            // EDGE CASE: Beyond last marker or other fallback
            targetScrollTop = before.top + before.height;
            
            if (DEBUG_SCROLL) {
                console.log(`[SCROLL] MODE: FALLBACK (beyond markers) | target: ${targetScrollTop.toFixed(0)}px`);
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // APPLY SCROLL with small dead zone to prevent jitter
        // ─────────────────────────────────────────────────────────────────
        targetScrollTop = Math.max(0, Math.min(previewMax, targetScrollTop));
        
        const delta = Math.abs(this.preview.scrollTop - targetScrollTop);
        
        if (DEBUG_SCROLL) {
            console.log(`[SCROLL] Preview: current ${this.preview.scrollTop.toFixed(0)}px → target ${targetScrollTop.toFixed(0)}px | delta: ${delta.toFixed(0)}px | previewMax: ${previewMax.toFixed(0)}px`);
            console.log(`[SCROLL] ─────────────────────────────────────────────────────`);
        }
        
        if (delta < 2) return;  // Very small dead zone for responsiveness

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
        
        // Move cursor to beginning to prevent browser from scrolling to cursor
        if (this.editor) {
            this.editor.setSelectionRange(0, 0);
            this.editor.scrollTop = 0;
        }
        if (this.preview) this.preview.scrollTop = 0;
        
        // Rebuild scroll map after a short delay to let DOM settle
        setTimeout(() => {
            this._buildScrollMap();
        }, 100);
    }
    
    async init() {
        this.setupMarked();
        this._setupAnchorLinkHandler();
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
        this._restoreViewMode();
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
        
        // Make links open in new tab (but NOT internal anchor links)
        const defaultLinkRender = this.md.renderer.rules.link_open || 
            function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
        
        this.md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
            const hrefIdx = tokens[idx].attrIndex('href');
            const href = hrefIdx >= 0 ? tokens[idx].attrs[hrefIdx][1] : '';
            // Only add target="_blank" for external links, not internal anchors
            if (!href.startsWith('#')) {
                tokens[idx].attrSet('target', '_blank');
                tokens[idx].attrSet('rel', 'noopener noreferrer');
            }
            return defaultLinkRender(tokens, idx, options, env, self);
        };
        
        // Add IDs to headings for anchor links
        this._addHeadingIds();
        
        this.setupMermaid();
    }
    
    /**
     * Slugify a heading text for use as an ID.
     * Converts to lowercase, replaces spaces with hyphens, removes special chars.
     */
    _slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')  // Remove special characters
            .replace(/\s+/g, '-')       // Replace spaces with hyphens
            .replace(/-+/g, '-')        // Collapse multiple hyphens
            .replace(/^-|-$/g, '');     // Trim leading/trailing hyphens
    }
    
    /**
     * Add IDs to headings for internal anchor navigation.
     */
    _addHeadingIds() {
        const md = this.md;
        const defaultHeadingRender = md.renderer.rules.heading_open || 
            function(tokens, idx, options, env, self) {
                return self.renderToken(tokens, idx, options);
            };
        
        md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            // Get the heading text from the inline token that follows
            const inlineToken = tokens[idx + 1];
            if (inlineToken && inlineToken.type === 'inline' && inlineToken.content) {
                const id = this._slugify(inlineToken.content);
                if (id) {
                    token.attrSet('id', id);
                }
            }
            return defaultHeadingRender(tokens, idx, options, env, self);
        };
    }
    
    /**
     * Set up click handler for internal anchor links in preview.
     */
    _setupAnchorLinkHandler() {
        if (!this.preview) return;
        
        this.preview.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (!link) return;
            
            e.preventDefault();
            const targetId = link.getAttribute('href').slice(1); // Remove the #
            if (!targetId) return;
            
            // Try to find the element by exact ID first
            let target = this.preview.querySelector(`#${CSS.escape(targetId)}`);
            
            // If not found, try a fuzzy match (slugified version might differ)
            if (!target) {
                const slugified = this._slugify(targetId);
                target = this.preview.querySelector(`#${CSS.escape(slugified)}`);
            }
            
            // If still not found, search all headings for a text match
            if (!target) {
                const headings = this.preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
                const searchTerms = targetId.toLowerCase().replace(/-/g, ' ').split(' ').filter(Boolean);
                
                for (const h of headings) {
                    const headingText = h.textContent.toLowerCase();
                    const headingSlug = this._slugify(headingText);
                    
                    // Exact slug match
                    if (headingSlug === targetId) {
                        target = h;
                        break;
                    }
                    
                    // Check if heading contains all search terms
                    if (searchTerms.length > 0 && searchTerms.every(term => headingText.includes(term))) {
                        target = h;
                        break;
                    }
                    
                    // Check if heading starts with a number pattern like "1.1" matching "sec-1-1"
                    const secMatch = targetId.match(/^sec-(\d+(?:-\d+)*)$/i);
                    if (secMatch) {
                        const sectionNum = secMatch[1].replace(/-/g, '.');
                        if (headingText.startsWith(sectionNum + ' ') || headingText.startsWith(sectionNum + '.')) {
                            target = h;
                            break;
                        }
                    }
                    
                    // Check chapter pattern like "chapter-1" matching "Chapter 1:"
                    const chapterMatch = targetId.match(/^chapter-(\d+)(?:-|$)/i);
                    if (chapterMatch) {
                        const chapterNum = chapterMatch[1];
                        if (headingText.includes(`chapter ${chapterNum}`) || 
                            headingText.match(new RegExp(`^${chapterNum}\\.?\\s`))) {
                            target = h;
                            break;
                        }
                    }
                }
            }
            
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                console.warn(`Anchor target not found: #${targetId}`);
            }
        });
    }
    
    /**
     * Plugin to add data-line attributes to rendered HTML elements.
     * This enables accurate scroll sync between editor and preview.
     * 
     * Adds both start line (data-line) and end line (data-line-end) for
     * multi-line blocks like code fences, allowing proportional scroll within.
     */
    _addSourceLinePlugin() {
        const md = this.md;
        
        // Override renderers for block elements to add data-line and data-line-end
        const blockElements = [
            // Leaf blocks only (avoid container wrappers that span huge ranges)
            'paragraph_open',
            'heading_open',
            'code_block',
            'fence',
            'table_open',
            'hr'
        ];
        
        for (const rule of blockElements) {
            const defaultRender = md.renderer.rules[rule] || 
                function(tokens, idx, options, env, self) {
                    return self.renderToken(tokens, idx, options);
                };
            
            md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
                const token = tokens[idx];
                if (token.map && token.map.length >= 2) {
                    // map[0] = start line (0-based), map[1] = end line (exclusive)
                    token.attrSet('data-line', token.map[0] + 1);
                    token.attrSet('data-line-end', token.map[1]);  // End line for multi-line blocks
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
                personBkg: '#111827',

                // Pie charts
                pie1: '#60a5fa',
                pie2: '#2dd4bf',
                pie3: '#fbbf24',
                pie4: '#fb7185',
                pie5: '#34d399',
                pie6: '#a78bfa',
                pie7: '#f97316',
                pie8: '#22d3ee',
                pie9: '#f472b6',
                pie10: '#a3e635',
                pie11: '#818cf8',
                pie12: '#e879f9',
                pieSectionTextColor: '#0f172a',
                pieSectionTextSize: '14px',
                pieTitleTextColor: '#e5e7eb',
                pieLegendTextColor: '#e5e7eb',
                pieStrokeColor: '#1e293b',
                pieStrokeWidth: '1px',
                pieOpacity: '0.9',

                // XY Charts (xychart-beta)
                xyChart: {
                    backgroundColor: 'transparent',
                    titleColor: '#e5e7eb',
                    xAxisTitleColor: '#94a3b8',
                    xAxisLabelColor: '#94a3b8',
                    xAxisTickColor: '#475569',
                    xAxisLineColor: '#475569',
                    yAxisTitleColor: '#94a3b8',
                    yAxisLabelColor: '#94a3b8',
                    yAxisTickColor: '#475569',
                    yAxisLineColor: '#475569',
                    plotColorPalette: '#60a5fa,#2dd4bf,#fbbf24,#fb7185,#34d399,#a78bfa,#f97316,#22d3ee,#f472b6,#a3e635'
                }
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
                personBkg: '#e9d5ff',

                // XY Charts (xychart-beta)
                xyChart: {
                    backgroundColor: 'transparent',
                    titleColor: '#1e293b',
                    xAxisTitleColor: '#6b21a8',
                    xAxisLabelColor: '#6b21a8',
                    xAxisTickColor: '#c084fc',
                    xAxisLineColor: '#c084fc',
                    yAxisTitleColor: '#6b21a8',
                    yAxisLabelColor: '#6b21a8',
                    yAxisTickColor: '#c084fc',
                    yAxisLineColor: '#c084fc',
                    plotColorPalette: '#8b5cf6,#c084fc,#d946ef,#6366f1,#a855f7,#ec4899,#818cf8,#e879f9,#7c3aed,#f472b6'
                }
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
                personBkg: '#dbeafe',

                // XY Charts (xychart-beta)
                xyChart: {
                    backgroundColor: 'transparent',
                    titleColor: '#0f172a',
                    xAxisTitleColor: '#334155',
                    xAxisLabelColor: '#334155',
                    xAxisTickColor: '#94a3b8',
                    xAxisLineColor: '#94a3b8',
                    yAxisTitleColor: '#334155',
                    yAxisLabelColor: '#334155',
                    yAxisTickColor: '#94a3b8',
                    yAxisLineColor: '#94a3b8',
                    plotColorPalette: '#3b82f6,#10b981,#f59e0b,#ef4444,#8b5cf6,#ec4899,#14b8a6,#f97316,#6366f1,#84cc16'
                }
            };
        }

        mermaid.initialize(mermaidConfig);
        console.log(`Mermaid theme updated to: ${currentTheme}`);
    }
    
    updatePreview() {
        // Reset line map log flag so we log the new map on first scroll
        this._lastLineMapLog = false;
        
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
            // Capture scroll before replacing DOM so we can restore exactly.
            const _savedScrollTop = this.preview.scrollTop;

            this.preview.innerHTML = html;

            // Restore scroll immediately so content doesn't jump.
            this.preview.scrollTop = _savedScrollTop;

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
                // Restore scroll again after mermaid block replacement shifts layout.
                requestAnimationFrame(() => { this.preview.scrollTop = _savedScrollTop; });
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
                    // PRESERVE data-line attributes for scroll sync!
                    // Check both <pre> and <code> for the attributes
                    const dataLine = preElement.getAttribute('data-line') || block.getAttribute('data-line');
                    const dataLineEnd = preElement.getAttribute('data-line-end') || block.getAttribute('data-line-end');
                    if (dataLine) {
                        mermaidDiv.setAttribute('data-line', dataLine);
                    }
                    if (dataLineEnd) {
                        mermaidDiv.setAttribute('data-line-end', dataLineEnd);
                    }
                    
                    const _scrollBefore = this.preview.scrollTop;
                    preElement.parentNode.replaceChild(mermaidDiv, preElement);
                    // Replacing the pre with the mermaid div can shift layout —
                    // snap scroll back before the browser paints.
                    this.preview.scrollTop = _scrollBefore;
                    
                    // Render the mermaid diagram
                    mermaid.render(id + '-svg', code).then(({ svg, bindFunctions }) => {
                        console.log(`Successfully rendered Mermaid diagram ${index + 1}`);
                        const _scrollBeforeRender = this.preview.scrollTop;
                        this._buildMermaidViewer(mermaidDiv, svg, bindFunctions);
                        // SVG injection can shift layout again — restore once more.
                        requestAnimationFrame(() => { this.preview.scrollTop = _scrollBeforeRender; });
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
    
    /**
     * Build an interactive viewer around a rendered Mermaid SVG:
     * toolbar (zoom in/out/reset, copy image) + pan/zoom viewport.
     */
    _buildMermaidViewer(container, svgMarkup, bindFunctions) {
        container.innerHTML = '';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.className = 'mermaid-toolbar';

        const btnZoomIn  = this._toolbarBtn('Zoom in',  '+',  'mermaid-zoom-in');
        const btnZoomOut = this._toolbarBtn('Zoom out', '\u2212', 'mermaid-zoom-out');
        const btnReset   = this._toolbarBtn('Reset',    '\u21BA', 'mermaid-zoom-reset');
        const btnCopy    = this._toolbarBtn('Copy image', '\uD83D\uDCCB', 'mermaid-copy-img');
        const zoomLabel  = document.createElement('span');
        zoomLabel.className = 'mermaid-zoom-label';
        zoomLabel.textContent = '100%';

        toolbar.append(btnZoomIn, btnZoomOut, btnReset, zoomLabel, btnCopy);
        container.appendChild(toolbar);

        // Viewport (clips overflow) → inner layer (transforms)
        const viewport = document.createElement('div');
        viewport.className = 'mermaid-viewport';
        const inner = document.createElement('div');
        inner.className = 'mermaid-inner';
        inner.innerHTML = svgMarkup;
        if (bindFunctions) bindFunctions(inner);
        viewport.appendChild(inner);
        container.appendChild(viewport);

        // State
        let scale = 1, panX = 0, panY = 0, dragging = false, lastX = 0, lastY = 0;
        const MIN_SCALE = 0.25, MAX_SCALE = 5;
        const IDLE_TIMEOUT_MS = 10000;
        let zoomActive = false;
        let idleTimer = null;

        const applyTransform = () => {
            inner.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
            zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        };

        const resetIdleTimer = () => {
            clearTimeout(idleTimer);
            if (zoomActive) {
                idleTimer = setTimeout(deactivateZoom, IDLE_TIMEOUT_MS);
            }
        };

        const activateZoom = () => {
            if (zoomActive) return;
            zoomActive = true;
            viewport.classList.add('zoom-active');
            resetIdleTimer();
        };

        const deactivateZoom = () => {
            if (!zoomActive) return;
            zoomActive = false;
            dragging = false;
            viewport.classList.remove('zoom-active');
            clearTimeout(idleTimer);
        };

        // Click on viewport to activate zoom/pan mode
        viewport.addEventListener('click', (e) => {
            if (e.target.closest('.mermaid-toolbar')) return;
            if (zoomActive) return;
            activateZoom();
        });

        // Deactivate when mouse leaves the diagram entirely
        container.addEventListener('mouseleave', () => {
            deactivateZoom();
        });

        // Deactivate on any click outside this container
        document.addEventListener('mousedown', (e) => {
            if (!zoomActive) return;
            if (!container.contains(e.target)) {
                deactivateZoom();
            }
        }, true);

        // Zoom buttons always work (they're explicit user intent)
        btnZoomIn.addEventListener('click',  () => { activateZoom(); scale = Math.min(MAX_SCALE, scale * 1.25); applyTransform(); resetIdleTimer(); });
        btnZoomOut.addEventListener('click', () => { activateZoom(); scale = Math.max(MIN_SCALE, scale / 1.25); applyTransform(); resetIdleTimer(); });
        btnReset.addEventListener('click',   () => { scale = 1; panX = 0; panY = 0; applyTransform(); deactivateZoom(); });

        // Mouse wheel: only zoom when active, otherwise let page scroll
        viewport.addEventListener('wheel', (e) => {
            if (!zoomActive) return;
            e.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const prev = scale;
            scale = e.deltaY < 0
                ? Math.min(MAX_SCALE, scale * 1.1)
                : Math.max(MIN_SCALE, scale / 1.1);
            const ratio = scale / prev;
            panX = mx - ratio * (mx - panX);
            panY = my - ratio * (my - panY);
            applyTransform();
            resetIdleTimer();
        }, { passive: false });

        // Pan via mouse drag: only when active
        viewport.addEventListener('mousedown', (e) => {
            if (!zoomActive || e.button !== 0) return;
            dragging = true; lastX = e.clientX; lastY = e.clientY;
            viewport.style.cursor = 'grabbing';
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            panX += e.clientX - lastX;
            panY += e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            applyTransform();
            resetIdleTimer();
        });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            viewport.style.cursor = '';
        });

        // Touch: two-finger pinch always activates, single-finger pan only when active
        let lastTouches = null;
        viewport.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                activateZoom();
                lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
            } else if (e.touches.length === 1 && zoomActive) {
                lastTouches = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }];
            }
        }, { passive: true });
        viewport.addEventListener('touchmove', (e) => {
            if (!lastTouches || !zoomActive) return;
            e.preventDefault();
            if (e.touches.length === 1 && lastTouches.length === 1) {
                panX += e.touches[0].clientX - lastTouches[0].x;
                panY += e.touches[0].clientY - lastTouches[0].y;
                lastTouches = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }];
            } else if (e.touches.length === 2 && lastTouches.length === 2) {
                const cur = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
                const prevDist = Math.hypot(lastTouches[1].x - lastTouches[0].x, lastTouches[1].y - lastTouches[0].y);
                const curDist  = Math.hypot(cur[1].x - cur[0].x, cur[1].y - cur[0].y);
                const prev = scale;
                scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (curDist / prevDist)));
                const rect = viewport.getBoundingClientRect();
                const mx = (cur[0].x + cur[1].x) / 2 - rect.left;
                const my = (cur[0].y + cur[1].y) / 2 - rect.top;
                const ratio = scale / prev;
                panX = mx - ratio * (mx - panX);
                panY = my - ratio * (my - panY);
                lastTouches = cur;
            }
            applyTransform();
            resetIdleTimer();
        }, { passive: false });
        viewport.addEventListener('touchend', () => { lastTouches = null; }, { passive: true });

        // Copy image at 2x resolution — pass the container so we can read its background
        btnCopy.addEventListener('click', () => this._copyMermaidAsImage(inner, btnCopy, container));
    }

    _toolbarBtn(title, text, className) {
        const btn = document.createElement('button');
        btn.className = `mermaid-toolbar-btn ${className}`;
        btn.title = title;
        btn.textContent = text;
        return btn;
    }

    async _copyMermaidAsImage(innerEl, btn, container) {
        const svgEl = innerEl.querySelector('svg');
        if (!svgEl) return;

        const originalText = btn.textContent;
        btn.textContent = '\u23F3';
        btn.disabled = true;

        const finish = (icon) => {
            btn.textContent = icon;
            setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 1800);
        };

        try {
            // Read the actual background color from the diagram container
            const bgColor = window.getComputedStyle(container).backgroundColor || '#ffffff';
            const pngBlob = await this._svgToBlob(svgEl, bgColor);

            if (navigator.clipboard && typeof ClipboardItem !== 'undefined' &&
                window.location.protocol !== 'file:') {
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                    finish('\u2705');
                    return;
                } catch (_) { /* fall through to download */ }
            }

            const a = document.createElement('a');
            a.href = URL.createObjectURL(pngBlob);
            a.download = 'mermaid-diagram.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            finish('\u2B07\uFE0F');

        } catch (err) {
            console.error('Copy image failed:', err);
            finish('\u274C');
        }
    }

    /**
     * Render an SVG element to a PNG blob at 2x resolution.
     *
     * Strategy: build a fully self-contained SVG by cloning the element,
     * inlining every computed style on every node (including foreignObject
     * HTML content), then draw it via data-URL → Image → Canvas.
     * This is heavier than a shallow clone but guarantees pixel-perfect output.
     */
    async _svgToBlob(svgEl, bgColor) {
        const DPR = 2;
        const clone = svgEl.cloneNode(true);

        // --- dimensions ---
        const vb = clone.getAttribute('viewBox');
        let w, h;
        if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            w = parts[2]; h = parts[3];
        } else {
            w = parseFloat(clone.getAttribute('width'))  || svgEl.clientWidth  || 800;
            h = parseFloat(clone.getAttribute('height')) || svgEl.clientHeight || 600;
        }
        clone.setAttribute('width',  String(w));
        clone.setAttribute('height', String(h));
        clone.setAttribute('xmlns',  'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clone.setAttribute('xmlns:xhtml', 'http://www.w3.org/1999/xhtml');

        // --- background matches the actual container (dark/light/gwyneth) ---
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%');
        bg.setAttribute('height', '100%');
        bg.setAttribute('fill', bgColor || '#ffffff');
        clone.insertBefore(bg, clone.firstChild);

        // --- inline every computed style so the SVG is self-contained ---
        this._deepInlineStyles(svgEl, clone);

        // --- serialize → data URL → Image → Canvas ---
        const xml = new XMLSerializer().serializeToString(clone);
        const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * DPR);
        canvas.height = Math.round(h * DPR);
        const ctx = canvas.getContext('2d');
        ctx.scale(DPR, DPR);

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
        });
        ctx.drawImage(img, 0, 0, w, h);

        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    /**
     * Walk two matching DOM trees (live + clone) and copy the full
     * computed cssText from each live element onto the clone.
     * Handles both SVG elements and HTML elements inside foreignObject.
     */
    _deepInlineStyles(live, clone) {
        try {
            const cs = window.getComputedStyle(live);
            // cssText gives us every resolved property in one shot
            clone.style.cssText = cs.cssText;
        } catch (_) {
            // getComputedStyle can fail on non-element nodes — skip
        }

        const liveChildren  = live.children;
        const cloneChildren = clone.children;
        for (let i = 0; i < liveChildren.length && i < cloneChildren.length; i++) {
            this._deepInlineStyles(liveChildren[i], cloneChildren[i]);
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

        // Invalidate minimap color caches so both repaint with new theme colors.
        if (this.minimap)        { this.minimap._cachedTheme = null;        this.minimap._scheduleRender(50); }
        if (this.previewMinimap) { this.previewMinimap._cachedTheme = null; this.previewMinimap._svgCache = new WeakMap(); this.previewMinimap._scheduleRender(150); }
        
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
    
    /**
     * Resolve the desired view mode from (1) URL ?view= param, (2) localStorage.
     * Valid values: "split", "preview", "edit".
     */
    _getViewMode() {
        const params = new URLSearchParams(window.location.search);
        const fromUrl = (params.get('view') || '').toLowerCase();
        if (['split', 'preview', 'edit'].includes(fromUrl)) return fromUrl;
        const stored = localStorage.getItem('markdown-editor-view-mode');
        if (['split', 'preview', 'edit'].includes(stored)) return stored;
        return 'split';
    }

    _saveViewMode(mode) {
        localStorage.setItem('markdown-editor-view-mode', mode);
        // Keep the URL param in sync so copy-pasting the address preserves the view
        const url = new URL(window.location);
        if (mode === 'split') {
            url.searchParams.delete('view');
        } else {
            url.searchParams.set('view', mode);
        }
        window.history.replaceState(null, '', url);
    }

    _restoreViewMode() {
        const mode = this._getViewMode();
        if (mode === 'preview' || mode === 'edit') {
            this.enterFullscreenMode(mode);
        }
        // "split" is the default layout — nothing to do
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
    
    enterFullscreenMode(initialMode) {
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
        
        const mode = initialMode || 'preview';
        this.currentFullscreenMode = mode;
        this.switchFullscreenMode(mode);
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
        
        // Show both minimaps in split view
        if (this.minimap) this.minimap.show();
        if (this.previewMinimap) this.previewMinimap.show();
        
        // Reset current mode
        this.currentFullscreenMode = null;
        this._saveViewMode('split');
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
        this._saveViewMode(mode);
        
        if (mode === 'edit') {
            // Show only editor
            editorPane.style.display = 'flex';
            previewPane.style.display = 'none';
            editorPane.style.flex = '1 1 100%';
            
            // Show editor minimap, hide preview minimap
            if (this.minimap) this.minimap.show();
            if (this.previewMinimap) this.previewMinimap.hide();
            
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
            
            // Show preview minimap, hide editor minimap
            if (this.minimap) this.minimap.hide();
            if (this.previewMinimap) this.previewMinimap.show();
            
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

    /**
     * Mermaid allows optional %%{init:...}%% lines before the diagram keyword.
     * Strip leading blank lines and full-line %%{...}%% directives so validation
     * and diagram-type detection see the real first line (stateDiagram-v2, etc.).
     */
    _stripLeadingMermaidDirectives(code) {
        if (!code) return '';
        const lines = code.split('\n');
        let i = 0;
        while (i < lines.length) {
            const t = lines[i].trim();
            if (t === '') {
                i++;
                continue;
            }
            if (t.startsWith('%%{') && t.endsWith('%%')) {
                i++;
                continue;
            }
            break;
        }
        return lines.slice(i).join('\n');
    }

    /**
     * Rule generators and soft wraps sometimes break `style` lines so `color:` ends
     * one line and `#rrggbb` continues on the next. Mermaid then fails to parse.
     * Merge those continuations when the block is clearly a style line.
     */
    _mergeBrokenMermaidStyleLines(code) {
        const rawLines = code.split('\n');
        const out = [];
        for (let i = 0; i < rawLines.length; ) {
            let line = rawLines[i];
            let j = i;
            while (j + 1 < rawLines.length) {
                const tEnd = line.replace(/\s+$/, '');
                const nextLine = rawLines[j + 1];
                const nextTrim = nextLine.trim();
                const isStyleCtx = /(?:^|\s)style\s+/i.test(line);
                if (
                    isStyleCtx &&
                    /(?:color|stroke|fill):\s*$/i.test(tEnd) &&
                    /^#[0-9a-fA-F]{3,8}$/.test(nextTrim)
                ) {
                    line = tEnd + nextTrim;
                    j++;
                    continue;
                }
                if (
                    isStyleCtx &&
                    /#[0-9a-fA-F]{1,5}$/.test(tEnd) &&
                    /^[0-9a-fA-F]{1,4}$/.test(nextTrim)
                ) {
                    line = tEnd + nextTrim;
                    j++;
                    continue;
                }
                break;
            }
            out.push(line);
            i = j + 1;
        }
        return out.join('\n');
    }
    
    sanitizeMermaidCode(code) {
        // Security: Remove dangerous HTML/scripts
        code = code.replace(/<script[\s\S]*?<\/script>/gi, '');
        code = code.replace(/<style[\s\S]*?<\/style>/gi, '');
        
        // Compatibility: Mermaid requires <br> not <br/>
        code = code.replace(/<br\s*\/>/gi, '<br>');
        
        // Normalize whitespace
        code = code.replace(/\r\n/g, '\n');
        code = code.trim();
        code = this._mergeBrokenMermaidStyleLines(code);
        
        // Detect diagram type from first non-directive line (skip %%{init:...}%%)
        const bodyForType = this._stripLeadingMermaidDirectives(code);
        const firstLine = bodyForType.split('\n').find(l => l.trim().length > 0) || '';
        const isStateDiagram = /^\s*stateDiagram/i.test(firstLine);
        const isFlowchart = /^\s*(graph|flowchart)\s/i.test(firstLine);

        // stateDiagram-v2 does not support the `style` directive (flowchart-only).
        // Convert `style <id> <props>` into classDef/class pairs.
        if (isStateDiagram) {
            code = this._convertStateDiagramStyleToClassDef(code);
        }

        // Process line-by-line for label quoting (stateDiagram + flowchart)
        if (isStateDiagram || isFlowchart) {
            code = code.split('\n').map(line => {
                if (isStateDiagram) {
                    return this._sanitizeStateDiagramLine(line);
                }
                if (isFlowchart) {
                    return this._sanitizeFlowchartLine(line);
                }
                return line;
            }).join('\n');
        }

        return code;
    }

    /**
     * Convert flowchart-style `style <id> <props>` lines (unsupported in
     * stateDiagram-v2) into `classDef`/`class` pairs that the parser accepts.
     * Each unique property string gets its own classDef; duplicate props share one.
     */
    _convertStateDiagramStyleToClassDef(code) {
        const lines = code.split('\n');
        const stylePattern = /^(\s*)style\s+(\S+)\s+(.+)$/;
        const propToName = new Map();
        let counter = 0;
        const classDefs = [];
        const classAssigns = [];

        const out = [];
        for (const line of lines) {
            const m = line.match(stylePattern);
            if (!m) {
                out.push(line);
                continue;
            }
            const indent = m[1];
            const stateId = m[2];
            const props = m[3].trim();

            let className = propToName.get(props);
            if (!className) {
                className = `_autoStyle${counter++}`;
                propToName.set(props, className);
                classDefs.push(`${indent}classDef ${className} ${props}`);
            }
            classAssigns.push(`${indent}class ${stateId} ${className}`);
        }
        return [...out, ...classDefs, ...classAssigns].join('\n');
    }

    _sanitizeStateDiagramLine(line) {
        if (/^\s*style\s+/i.test(line) || /^\s*classDef\s+/i.test(line) || /^\s*class\s+/i.test(line)) {
            return line;
        }
        const m = line.match(/^(\s*\S+\s+-->\s+\S+\s*:\s*)(.+)$/);
        if (!m) return line;

        const prefix = m[1];
        let label = m[2];

        label = this._makeMermaidSafeLabel(label);
        return `${prefix}${label}`;
    }

    /**
     * Flowchart edge labels come in two forms:
     *   A -->|label| B          (pipe-delimited)
     *   A -- "label text" --> B  (quoted between dashes)
     * Pipe-delimited labels with special chars also choke the parser.
     */
    _sanitizeFlowchartLine(line) {
        // Fix unescaped double braces in node labels: [Text {{val}}] → ["Text {{val}}"]
        line = line.replace(/\[([^"\]]*?\{\{.*?\}\}[^"\]]*?)\]/g, '["$1"]');
        // Fix unescaped parentheses in node labels: [Text (val)] → ["Text (val)"]
        line = line.replace(/\[([^"\]]*?\(.*?\)[^"\]]*?)\]/g, '["$1"]');

        // Sanitize pipe-delimited edge labels: -->|label| or -.->|label|
        line = line.replace(/(--+>|-.->|==+>)\|([^|]+)\|/g, (_, arrow, label) => {
            const safe = this._stripMermaidUnsafe(label);
            return `${arrow}|${safe}|`;
        });

        return line;
    }

    /**
     * Wrap a label in double quotes after neutralizing characters that break
     * Mermaid even inside quotes.
     */
    _makeMermaidSafeLabel(raw) {
        let s = raw.trim();
        // Strip surrounding quotes if present (we'll re-add them)
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
            s = s.slice(1, -1);
        }
        s = this._stripMermaidUnsafe(s);
        return `"${s}"`;
    }

    /**
     * Remove or replace characters known to cause Mermaid parse failures.
     * Keeps the label human-readable while avoiding the parser landmines.
     */
    _stripMermaidUnsafe(s) {
        return s
            .replace(/"/g, "'")            // double quotes → single
            .replace(/\u2014/g, '-')        // em-dash → hyphen
            .replace(/\u2013/g, '-')        // en-dash → hyphen
            .replace(/\u2018|\u2019/g, "'") // curly single quotes
            .replace(/\u201C|\u201D/g, "'") // curly double quotes → single
            .replace(/[{}[\]|#<>\\]/g, '')  // structural chars + square brackets
            .replace(/;/g, ',')             // semicolons are statement separators
            .replace(/:/g, ' -')            // colons break stateDiagram label parser
            .replace(/\//g, ' ')            // slashes confuse the tokenizer
            .replace(/\n/g, ' ')            // newlines
            .replace(/\s{2,}/g, ' ')        // collapse runs of whitespace from replacements
            .trim();
    }
    
    isValidMermaidCode(code) {
        // Minimal validation - let Mermaid's parser do the heavy lifting
        if (!code || code.length < 5) return false;
        const body = this._stripLeadingMermaidDirectives(code);
        if (!body || body.trim().length < 5) return false;
        
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
            /^\s*mindmap/i,
            /^\s*xychart-beta/i,
            /^\s*timeline/i,
            /^\s*sankey-beta/i,
            /^\s*block-beta/i,
            /^\s*quadrantChart/i,
            /^\s*requirementDiagram/i,
            /^\s*C4Context/i,
            /^\s*C4Container/i,
            /^\s*C4Component/i,
            /^\s*C4Deployment/i,
            /^\s*zenuml/i,
            /^\s*packet-beta/i
        ];
        
        return validStartPatterns.some(pattern => pattern.test(body));
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
    <link rel="stylesheet" href="lib/katex.min.css">
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
    <link rel="stylesheet" href="lib/katex.min.css">
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

    // Session: persist which document to restore on next load (IndexedDB file id)
    setActiveDocumentId(fileId) {
        try {
            if (fileId) localStorage.setItem('markdownpro-active-doc-id', fileId);
            else localStorage.removeItem('markdownpro-active-doc-id');
        } catch (_) {}
    }

    getActiveDocumentId() {
        try {
            return localStorage.getItem('markdownpro-active-doc-id') || null;
        } catch (_) {
            return null;
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
                    const activeId = this.getActiveDocumentId?.();
                    let savedFile = null;
                    if (activeId) {
                        savedFile = files.find((f) => f.id === activeId) || null;
                    }
                    if (!savedFile) {
                        // Fall back to most recently modified
                        const sortedFiles = [...files].sort((a, b) => {
                            const dateA = new Date(a.modified || a.created || 0);
                            const dateB = new Date(b.modified || b.created || 0);
                            return dateB - dateA;
                        });
                        savedFile = sortedFiles[0];
                    }
                    console.log('✅ Found saved file in IndexedDB:', savedFile.name);
                    this.setActiveDocumentId(savedFile.id);

                    this.editor.value = savedFile.content || '';
                    this.currentFileName = savedFile.name || 'Untitled.md';
                    this.currentDriveFileId = savedFile.driveFileId || null;
                    this.documentTitle.value = this.currentFileName;
                    this.fileName.textContent = this.currentFileName;
                    this.lastSavedContent = savedFile.content || '';
                    this.setModified(false);
                    this.resetUndoHistory();
                    
                    this.showNotification(`Restored: ${savedFile.name}`, 'info');
                    
                    // Update preview first, then reset scroll state
                    this.updatePreview();
                    
                    // Reset scroll state AFTER content AND preview are loaded
                    // Use longer delay to ensure DOM is fully rendered
                        setTimeout(() => {
                        this.resetScrollState();
                            this.editor.focus();
                    }, 200);
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
                this.currentDriveFileId = savedFile.driveFileId || null;
                this.documentTitle.value = this.currentFileName;
                this.fileName.textContent = this.currentFileName;
                this.setModified(savedFile.isModified || false);
                this.resetUndoHistory();
                
                this.showNotification(`Restored: ${savedFile.name}`, 'info');
                
                // Update preview first, then reset scroll state
                this.updatePreview();
                
                // Reset scroll state AFTER content AND preview are loaded
                    setTimeout(() => {
                    this.resetScrollState();
                        this.editor.focus();
                }, 200);
                return;
            }
        }
        
        console.log('ℹ️ No saved file found, loading welcome content');
        this.loadWelcomeContent();
        
        // Update preview first
        this.updatePreview();
        
        // Reset scroll state for welcome content too (with delay for DOM)
        setTimeout(() => {
            this.resetScrollState();
            this.editor.focus();
        }, 200);
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
        this.resetUndoHistory();
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
        
        // If the document contains embedded images or placeholders, never prompt.
        // Those strings are common in normal docs and can contain escape-like sequences.
        if (content.includes('data:image/') || content.includes('(...IMG_') || content.includes('...IMG_')) {
            return;
        }
        
        // Only prompt when the *entire document* looks like a JSON-escaped single-line string.
        // Rationale: normal markdown often legitimately contains literal "\\n" inside code blocks.
        const hasEscapedNewlines = content.includes('\\n');
        const hasActualNewlines = content.includes('\n');
        const wrappedInQuotes = content.startsWith('"') && content.endsWith('"') && content.length > 2;
        const hasEscapedQuotes = content.includes('\\"');

        const looksLikeWholeDocumentJsonEscaped =
            wrappedInQuotes || (hasEscapedNewlines && !hasActualNewlines);

        if (!looksLikeWholeDocumentJsonEscaped) return;

        // Additional sanity: if it's not wrapped, require at least a couple escapes to avoid false positives.
        if (!wrappedInQuotes) {
            const escapeCount =
                (content.match(/\\n/g) || []).length +
                (content.match(/\\"/g) || []).length;
            if (escapeCount < 2) return;
        }

        // If it starts with markdown-like content after stripping one leading quote, it's a good candidate.
        const testContent = wrappedInQuotes ? content.slice(1, -1) : content;
        const startsWithMarkdown = /^(\s*#|\s*[-*+]\s+|\s*\d+\.\s+|\s*>)/.test(testContent);
        if (!startsWithMarkdown && !hasEscapedQuotes && !hasEscapedNewlines) return;

            this.showUnescapeNotification();
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
        // Make this action undoable even if native undo history was wiped.
        this.recordUndoSnapshot(true);
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

        // Record pre-edit snapshots for reliable undo/redo
        // (typing, deleting, paste, etc. Programmatic edits must call recordUndoSnapshot()).
        this.editor.addEventListener('beforeinput', (e) => {
            try {
                if (this._historyApplying) return;
                const t = e && e.inputType ? String(e.inputType) : '';
                if (t.startsWith('history')) return;
                this.recordUndoSnapshot(false);
            } catch (_) {
                // ignore
            }
        });

        // Intercept undo/redo shortcuts so they work even when native history was wiped.
        this.editor.addEventListener('keydown', (e) => {
            try {
                if (!e) return;
                if (!(e.ctrlKey || e.metaKey)) return;
                if (e.altKey) return;
                const key = (e.key || '').toLowerCase();
                const isUndo = key === 'z' && !e.shiftKey;
                const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
                if (!isUndo && !isRedo) return;
                e.preventDefault();
                e.stopPropagation();
                if (isUndo) this.undo();
                else this.redo();
            } catch (_) {
                // ignore
            }
        });
        
        this.editor.addEventListener('input', () => {
            // Track typing to suppress scroll sync during input
            this._lastInputAt = Date.now();
            // Text and wrapping can change even when length doesn't; rebuild mirror map.
            this._markEditorMetricsDirty();
            
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
            // If this paste includes an image/SVG, do NOT run escaped-content detection.
            // Image paste flow rewrites the editor value and may contain escape-like sequences.
            // Also, users don't want an unescape prompt when pasting images.
            try {
                const cd = e.clipboardData;
                if (cd && cd.items && cd.items.length) {
                    for (const it of Array.from(cd.items)) {
                        if (!it || !it.type) continue;
                        if (it.type.startsWith('image/') || it.type === 'image/svg+xml') {
                            // Still preserve viewport (below), but skip unescape detection.
                            // We'll early-return after setting up the viewport preservation.
                            // Mark on the event so downstream code can see it.
                            e.__markdownProSkipUnescape = true;
                            break;
                        }
                    }
                }
            } catch (_) {
                // ignore
            }

            // Preserve viewport position on paste.
            // Browsers often auto-scroll the textarea to the caret after paste;
            // we want the page to stay where it is (user expectation for this app).
            try {
                const st = this.editor.scrollTop;
                const sl = this.editor.scrollLeft;
                const pst = this.preview ? this.preview.scrollTop : 0;
                const psl = this.preview ? this.preview.scrollLeft : 0;

                requestAnimationFrame(() => {
                    if (this.editor) {
                        this.editor.scrollTop = st;
                        this.editor.scrollLeft = sl;
                    }
                    if (this.preview) {
                        this.preview.scrollTop = pst;
                        this.preview.scrollLeft = psl;
                    }
                });
            } catch (_) {
                // best-effort only
            }

            setTimeout(() => {
                // Skip unescape detection for image/SVG pastes.
                if (e && e.__markdownProSkipUnescape) return;
                this.detectAndOfferUnescape();
            }, 100);
        });
        
        this.editor.addEventListener('scroll', () => {
            this.syncScroll('editor');
        });

        // Layout changes (resize / pane divider / fullscreen transitions) can change wrapping.
        window.addEventListener('resize', () => {
            this._markEditorMetricsDirty();
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
