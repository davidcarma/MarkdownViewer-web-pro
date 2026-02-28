/**
 * Sublime-style minimap for both the editor and preview panes.
 * - Editor minimap: renders scaled-down text characters from the textarea
 * - Preview minimap: scans the rendered DOM for headings, paragraphs, code,
 *   images, tables, diagrams and draws proportional block representations
 * Both share the same viewport slider + click/drag navigation.
 */

// ─── Shared base ────────────────────────────────────────────────────────────

class Minimap {
    constructor(scrollEl, pane, opts = {}) {
        this.scrollEl = scrollEl;
        this.pane = pane;
        this.WIDTH = opts.width || 80;
        this.LINE_H = opts.lineH || 3;
        this.PADDING_TOP = 4;
        this.PADDING_BOTTOM = 12;

        this._visible = true;
        this._rafPending = false;
        this._dragging = false;
        this._totalCanvasH = 0;
        this._cachedTheme = null;
        this._colors = null;
        this._canvasOffset = 0;

        this._buildDOM();
        this._bindEvents();
        this.render();
    }

    _buildDOM() {
        this.container = document.createElement('div');
        this.container.className = 'minimap';

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'minimap-canvas';
        this.ctx = this.canvas.getContext('2d');

        this.slider = document.createElement('div');
        this.slider.className = 'minimap-slider';

        this.container.appendChild(this.canvas);
        this.container.appendChild(this.slider);
        this.pane.appendChild(this.container);
        this._positionBelowHeader();
    }

    _positionBelowHeader() {
        const header = this.pane.querySelector('.pane-header');
        this.container.style.top = (header ? header.offsetHeight : 0) + 'px';
    }

