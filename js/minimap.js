/**
 * Sublime-style minimap for the Markdown editor.
 * Renders a scaled-down canvas of the editor content on the right edge
 * with a draggable viewport indicator for fast navigation.
 */
class EditorMinimap {
    constructor(editor) {
        this.editorApp = editor;
        this.textarea = editor.editor;
        this.pane = this.textarea.closest('.editor-pane');
        if (!this.pane || !this.textarea) return;

        this.CHAR_W = 1.2;
        this.LINE_H = 3;
        this.WIDTH = 80;
        this.PADDING_TOP = 4;

        this._visible = true;
        this._rafPending = false;
        this._dragging = false;

        this._buildDOM();
        this._bindEvents();
        this.render();
    }

    _buildDOM() {
        this.pane.classList.add('has-minimap');

        this.container = document.createElement('div');
        this.container.className = 'minimap';

        this.canvas = document.createElement('canvas');
        this.canvas.className = 'minimap-canvas';
        this.canvas.width = this.WIDTH * devicePixelRatio;
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
        const headerH = header ? header.offsetHeight : 0;
        this.container.style.top = headerH + 'px';
    }

    _bindEvents() {
        this.textarea.addEventListener('input', () => this._scheduleRender());
        this.textarea.addEventListener('scroll', () => this._updateSlider());
        new ResizeObserver(() => {
            this._positionBelowHeader();
            this._scheduleRender();
        }).observe(this.textarea);

        // Click to jump
        this.container.addEventListener('mousedown', (e) => this._onPointerDown(e));
        window.addEventListener('mousemove', (e) => this._onPointerMove(e));
        window.addEventListener('mouseup', () => this._onPointerUp());

        // Touch
        this.container.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            this._onPointerDown(t);
        }, { passive: false });
        window.addEventListener('touchmove', (e) => {
            if (!this._dragging) return;
            e.preventDefault();
            this._onPointerMove(e.touches[0]);
        }, { passive: false });
        window.addEventListener('touchend', () => this._onPointerUp());
    }

    _scheduleRender() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.render();
        });
    }

    render() {
        if (!this._visible) return;

        const text = this.textarea.value;
        const lines = text.split('\n');
        const totalLines = lines.length;
        const dpr = devicePixelRatio;

        const headerH = this.pane.querySelector('.pane-header')?.offsetHeight || 0;
        const containerH = this.pane.clientHeight - headerH;
        this.container.style.height = containerH + 'px';
        const canvasH = Math.max(containerH, totalLines * this.LINE_H);
        this.canvas.width = this.WIDTH * dpr;
        this.canvas.height = canvasH * dpr;
        this.canvas.style.width = this.WIDTH + 'px';
        this.canvas.style.height = canvasH + 'px';

        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.WIDTH, canvasH);

        // Read theme colors (re-resolve if theme changed)
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
            };
        }
        const { heading: headingColor, code: codeColor, normal: normalColor, faint: faintColor } = this._colors;

        for (let i = 0; i < totalLines; i++) {
            const line = lines[i];
            const y = this.PADDING_TOP + i * this.LINE_H;
            if (y > canvasH) break;

            if (!line.trim()) continue;

            let color = normalColor;
            if (/^#{1,6}\s/.test(line))          color = headingColor;
            else if (/^```/.test(line))           color = codeColor;
            else if (/^[\-\*]\s/.test(line))      color = normalColor;
            else if (/^\s{4,}|\t/.test(line))     color = codeColor;
            else if (/^>\s/.test(line))            color = faintColor;

            ctx.fillStyle = color;

            // Draw tiny blocks for each character cluster
            const trimmed = line;
            const startX = 2;
            let x = startX;
            for (let c = 0; c < trimmed.length && x < this.WIDTH - 2; c++) {
                const ch = trimmed[c];
                if (ch === ' ' || ch === '\t') {
                    x += ch === '\t' ? this.CHAR_W * 4 : this.CHAR_W;
                    continue;
                }
                ctx.fillRect(x, y, Math.max(1, this.CHAR_W), this.LINE_H - 1);
                x += this.CHAR_W;
            }
        }

        this._totalCanvasH = canvasH;
        this._totalLines = totalLines;
        this._updateSlider();
    }

    _updateSlider() {
        if (!this._totalCanvasH) return;

        const scrollTop = this.textarea.scrollTop;
        const scrollH = this.textarea.scrollHeight;
        const clientH = this.textarea.clientHeight;
        const containerH = parseFloat(this.container.style.height) || this.pane.clientHeight;

        if (scrollH <= clientH) {
            // Everything fits — slider covers the whole minimap
            this.slider.style.top = '0px';
            this.slider.style.height = containerH + 'px';
            return;
        }

        const viewFraction = clientH / scrollH;
        const scrollFraction = scrollTop / (scrollH - clientH);

        const sliderH = Math.max(20, viewFraction * containerH);
        const maxTop = containerH - sliderH;
        const sliderTop = scrollFraction * maxTop;

        this.slider.style.top = sliderTop + 'px';
        this.slider.style.height = sliderH + 'px';

        // Scroll the minimap canvas if content is taller than the container
        const canvasH = this._totalCanvasH;
        const containerUsable = containerH;
        if (canvasH > containerUsable) {
            const canvasOffset = scrollFraction * (canvasH - containerUsable);
            this.canvas.style.transform = `translateY(${-canvasOffset}px)`;
        } else {
            this.canvas.style.transform = '';
        }
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._scrollToPointer(e);
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        this._scrollToPointer(e);
    }

    _onPointerUp() {
        this._dragging = false;
    }

    _scrollToPointer(e) {
        const rect = this.container.getBoundingClientRect();
        const y = (e.clientY || e.pageY) - rect.top;
        const containerH = rect.height;
        const fraction = Math.max(0, Math.min(1, y / containerH));

        const maxScroll = this.textarea.scrollHeight - this.textarea.clientHeight;
        this.textarea.scrollTop = fraction * maxScroll;
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
    }
}

MarkdownEditor.prototype.setupMinimap = function() {
    if (!this.minimap) this.minimap = new EditorMinimap(this);
};
