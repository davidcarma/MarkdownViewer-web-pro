/**
 * Simplified image data collapse functionality
 * Uses a global image store approach for reliability
 */
class SimpleImageCollapseV2 {
    constructor(editor) {
        this.editor = editor;
        this.isCollapsed = true;
        this.imageStore = new Map(); // Global store for all image data
        // Persist images in IndexedDB (NOT localStorage) so placeholders can be expanded
        // after refresh, without quota issues and without any network requests.
        // Preview-only blob URLs, keyed by image id. Reusing them keeps the
        // preview HTML small and lets the browser decode each image once.
        this._previewUrlCache = new Map();
        this.setupToggle();
        this.bindInputHandler();
        this.bindRecoveryButton();
    }

    // Clear all stored images (in-memory only)
    clearImageStore() {
        for (const entry of this._previewUrlCache.values()) {
            try { URL.revokeObjectURL(entry.url); } catch (_) { /* ignore */ }
        }
        this._previewUrlCache.clear();
        this.imageStore.clear();
    }

    // A short blob: URL for the preview DOM. The data URL remains the source
    // of truth for saving and export.
    previewUrlFor(imageData) {
        if (!imageData || !imageData.dataUrl) return '';
        const cached = this._previewUrlCache.get(imageData.id);
        if (cached && cached.dataUrl === imageData.dataUrl) return cached.url;

        try {
            const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(imageData.dataUrl);
            if (!match) return imageData.dataUrl;

            const mime = match[1] || 'application/octet-stream';
            let blob;
            if (match[2]) {
                const binary = atob(match[3]);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                blob = new Blob([bytes], { type: mime });
            } else {
                blob = new Blob([decodeURIComponent(match[3])], { type: mime });
            }

            if (cached && cached.url) {
                try { URL.revokeObjectURL(cached.url); } catch (_) { /* ignore */ }
            }
            const url = URL.createObjectURL(blob);
            this._previewUrlCache.set(imageData.id, { dataUrl: imageData.dataUrl, url });
            return url;
        } catch (_) {
            return imageData.dataUrl;
        }
    }
    
