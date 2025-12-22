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
        this.setupToggle();
        this.bindInputHandler();
    }
    
    // Clear all stored images (in-memory only)
    clearImageStore() {
        this.imageStore.clear();
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
    expandPlaceholders(content) {
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
                return `![${alt}](${imageData.dataUrl})`;
            }
        );
    }

    // Replace any remaining placeholders with a safe, offline-friendly marker so the browser
    // never tries to request `/...IMG_...` from the network/server.
    replaceUnknownPlaceholders(content) {
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
                // If we have it, expand immediately to a data: URL so the preview NEVER attempts a network fetch.
                const imageData = this.imageStore.get(imageId);
                if (imageData && imageData.dataUrl) {
                    return `![${alt}](${imageData.dataUrl})`;
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
                
                if (currentContent.includes('data:image/')) {
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
    
    // Get content for preview (always expanded; never generates network image URLs)
    getPreviewContent() {
        const currentContent = this.editor.editor.value;
        try {
            const safeContent = this.replaceUnknownPlaceholders(currentContent);
            if (this.isCollapsed) {
                return this.expandPlaceholders(safeContent);
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
    
    // Attempt to restore corrupted placeholders
    attemptPlaceholderRestore() {
        const currentContent = this.editor.editor.value;
        const cursorPos = this.editor.editor.selectionStart;
        
        // Look for any corrupted placeholder patterns
        let hasCorrupted = false;
        let restoredContent = currentContent;
        
        const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Check for partial image ID patterns that might be corrupted
        for (const [imageId, imageData] of this.imageStore) {
            const partialId = imageId.substring(0, 15);
            const partialIdEsc = escapeRegex(partialId);
            
            // Look for corrupted patterns like (...IMG_123...corrupted...)
            try {
                const corruptedPattern = new RegExp(`\\(\\.\\.\\.${partialIdEsc}[^)]*\\.\\.\\.[^)]*\\)`, 'g');
                if (corruptedPattern.test(currentContent)) {
                    hasCorrupted = true;
                    restoredContent = restoredContent.replace(corruptedPattern, `(...${imageId}...)`);
                }
            } catch (e) {
                console.warn('Corrupted placeholder restore regex failed (non-fatal):', e);
            }
            
            // Also look for completely broken markdown image syntax
            try {
                const brokenPattern = new RegExp(`!\\[[^\\]]*\\]\\([^)]*${partialIdEsc}[^)]*\\)`, 'g');
                if (brokenPattern.test(currentContent)) {
                    hasCorrupted = true;
                    restoredContent = restoredContent.replace(brokenPattern, `![${imageData.alt}](...${imageId}...)`);
                }
            } catch (e) {
                console.warn('Broken placeholder restore regex failed (non-fatal):', e);
            }
        }
        
        // If we found and fixed corrupted placeholders, update the editor
        if (hasCorrupted && restoredContent !== currentContent) {
            const textBeforeCursor = currentContent.substring(0, cursorPos);
            const restoredTextBeforeCursor = textBeforeCursor.replace(
                /\(\.\.\.IMG_[^)]*\.\.\.[^)]*\)/g, 
                (match) => {
                    // Try to find the correct placeholder for this corrupted one
                    for (const [imageId, imageData] of this.imageStore) {
                        if (match.includes(imageId.substring(0, 15))) {
                            return `(...${imageId}...)`;
                        }
                    }
                    return match;
                }
            );
            const newCursorPos = restoredTextBeforeCursor.length;
            
            this.editor.editor.value = restoredContent;
            
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
        }
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
            }
            document.body.removeChild(menu);
        };
        
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
