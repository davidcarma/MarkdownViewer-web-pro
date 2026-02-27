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

        this._visible = true;
        this._rafPending = false;
        this._dragging = false;
        this._totalCanvasH = 0;
        this._cachedTextColor = null;
        this._colors = null;

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

    _scheduleRender() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => { this._rafPending = false; this.render(); });
    }

    _resolveColors() {
        const styles = getComputedStyle(this.pane);
        const textColor = styles.getPropertyValue('--text-primary').trim() || '#212529';
        if (textColor !== this._cachedTextColor) {
            this._cachedTextColor = textColor;
            const rgb = this._colorToRGB(textColor);
            this._colors = {
                heading: `rgba(${rgb}, 0.95)`,
                code:    `rgba(${rgb}, 0.55)`,
                normal:  `rgba(${rgb}, 0.35)`,
                faint:   `rgba(${rgb}, 0.15)`,
                accent:  `rgba(${rgb}, 0.7)`,
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
        const canvasH = Math.max(containerH, contentH);
        this.canvas.width = this.WIDTH * dpr;
        this.canvas.height = canvasH * dpr;
        this.canvas.style.width = this.WIDTH + 'px';
        this.canvas.style.height = canvasH + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, this.WIDTH, canvasH);
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
            return;
        }

        const viewFraction = clientH / scrollH;
        const scrollFraction = scrollTop / (scrollH - clientH);
        const sliderH = Math.max(20, viewFraction * containerH);
        const maxTop = containerH - sliderH;

        this.slider.style.top = (scrollFraction * maxTop) + 'px';
        this.slider.style.height = sliderH + 'px';

        if (this._totalCanvasH > containerH) {
            const offset = scrollFraction * (this._totalCanvasH - containerH);
            this.canvas.style.transform = `translateY(${-offset}px)`;
        } else {
            this.canvas.style.transform = '';
        }
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._scrollToPointer(e);
    }

    _scrollToPointer(e) {
        const rect = this.container.getBoundingClientRect();
        const y = (e.clientY || e.pageY) - rect.top;
        const fraction = Math.max(0, Math.min(1, y / rect.height));
        this.scrollEl.scrollTop = fraction * (this.scrollEl.scrollHeight - this.scrollEl.clientHeight);
    }

    _colorToRGB(color) {
        const temp = document.createElement('div');
        temp.style.color = color;
        document.body.appendChild(temp);
        const computed = getComputedStyle(temp).color;
        document.body.removeChild(temp);
        const m = computed.match(/(\d+),\s*(\d+),\s*(\d+)/);
        return m ? `${m[1]}, ${m[2]}, ${m[3]}` : '33, 37, 41';
    }

    toggle() {
        this._visible = !this._visible;
        this.container.style.display = this._visible ? '' : 'none';
        if (this._visible) this.render();
        return this._visible;
    }

    show() { this._visible = true; this.container.style.display = ''; this.render(); }
    hide() { this._visible = false; this.container.style.display = 'none'; }
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
        textarea.addEventListener('input', () => this._scheduleRender());
    }

    render() {
        if (!this._visible) return;
        const colors = this._resolveColors();
        const text = this.scrollEl.value;
        const lines = text.split('\n');
        const totalLines = lines.length;

        this._setupCanvas(totalLines * this.LINE_H + this.PADDING_TOP);
        const ctx = this.ctx;

        for (let i = 0; i < totalLines; i++) {
            const line = lines[i];
            const y = this.PADDING_TOP + i * this.LINE_H;
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
                ctx.fillRect(x, y, Math.max(1, this.CHAR_W), this.LINE_H - 1);
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

        // Re-render when preview content changes
        this._observer = new MutationObserver(() => this._scheduleRender());
        this._observer.observe(previewEl, { childList: true, subtree: true });
    }

    render() {
        if (!this._visible) return;
        const colors = this._resolveColors();
        const el = this.scrollEl;
        const scrollH = el.scrollHeight;
        const scale = this._totalCanvasH ? (this._totalCanvasH / scrollH) : 0.15;

        // We map scrollHeight → minimap height proportionally
        const ratio = Math.min(0.2, this.WIDTH * 4 / Math.max(1, scrollH));
        const mappedH = scrollH * ratio;
        this._setupCanvas(mappedH + this.PADDING_TOP);
        const ctx = this.ctx;

        // Walk visible block-level children and draw proportional representations
        const blocks = el.querySelectorAll('h1,h2,h3,h4,h5,h6,p,pre,code,table,blockquote,ul,ol,hr,.mermaid-diagram,img');
        for (const block of blocks) {
            const top = block.offsetTop * ratio + this.PADDING_TOP;
            const h = Math.max(2, block.offsetHeight * ratio);
            const tag = block.tagName.toLowerCase();

            if (tag.startsWith('h')) {
                const level = parseInt(tag[1]) || 1;
                ctx.fillStyle = colors.heading;
                const barW = this.WIDTH * (0.8 - level * 0.08);
                ctx.fillRect(2, top, barW, Math.max(2, h * 0.6));
            } else if (tag === 'pre' || tag === 'code') {
                if (tag === 'code' && block.parentElement?.tagName === 'PRE') continue;
                ctx.fillStyle = colors.code;
                ctx.fillRect(4, top, this.WIDTH - 8, h);
            } else if (tag === 'table') {
                ctx.fillStyle = colors.accent;
                ctx.fillRect(4, top, this.WIDTH - 8, h);
            } else if (tag === 'blockquote') {
                ctx.fillStyle = colors.faint;
                ctx.fillRect(6, top, this.WIDTH - 10, h);
                ctx.fillStyle = colors.accent;
                ctx.fillRect(2, top, 2, h);
            } else if (tag === 'img' || block.classList.contains('mermaid-diagram')) {
                ctx.fillStyle = colors.accent;
                ctx.strokeStyle = colors.normal;
                ctx.lineWidth = 0.5;
                ctx.fillRect(6, top, this.WIDTH - 12, h);
                ctx.strokeRect(6, top, this.WIDTH - 12, h);
            } else if (tag === 'hr') {
                ctx.fillStyle = colors.faint;
                ctx.fillRect(4, top, this.WIDTH - 8, 1);
            } else if (tag === 'ul' || tag === 'ol') {
                ctx.fillStyle = colors.normal;
                const items = block.querySelectorAll(':scope > li');
                for (const li of items) {
                    const liTop = li.offsetTop * ratio + this.PADDING_TOP;
                    const liH = Math.max(1, li.offsetHeight * ratio);
                    ctx.fillRect(6, liTop, 2, 2);
                    ctx.fillRect(10, liTop, this.WIDTH * 0.5, Math.min(liH, 2));
                }
            } else {
                ctx.fillStyle = colors.normal;
                const lines = Math.max(1, Math.round(h / 2.5));
                for (let l = 0; l < lines; l++) {
                    const ly = top + l * 2.8;
                    const lw = (l === lines - 1) ? this.WIDTH * 0.4 : this.WIDTH * 0.7;
                    ctx.fillRect(2, ly, lw, 1.5);
                }
            }
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