    _bindEvents() {
        this.scrollEl.addEventListener('scroll', () => this._updateSlider());
        new ResizeObserver(() => {
            this._positionBelowHeader();
            this._scheduleRender();
        }).observe(this.scrollEl);

        this.container.addEventListener('mousedown', (e) => this._onPointerDown(e));
        window.addEventListener('mousemove', (e) => { if (this._dragging) this._scrollToPointer(e); });
        window.addEventListener('mouseup', () => { this._dragging = false; });

        this.container.addEventListener('touchstart', (e) => {
            this._onPointerDown(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (!this._dragging) return;
            e.preventDefault();
            this._scrollToPointer(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchend', () => { this._dragging = false; }, { passive: true });
    }

    _scheduleRender(delay = 0) {
        // Debounce: for frequent triggers (typing, MutationObserver) wait for the
        // DOM to settle, then coalesce all pending renders into one RAF frame.
        if (this._renderTimer) clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => {
            this._renderTimer = null;
            if (this._rafPending) return;
            this._rafPending = true;
            requestAnimationFrame(() => { this._rafPending = false; this.render(); });
        }, delay);
    }

    _resolveColors() {
        // Read theme directly from the <html> data-theme attribute — always correct.
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        if (theme !== this._cachedTheme) {
            this._cachedTheme = theme;
            // Values match variables.css --bg-primary exactly (preview pane background).
            const PALETTE = {
                light:   { text: '33, 37, 41',      bg: '#ffffff' },   // --bg-primary light
                dark:    { text: '248, 249, 250',   bg: '#1a1d23' },   // --bg-primary dark
                gwyneth: { text: '30, 27, 75',      bg: '#ffffff' },   // approx for rgba(255,255,255,0.7)
            };
            const p   = PALETTE[theme] || PALETTE.light;
            const rgb = p.text;
            // Stronger opacities so text/content is clearly visible, not washed out.
            this._colors = {
                heading: `rgba(${rgb}, 1.0)`,
                code:    `rgba(${rgb}, 0.85)`,
                normal:  `rgba(${rgb}, 0.75)`,
                faint:   `rgba(${rgb}, 0.40)`,
                accent:  `rgba(${rgb}, 0.90)`,
                bg:      p.bg,
            };
        }
        return this._colors;
    }

    render() { /* override in subclass */ }

    _setupCanvas(contentH) {
        const dpr = devicePixelRatio;
        const headerH = this.pane.querySelector('.pane-header')?.offsetHeight || 0;
        const containerH = this.pane.clientHeight - headerH;
        this.container.style.height = containerH + 'px';
        const canvasH = Math.max(1, contentH);
        this.canvas.width = this.WIDTH * dpr;
        this.canvas.height = canvasH * dpr;
        this.canvas.style.width = this.WIDTH + 'px';
        this.canvas.style.height = canvasH + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Fill with exact theme background so blocks look correct regardless of
        // what CSS is behind the transparent canvas.
        const colors = this._resolveColors();
        this.ctx.fillStyle = colors.bg;
        this.ctx.fillRect(0, 0, this.WIDTH, canvasH);
        this._totalCanvasH = canvasH;
        this._containerH = containerH;
        return { canvasH, containerH };
    }

    _updateSlider() {
        if (!this._totalCanvasH) return;
        const scrollTop = this.scrollEl.scrollTop;
        const scrollH = this.scrollEl.scrollHeight;
        const clientH = this.scrollEl.clientHeight;
        const containerH = this._containerH || parseFloat(this.container.style.height) || this.pane.clientHeight;

        if (scrollH <= clientH) {
            this.slider.style.top = '0px';
            this.slider.style.height = containerH + 'px';
            this.canvas.style.transform = '';
            this._canvasOffset = 0;
            return;
        }

        const viewFraction = clientH / scrollH;
        const scrollFraction = scrollTop / (scrollH - clientH);
        const sliderH = Math.max(20, viewFraction * containerH);
        const maxTop = containerH - sliderH;

        this.slider.style.top = (scrollFraction * maxTop) + 'px';
        this.slider.style.height = sliderH + 'px';
        // Viewport-locked minimap: never translate canvas with scroll.
        this.canvas.style.transform = '';
        this._canvasOffset = 0;
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._scrollToPointer(e);
    }

    _scrollToPointer(e) {
        const rect = this.container.getBoundingClientRect();
        const y = (e.clientY || e.pageY) - rect.top;
        const fraction = Math.max(0, Math.min(1, y / Math.max(1, rect.height)));
        this.scrollEl.scrollTop = fraction * (this.scrollEl.scrollHeight - this.scrollEl.clientHeight);
    }

    toggle() {
        this._visible = !this._visible;
        this.container.style.display = this._visible ? '' : 'none';
        if (this._visible) this.render();
        return this._visible;
    }

    show() { this._visible = true; this.container.style.display = ''; this.render(); }
    hide() { this._visible = false; this.container.style.display = 'none'; }
    refresh() { if (this._visible) this._scheduleRender(0); }
}

// ─── Editor minimap (text-based) ────────────────────────────────────────────

class EditorMinimap extends Minimap {
    constructor(editorApp) {
        const textarea = editorApp.editor;
        const pane = textarea.closest('.editor-pane');
        super(textarea, pane, { lineH: 3 });
        this.editorApp = editorApp;
        this.CHAR_W = 1.2;
        pane.classList.add('has-minimap');
        textarea.addEventListener('input', () => this._scheduleRender(80));
    }

    render() {
        if (!this._visible) return;
        const colors = this._resolveColors();
        const text = this.scrollEl.value;
        const lines = text.split('\n');
        const totalLines = lines.length;
        const headerH = this.pane.querySelector('.pane-header')?.offsetHeight || 0;
        const containerH = this.pane.clientHeight - headerH;
        const virtualH = containerH;
        this._setupCanvas(virtualH);
        const ctx = this.ctx;

        // Same approach as preview: use scrollHeight ratio so all content maps
        // proportionally into the minimap viewport.
        const scrollH = this.scrollEl.scrollHeight;
        const usableH = virtualH - this.PADDING_TOP - this.PADDING_BOTTOM;
        const ratio = usableH / Math.max(1, scrollH);

        // Derive line height from actual editor metrics.
        const realLineH = scrollH / Math.max(1, totalLines);
        const rowStep = realLineH * ratio;
        const rowHeight = Math.max(1, Math.min(3, rowStep * 0.75));

        for (let i = 0; i < totalLines; i++) {
            const line = lines[i];
            const y = this.PADDING_TOP + i * rowStep;
            if (y > virtualH) break; // safety: don't draw beyond canvas
            if (!line.trim()) continue;

            let color = colors.normal;
            if (/^#{1,6}\s/.test(line))       color = colors.heading;
            else if (/^```/.test(line))        color = colors.code;
            else if (/^\s{4,}|\t/.test(line))  color = colors.code;
            else if (/^>\s/.test(line))         color = colors.faint;

            ctx.fillStyle = color;
            let x = 2;
            for (let c = 0; c < line.length && x < this.WIDTH - 2; c++) {
                const ch = line[c];
                if (ch === ' ' || ch === '\t') { x += ch === '\t' ? this.CHAR_W * 4 : this.CHAR_W; continue; }
                ctx.fillRect(x, y, Math.max(1, this.CHAR_W), rowHeight);
                x += this.CHAR_W;
            }
        }
        this._updateSlider();
    }
}

// ─── Preview minimap (DOM-based) ────────────────────────────────────────────

class PreviewMinimap extends Minimap {
    constructor(editorApp) {
        const previewEl = editorApp.preview;
        const pane = previewEl.closest('.preview-pane');
        super(previewEl, pane, { lineH: 3 });
        this.editorApp = editorApp;
        pane.classList.add('has-minimap');

        // Cache: WeakMap<SVGElement, {img, w, h, key}> so we only re-render
        // a thumbnail when the SVG actually changes.
        this._svgCache = new WeakMap();

        // Re-render when preview content changes.
        // Use a 250 ms debounce delay so rapid DOM mutations during typing/mermaid
        // rendering collapse into a single repaint rather than thrashing the canvas.
        this._observer = new MutationObserver(() => {
            this._svgCache = new WeakMap(); // invalidate thumbnails on content change
            this._scheduleRender(250);
        });
        this._observer.observe(previewEl, { childList: true, subtree: true });
    }

    // ── SVG thumbnail helper ──────────────────────────────────────────────────
    // Serializes the live SVG with inlined styles → off-screen Image object.
    // Returns a Promise<{img, w, h}> and caches result on the SVGElement.
    _renderSvgThumbnail(svgEl) {
        // Use outerHTML as a cheap cache key.
        const key = svgEl.getAttribute('data-minimap-key') || '';
        const cached = this._svgCache.get(svgEl);
        if (cached && cached.key === key) return Promise.resolve(cached);

        // Dimensions from viewBox or element size.
        const vb = svgEl.getAttribute('viewBox');
        let w, h;
        if (vb) {
            const p = vb.split(/[\s,]+/).map(Number);
            w = p[2]; h = p[3];
        } else {
            w = parseFloat(svgEl.getAttribute('width'))  || svgEl.clientWidth  || 200;
            h = parseFloat(svgEl.getAttribute('height')) || svgEl.clientHeight || 120;
        }
        if (!w || !h || w < 1 || h < 1) return Promise.resolve(null);

        const clone = svgEl.cloneNode(true);
        clone.setAttribute('width',  String(w));
        clone.setAttribute('height', String(h));
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        // Background matching the diagram container's actual background.
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
        // Read bg from the mermaid-diagram container (parent of SVG), same as copy-to-image.
        const container = svgEl.closest('.mermaid-diagram') || svgEl.parentElement || this.scrollEl;
        const bgColor = window.getComputedStyle(container).backgroundColor || '#ffffff';
        bg.setAttribute('fill', bgColor);
        clone.insertBefore(bg, clone.firstChild);

        // Inline computed styles so the thumbnail is self-contained.
        this._inlineStyles(svgEl, clone);

        const xml  = new XMLSerializer().serializeToString(clone);
        const url  = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        const img  = new Image();

        return new Promise(resolve => {
            img.onload  = () => {
                const entry = { img, w, h, key };
                this._svgCache.set(svgEl, entry);
                resolve(entry);
            };
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    // Deep inline all computed styles — same approach as the working copy-to-image.
    // This ensures the SVG thumbnail has exactly the same colors as the live preview.
    _inlineStyles(live, clone) {
        try {
            const cs = window.getComputedStyle(live);
            clone.style.cssText = cs.cssText;
        } catch (_) {}
        const lc = live.children, cc = clone.children;
        for (let i = 0; i < lc.length && i < cc.length; i++) this._inlineStyles(lc[i], cc[i]);
    }

    render() {
        if (!this._visible) return;
        const colors = this._resolveColors();
        const el = this.scrollEl;
        const scrollH = el.scrollHeight;
        const headerH = this.pane.querySelector('.pane-header')?.offsetHeight || 0;
        const containerH = this.pane.clientHeight - headerH;
        const virtualH = containerH;
        this._setupCanvas(virtualH);
        const usableH = virtualH - this.PADDING_TOP - this.PADDING_BOTTOM;
        const ratio = Math.max(0.0001, usableH / Math.max(1, scrollH));
        const ctx = this.ctx;
        const previewRect = el.getBoundingClientRect();
        const pad = 2;
        const innerW = this.WIDTH - pad * 2;

        // Render images (including mermaid SVGs) as actual scaled thumbnails.
        const mediaEls = el.querySelectorAll('img, .mermaid-diagram');
        for (const block of mediaEls) {
            const isMermaid = block.classList.contains('mermaid-diagram');
            const svgEl = isMermaid ? block.querySelector('.mermaid-inner svg, svg') : null;
            const imgEl = !isMermaid ? block : null;

            const refEl = svgEl || imgEl;
            if (!refEl) continue;
            const refRect = refEl.getBoundingClientRect();
            const relTop = refRect.top - previewRect.top + el.scrollTop;
            const boxTop = this.PADDING_TOP + relTop * ratio;
            const boxH = Math.max(4, refRect.height * ratio);
            const boxW = Math.max(6, Math.min(innerW, refRect.width * ratio));
            const boxX = pad;

            if (svgEl) {
                const capturedCanvas = this.canvas;
                const capturedCtx = this.ctx;
                const _bx = boxX, _by = boxTop, _bw = boxW, _bh = boxH;
                this._renderSvgThumbnail(svgEl).then(entry => {
                    if (!entry || this.canvas !== capturedCanvas) return;
                    capturedCtx.drawImage(entry.img, _bx, _by, _bw, _bh);
                });
                ctx.fillStyle = colors.faint;
                ctx.fillRect(boxX, boxTop, boxW, boxH);
            } else if (imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
                // Draw the actual image scaled down.
                try {
                    ctx.drawImage(imgEl, boxX, boxTop, boxW, boxH);
                } catch (_) {
                    ctx.fillStyle = colors.faint;
                    ctx.fillRect(boxX, boxTop, boxW, boxH);
                }
            } else {
                ctx.fillStyle = colors.faint;
                ctx.fillRect(boxX, boxTop, boxW, boxH);
            }
        }

        // Render text content as actual tiny scaled text.
        ctx.fillStyle = colors.normal;
        const textBlocks = el.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote,pre,code');
        const fontSize = Math.max(1.5, ratio * 14);
        ctx.font = `${fontSize}px sans-serif`;

        for (const block of textBlocks) {
            // Skip nested code inside pre
            if (block.tagName === 'CODE' && block.parentElement?.tagName === 'PRE') continue;

            const rect = block.getBoundingClientRect();
            const relTop = rect.top - previewRect.top + el.scrollTop;
            const top = this.PADDING_TOP + relTop * ratio;

            // Get first line of text only, truncate at minimap width (no wrapping)
            const text = (block.textContent || '').split('\n')[0].slice(0, 150).replace(/\s+/g, ' ').trim();
            if (!text) continue;

            // Color by element type
            const tag = block.tagName.toLowerCase();
            if (tag.startsWith('h')) {
                ctx.fillStyle = colors.heading;
                ctx.font = `bold ${Math.max(2, fontSize * 1.2)}px sans-serif`;
            } else if (tag === 'pre' || tag === 'code') {
                ctx.fillStyle = colors.code;
                ctx.font = `${fontSize}px monospace`;
            } else if (tag === 'blockquote') {
                ctx.fillStyle = colors.faint;
            } else {
                ctx.fillStyle = colors.normal;
                ctx.font = `${fontSize}px sans-serif`;
            }

            // Draw single line, truncated to fit width
            const y = top + fontSize;
            if (y < virtualH) {
                ctx.fillText(text, pad, y, innerW); // maxWidth param truncates
            }
        }

        // Draw HR lines
        const hrs = el.querySelectorAll('hr');
        ctx.fillStyle = colors.faint;
        for (const hr of hrs) {
            const relTop = hr.offsetTop;
            const top = this.PADDING_TOP + relTop * ratio;
            ctx.fillRect(pad, top, innerW, Math.max(1, ratio * 2));
        }

        this._updateSlider();
    }
}

// ─── Toggle button helper ───────────────────────────────────────────────────

function createMinimapToggle(pane, minimap, label) {
    const header = pane.querySelector('.pane-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.className = 'btn btn-sm minimap-toggle';
    btn.title = `Toggle ${label} minimap`;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="14" y="3" width="7" height="18" rx="1"/><line x1="3" y1="6" x2="10" y2="6"/><line x1="3" y1="10" x2="10" y2="10"/><line x1="3" y1="14" x2="8" y2="14"/><line x1="3" y1="18" x2="10" y2="18"/></svg>`;
    btn.addEventListener('click', () => {
        const on = minimap.toggle();
        btn.classList.toggle('active', on);
    });
    btn.classList.add('active');
    header.appendChild(btn);
}

// ─── Wire into MarkdownEditor ───────────────────────────────────────────────

MarkdownEditor.prototype.setupMinimap = function() {
    if (!this.minimap) {
        this.minimap = new EditorMinimap(this);
        createMinimapToggle(
            this.editor.closest('.editor-pane'),
            this.minimap,
            'editor'
        );
    }
    if (!this.previewMinimap) {
        this.previewMinimap = new PreviewMinimap(this);
        createMinimapToggle(
            this.preview.closest('.preview-pane'),
            this.previewMinimap,
            'preview'
        );
    }
};