    setupToggle() {
        // Add toggle button to editor header
        const editorHeader = document.querySelector('.editor-pane .pane-header');
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-sm image-collapse-toggle';
        toggleBtn.innerHTML = '📝 Show Raw Data';
        toggleBtn.onclick = () => this.toggleCollapse();
        
        // Add right-click context menu for advanced options
        toggleBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showAdvancedOptions(e);
        });
        toggleBtn.title = 'Toggle between collapsed and raw image data view';
        
        editorHeader.appendChild(toggleBtn);
    }
    
    // Store an image/SVG and return a unique placeholder
    storeImage(imageMarkdown) {
        // Extract filename and data URL (including SVG data URLs)
        // More flexible regex to handle various data URL formats
        // Allow optional whitespace/newlines between `]` and `(` because long pasted
        // data URLs often wrap in some editors/copy sources.
        const match = imageMarkdown.match(/!\[([^\]]*)\]\s*\((data:image\/[^)]+)\)/);
        if (!match) return imageMarkdown;
        
        const [fullMatch, alt, dataUrl] = match;
        
        // Log for debugging
        console.log('Storing image:', { alt, dataUrlStart: dataUrl.substring(0, 50) + '...' });
        
        // Generate unique ID
        const imageId = `IMG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store the image data
        const entry = {
            id: imageId,
            alt: alt,
            dataUrl: dataUrl,
            fullMarkdown: fullMatch
        };
        this.imageStore.set(imageId, entry);

        // Persist to IndexedDB so refresh/server loads can expand placeholders offline
        try {
            this.editor?.indexedDBManager?.saveImage?.(entry);
        } catch (_) {
            // best-effort; preview will still work for current session via in-memory map
        }
        
        // Return collapsed placeholder
        return `![${alt}](...${imageId}...)`;
    }
    
    // Expand all placeholders in content
    expandPlaceholders(content, { previewUrls = false } = {}) {
        if (!content) return content;
        
        // IMPORTANT: Avoid constructing dynamic RegExp patterns from IDs.
        // A bad pattern here can throw and break preview + autosave + file browser.
        //
        // Match any placeholder image markdown like:
        //   ![alt](...IMG_123...)
        // including whitespace and some corruption/wrapping inside the parentheses.
        return content.replace(
            /!\[([^\]]*)\]\s*\(\s*\.\.\.\s*(IMG_[A-Za-z0-9_]+)[^)]*\)/g,
            (match, alt, imageId) => {
                const imageData = this.imageStore.get(imageId);
                if (!imageData || !imageData.dataUrl) return match;
                const src = previewUrls ? this.previewUrlFor(imageData) : imageData.dataUrl;
                return `![${alt}](${src})`;
            }
        );
    }

    // Replace any remaining placeholders with a safe, offline-friendly marker so the browser
    // never tries to request `/...IMG_...` from the network/server.
    replaceUnknownPlaceholders(content, { previewUrls = false } = {}) {
        if (!content) return content;
        // Replace markdown image placeholders with a small inline SVG "missing image" data URL.
        const missingSvg = (alt, imageId) => {
            const safeAlt = (alt || 'Missing image').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeId = (imageId || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const svg =
                `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60">` +
                `<rect x="1" y="1" width="238" height="58" rx="10" fill="#111827" stroke="#334155" stroke-width="2"/>` +
                `<text x="16" y="26" fill="#e5e7eb" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial" font-size="14" font-weight="600">Image missing</text>` +
                `<text x="16" y="46" fill="#94a3b8" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial" font-size="12">${safeAlt}${safeId ? ' • ' + safeId : ''}</text>` +
                `</svg>`;
            return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        };

        return content.replace(
            /!\[([^\]]*)\]\s*\(\s*\.\.\.\s*(IMG_[^.)\s]+)\s*\.\.\.\s*\)/g,
            (match, alt, imageId) => {
                // If we have it, expand immediately so the preview NEVER attempts a network fetch.
                const imageData = this.imageStore.get(imageId);
                if (imageData && imageData.dataUrl) {
                    const src = previewUrls ? this.previewUrlFor(imageData) : imageData.dataUrl;
                    return `![${alt}](${src})`;
                }
                // Otherwise, render a safe inline placeholder (also data:), not a relative URL.
                return `![${alt}](${missingSvg(alt, imageId)})`;
            }
        );
    }

    async loadReferencedImagesFromIndexedDB(content) {
        if (!content) return;
        const getIds = () => {
            const ids = new Set();
            const re = /\(\s*\.\.\.\s*(IMG_[A-Za-z0-9_]+)[^)]*\)/g;
            let m;
            while ((m = re.exec(content)) !== null) {
                ids.add(m[1]);
            }
            return [...ids];
        };

        const ids = getIds();
        if (ids.length === 0) return;

        const mgr = this.editor?.indexedDBManager;
        if (!mgr || typeof mgr.getImage !== 'function') return;

        await Promise.all(ids.map(async (id) => {
            if (this.imageStore.has(id)) return;
            try {
                const img = await mgr.getImage(id);
                if (img && img.id && img.dataUrl) {
                    this.imageStore.set(img.id, {
                        id: img.id,
                        alt: img.alt || '',
                        dataUrl: img.dataUrl,
                        fullMarkdown: img.fullMarkdown || `![${img.alt || ''}](${img.dataUrl})`
                    });
                }
            } catch (_) {
                // ignore
            }
        }));
    }
    
    // Collapse all images in content
    collapseImages(content) {
        if (!content) return content;
        
        let collapsedContent = content;
        
        // Replace all data URLs with placeholders
        collapsedContent = content.replace(
            /!\[([^\]]*)\]\s*\(data:image\/[^)]+\)/g,
            (match) => this.storeImage(match)
        );
        
        return collapsedContent;
    }
    
    toggleCollapse() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        const currentContent = this.editor.editor.value;
        const cursorPos = this.editor.editor.selectionStart;
        const cursorEnd = this.editor.editor.selectionEnd;
        
        // Calculate better cursor position preservation
        const textBeforeCursor = currentContent.substring(0, cursorPos);
        
        if (this.isCollapsed) {
            // Show raw data - expand all placeholders
            // Preserve undo history for programmatic value rewrite.
            this.editor.recordUndoSnapshot?.(true);
            const expandedContent = this.expandPlaceholders(currentContent);
            const expandedTextBeforeCursor = this.expandPlaceholders(textBeforeCursor);
            const newCursorPos = expandedTextBeforeCursor.length;
            
            this.editor.editor.value = expandedContent;
            this.isCollapsed = false;
            this.updateToggleButton();
            
            // Restore cursor position with better accuracy
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
            }, 10);
        } else {
            // Collapse images
            // Preserve undo history for programmatic value rewrite.
            this.editor.recordUndoSnapshot?.(true);
            const collapsedContent = this.collapseImages(currentContent);
            const collapsedTextBeforeCursor = this.collapseImages(textBeforeCursor);
            const newCursorPos = collapsedTextBeforeCursor.length;
            
            this.editor.editor.value = collapsedContent;
            this.isCollapsed = true;
            this.updateToggleButton();
            
            // Restore cursor position with better accuracy
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
            }, 10);
        }
        
        // Update editor state
        setTimeout(() => {
            this.editor.updatePreview();
            this.editor.updateStats();
            this.editor.updateCursorPosition();
            this.editor.setModified(true);
            
            // Refresh syntax highlighting if available
            if (this.editor.syntaxHighlighter) {
                this.editor.syntaxHighlighter.highlight();
            }
        }, 20);
    }
    
    // Auto-collapse when new images/SVGs are pasted
    handleImagePasted() {
        if (this.isCollapsed) {
            setTimeout(() => {
                const currentContent = this.editor.editor.value;
                const cursorPos = this.editor.editor.selectionStart;
                const prevScrollTop = this.editor.editor.scrollTop;
                const prevScrollLeft = this.editor.editor.scrollLeft;
                const previewEl = this.editor.preview;
                const prevPreviewTop = previewEl ? previewEl.scrollTop : 0;
                const prevPreviewLeft = previewEl ? previewEl.scrollLeft : 0;
                
                if (currentContent.includes('data:image/')) {
                    // Preserve undo history for programmatic collapse rewrite.
                    this.editor.recordUndoSnapshot?.(true);
                    const collapsedContent = this.collapseImages(currentContent);
                    
                    // Calculate new cursor position
                    const textBeforeCursor = currentContent.substring(0, cursorPos);
                    const collapsedTextBeforeCursor = this.collapseImages(textBeforeCursor);
                    const newCursorPos = collapsedTextBeforeCursor.length;
                    
                    this.editor.editor.value = collapsedContent;
                    
                    // Restore cursor position
                    setTimeout(() => {
                        this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                        this.editor.editor.focus();

                        // Preserve viewport: selection/focus can scroll-jump (often to EOF).
                        this.editor.editor.scrollTop = prevScrollTop;
                        this.editor.editor.scrollLeft = prevScrollLeft;
                        if (previewEl) {
                            previewEl.scrollTop = prevPreviewTop;
                            previewEl.scrollLeft = prevPreviewLeft;
                        }
                        this.editor._ignoringScrollUntil = Date.now() + 250;
                        
                        // Update editor state
                        this.editor.updatePreview();
                        this.editor.updateStats();
                        this.editor.updateCursorPosition();
                        
                        // Refresh syntax highlighting
                        if (this.editor.syntaxHighlighter) {
                            this.editor.syntaxHighlighter.highlight();
                        }
                    }, 10);
                }
            }, 100); // Slightly longer delay to ensure image paste is complete
        }
    }
    
    // Get content for preview (always expanded; never generates network image URLs).
    // Pass previewUrls for the on-screen preview: it uses short blob URLs so a
    // document with many screenshots does not rebuild a multi-megabyte DOM on
    // every render. Save/export callers keep full data URLs.
    getPreviewContent({ previewUrls = false } = {}) {
        const currentContent = this.editor.editor.value;
        try {
            const safeContent = this.replaceUnknownPlaceholders(currentContent, { previewUrls });
            if (this.isCollapsed) {
                return this.expandPlaceholders(safeContent, { previewUrls });
            }
            return safeContent;
        } catch (e) {
            // Never let preview expansion break the app (open/save/find/etc).
            console.warn('getPreviewContent failed; returning raw editor content:', e);
            return currentContent;
        }
    }
    
    // Initialize with existing content
    async initialize() {
        const content = this.editor.editor.value;

        // If the doc has placeholders, load referenced images so we can expand them on preview.
        await this.loadReferencedImagesFromIndexedDB(content);
        
        // Check if content has image placeholders (from previous session)
        const hasPlaceholders = /\.\.\.[A-Z0-9_]+\.\.\./g.test(content);
        
        if (hasPlaceholders) {
            // Content already has placeholders - we're in collapsed mode
            this.isCollapsed = true;
            this.updateToggleButton();
            console.log('Initialized with existing image placeholders');
        } else if (content.includes('data:image/')) {
            // Content has raw image data URLs - collapse them
            const collapsedContent = this.collapseImages(content);
            this.editor.editor.value = collapsedContent;
            this.isCollapsed = true;
            this.updateToggleButton();
            console.log('Collapsed existing image data URLs');
        }
        
        // Always update preview to ensure images display correctly
        this.editor.updatePreview();
    }
    
    // Update toggle button text and state
    updateToggleButton() {
        const toggleBtn = document.querySelector('.image-collapse-toggle');
        if (toggleBtn) {
            if (this.isCollapsed) {
                toggleBtn.innerHTML = '📝 Show Raw Data';
                toggleBtn.title = 'Show full image data URLs';
            } else {
                toggleBtn.innerHTML = '🖼️ Collapse Images';
                toggleBtn.title = 'Collapse long image data URLs';
            }
        }
    }
    
    // Bind input handler to detect and restore corrupted placeholders
    bindInputHandler() {
        this.editor.editor.addEventListener('input', () => {
            if (!this.isCollapsed) return; // Only active when collapsed
            
            // Debounce to avoid excessive processing
            if (this.restoreTimeout) {
                clearTimeout(this.restoreTimeout);
            }
            
            this.restoreTimeout = setTimeout(() => {
                this.attemptPlaceholderRestore();
            }, 500); // Wait 500ms after user stops typing
        });
    }
    
    // Prevent recursive restoration (guard against oscillation)
    _isRestoring = false;

    // Attempt to repair malformed placeholders. Valid placeholders are never
    // touched: rewriting an intact id can fold every image in the document
    // onto one id (images created in the same second share a long prefix),
    // which is the corruption this routine is meant to repair.
    attemptPlaceholderRestore() {
        // Guard: if we're already in the middle of a restore, skip this invocation
        if (this._isRestoring) return;

        const currentContent = this.editor.editor.value;
        if (!currentContent || !currentContent.includes('IMG_')) return;

        // One pass over `(...token...)` placeholders; the token may be
        // truncated or wrapped in debris after a bad paste/edit.
        const PLACEHOLDER_RE = /(\(\s*\.\.\.\s*)([^)]*?IMG_[A-Za-z0-9_]+[^)]*?)(\s*\.\.\.\s*\))/g;

        const resolveToken = (rawToken) => {
            const token = String(rawToken || '').trim();
            if (!token) return null;
            if (this.imageStore.has(token)) return token; // already intact

            const idMatch = token.match(/IMG_[A-Za-z0-9_]+/);
            if (!idMatch) return null;
            // More than one id in the token: ambiguous corruption, leave it.
            if (token.indexOf('IMG_') !== token.lastIndexOf('IMG_')) return null;

            const prefix = idMatch[0];
            let candidate = null;
            for (const id of this.imageStore.keys()) {
                if (!id.startsWith(prefix)) continue;
                if (candidate) return null; // two candidates: never guess
                candidate = id;
            }
            return candidate;
        };

        const repair = (text) => {
            let changed = false;
            const out = text.replace(PLACEHOLDER_RE, (match, open, rawToken, close) => {
                const resolved = resolveToken(rawToken);
                if (!resolved) return match;
                const fixed = `${open}${resolved}${close}`;
                if (fixed === match) return match;
                changed = true;
                return fixed;
            });
            return { text: out, changed };
        };

        const cursorPos = this.editor.editor.selectionStart;
        const repaired = repair(currentContent);
        if (!repaired.changed || repaired.text === currentContent) return;

        // Guard against recursive restoration (oscillation)
        this._isRestoring = true;
        try {
            const newCursorPos = repair(currentContent.substring(0, cursorPos)).text.length;

            this.editor.recordUndoSnapshot?.(true);
            this.editor.editor.value = repaired.text;

            // Restore cursor position
            setTimeout(() => {
                this.editor.editor.setSelectionRange(newCursorPos, newCursorPos);
                this.editor.editor.focus();
                this.editor.updatePreview();

                // Show a subtle notification
                if (this.editor.showNotification) {
                    this.editor.showNotification('🔧 Restored corrupted image placeholder', 'info');
                }
            }, 10);
        } finally {
            // Clear the guard after the restoration completes
            this._isRestoring = false;
        }
    }
    
    // ── Image recovery ──────────────────────────────────────────────────
    // The old repair pass could fold every placeholder onto one id. The other
    // images are still in IndexedDB; let the user pull them back in.

    bindRecoveryButton() {
        const btn = document.getElementById('recoverImages');
        if (btn && !btn._recoveryBound) {
            btn._recoveryBound = true;
            btn.addEventListener('click', () => this.showRecoveryDialog());
        }
    }

    // Images in IndexedDB that the current document no longer references,
    // deduplicated by data URL (repeated loads used to store copies).
    async collectRecoverableImages() {
        const mgr = this.editor?.indexedDBManager;
        if (!mgr || typeof mgr.forEachImage !== 'function') return [];

        const content = this.editor.editor?.value || '';
        const referenced = new Set();
        const re = /\(\s*\.\.\.\s*(IMG_[A-Za-z0-9_]+)[^)]*\)/g;
        let m;
        while ((m = re.exec(content)) !== null) referenced.add(m[1]);

        // Anything already shown by a referenced image counts as present.
        const seen = new Set();
        for (const id of referenced) {
            const entry = this.imageStore.get(id) || await mgr.getImage(id);
            if (entry && entry.dataUrl) seen.add(entry.dataUrl);
        }

        const unique = [];
        await mgr.forEachImage((entry) => {
            if (!entry || !entry.id || !entry.dataUrl) return;
            if (referenced.has(entry.id)) return;
            if (seen.has(entry.dataUrl)) return; // duplicate from a repeated load
            seen.add(entry.dataUrl);
            unique.push({
                id: entry.id,
                alt: entry.alt || '',
                dataUrl: entry.dataUrl,
                fullMarkdown: entry.fullMarkdown || ''
            });
        });
        return unique;
    }

    async showRecoveryDialog() {
        let images = [];
        try {
            images = await this.collectRecoverableImages();
        } catch (e) {
            console.warn('Image recovery scan failed:', e);
            this.editor.showNotification?.('Could not read stored images', 'error');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-dialog recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recoveryTitle">
                <div class="modal-header"><h3 id="recoveryTitle">Recover stored images</h3></div>
                <div class="modal-body">
                    <p class="recovery-hint">These images are still saved in this browser but are not referenced by the document. Insert the ones you want to bring back.</p>
                    <div class="recovery-toolbar">
                        <button type="button" class="btn btn-sm" data-recovery-toggle>Select all</button>
                        <span class="recovery-count"></span>
                    </div>
                    <div class="recovery-grid"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-recovery-cancel>Cancel</button>
                    <button type="button" class="btn btn-primary" data-recovery-insert>Insert selected</button>
                </div>
            </div>`;

        const grid = overlay.querySelector('.recovery-grid');
        const countEl = overlay.querySelector('.recovery-count');
        const insertBtn = overlay.querySelector('[data-recovery-insert]');
        const toggleBtn = overlay.querySelector('[data-recovery-toggle]');

        if (images.length === 0) {
            grid.innerHTML = '<div class="recovery-empty">No unreferenced images found.</div>';
            insertBtn.disabled = true;
            toggleBtn.hidden = true;
        } else {
            for (const image of images) {
                const label = document.createElement('label');
                label.className = 'recovery-item';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = true;
                checkbox.value = image.id;

                const thumb = document.createElement('img');
                thumb.src = this.previewUrlFor(image);
                thumb.alt = image.alt || '';
                thumb.loading = 'lazy';

                const meta = document.createElement('span');
                const sizeKB = Math.round((image.dataUrl.length * 0.75) / 1024);
                meta.textContent = `${image.alt || 'Image'} · ${sizeKB} KB`;

                label.append(checkbox, thumb, meta);
                grid.appendChild(label);
            }
        }

        const updateCount = () => {
            const total = images.length;
            const selected = overlay.querySelectorAll('.recovery-item input:checked').length;
            countEl.textContent = `${selected} of ${total} selected`;
            insertBtn.disabled = selected === 0;
            toggleBtn.textContent = (total > 0 && selected === total) ? 'Select none' : 'Select all';
        };
        overlay.addEventListener('change', updateCount);
        updateCount();

        toggleBtn.addEventListener('click', () => {
            const checkAll = overlay.querySelectorAll('.recovery-item input:checked').length !== images.length;
            overlay.querySelectorAll('.recovery-item input').forEach((cb) => { cb.checked = checkAll; });
            updateCount();
        });

        const close = () => overlay.remove();
        overlay.querySelector('[data-recovery-cancel]').addEventListener('click', close);
        insertBtn.addEventListener('click', () => {
            const chosen = images.filter((image) => {
                const cb = overlay.querySelector(`.recovery-item input[value="${image.id}"]`);
                return cb && cb.checked;
            });
            this.insertRecoveredImages(chosen);
            close();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        document.body.appendChild(overlay);
        overlay.querySelector('[data-recovery-cancel]').focus?.();
    }

    insertRecoveredImages(images) {
        if (!images || images.length === 0) return;

        const markdown = images.map((image) => {
            if (!this.imageStore.has(image.id)) {
                this.imageStore.set(image.id, {
                    id: image.id,
                    alt: image.alt || '',
                    dataUrl: image.dataUrl,
                    fullMarkdown: image.fullMarkdown || `![${image.alt || ''}](${image.dataUrl})`
                });
            }
            return `![${image.alt || ''}](...${image.id}...)`;
        }).join('\n\n');

        const editor = this.editor.editor;
        const value = editor.value || '';
        const pos = typeof editor.selectionStart === 'number' ? editor.selectionStart : value.length;
        const before = value.slice(0, pos);
        const after = value.slice(pos);
        const lead = before && !before.endsWith('\n') ? '\n\n' : '';
        const trail = after && !after.startsWith('\n') ? '\n\n' : '';

        this.editor.recordUndoSnapshot?.(true);
        editor.value = `${before}${lead}${markdown}${trail}${after}`;
        this.isCollapsed = true;
        this.updateToggleButton();
        this.editor.updatePreview?.();
        this.editor.updateStats?.();
        this.editor.setModified?.(true);
        this.editor.autoSave?.();
        this.editor.showNotification?.(`Restored ${images.length} image${images.length === 1 ? '' : 's'}`, 'success');
    }

    // Show advanced options context menu
    showAdvancedOptions(event) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 0.5rem 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            font-size: 0.875rem;
        `;
        
        const recoverOption = document.createElement('div');
        recoverOption.textContent = '♻️ Recover Stored Images';
        recoverOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        recoverOption.onclick = () => {
            document.body.removeChild(menu);
            this.showRecoveryDialog();
        };

        const restoreOption = document.createElement('div');
        restoreOption.textContent = '🔧 Restore Corrupted Images';
        restoreOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        restoreOption.onclick = () => {
            this.attemptPlaceholderRestore();
            document.body.removeChild(menu);
        };
        
        const debugOption = document.createElement('div');
        debugOption.textContent = '🐛 Debug Image Store';
        debugOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        debugOption.onclick = () => {
            console.log('Image Store:', Array.from(this.imageStore.entries()));
            if (this.editor.showNotification) {
                this.editor.showNotification(`Found ${this.imageStore.size} stored images (check console)`, 'info');
            }
            document.body.removeChild(menu);
        };
        
        const cleanupOption = document.createElement('div');
        cleanupOption.textContent = '🧹 Cleanup Old Images';
        cleanupOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
        `;
        cleanupOption.onclick = () => {
            const sizeBefore = this.imageStore.size;
            this.cleanupOldImages();
            const sizeAfter = this.imageStore.size;
            const cleanedCount = sizeBefore - sizeAfter;
            if (this.editor.showNotification) {
                this.editor.showNotification(`Cleaned up ${cleanedCount} old images`, 'success');
            }
            // Keep preview in sync in case placeholders can no longer be expanded.
            this.editor.updatePreview?.();
            this.editor.updateStats?.();
            document.body.removeChild(menu);
        };
        
        const clearOption = document.createElement('div');
        clearOption.textContent = '🗑️ Clear All Images';
        clearOption.style.cssText = `
            padding: 0.5rem 1rem;
            cursor: pointer;
            hover: background-color: var(--bg-tertiary);
            color: var(--danger-color);
        `;
        clearOption.onclick = () => {
            if (confirm('Are you sure you want to clear all stored images? This cannot be undone.')) {
                const count = this.imageStore.size;
                this.clearImageStore();
                if (this.editor.showNotification) {
                    this.editor.showNotification(`Cleared ${count} stored images`, 'info');
                }
                // Keep preview in sync in case placeholders can no longer be expanded.
                this.editor.updatePreview?.();
                this.editor.updateStats?.();
            }
            document.body.removeChild(menu);
        };
        
        menu.appendChild(recoverOption);
        menu.appendChild(restoreOption);
        menu.appendChild(debugOption);
        menu.appendChild(cleanupOption);
        menu.appendChild(clearOption);
        document.body.appendChild(menu);
        
        // Remove menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => {
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
            }, { once: true });
        }, 10);
    }
}

// Replace the main MarkdownEditor setupImageCollapse method
MarkdownEditor.prototype.setupImageCollapse = function() {
    this.imageCollapse = new SimpleImageCollapseV2(this);
    // Initialize after the editor has finished restoring content (prevents
    // "sometimes not collapsed after refresh" timing issues).
    const initCollapse = () => this.imageCollapse?.initialize?.();
    if (this.ready && typeof this.ready.then === 'function') {
        this.ready.then(() => setTimeout(initCollapse, 0));
    } else {
        setTimeout(initCollapse, 0);
    }
};
