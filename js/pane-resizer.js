/**
 * Pane resizer functionality
 */
class PaneResizer {
    constructor() {
        this.divider = document.querySelector('.pane-divider');
        this.editorPane = document.querySelector('.editor-pane');
        this.previewPane = document.querySelector('.preview-pane');
        this.isResizing = false;
        
        this.init();
    }
    
    init() {
        this.divider.addEventListener('mousedown', this.startResize.bind(this));
        document.addEventListener('mousemove', this.resize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));
    }
    
    startResize(e) {
        this.isResizing = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    }
    
    resize(e) {
        if (!this.isResizing) return;
        
        const container = document.querySelector('.editor-container');
        const containerRect = container.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const containerWidth = containerRect.width;
        
        const leftWidth = Math.max(200, Math.min(mouseX, containerWidth - 200));
        const rightWidth = containerWidth - leftWidth - 4; // 4px for divider
        
        this.editorPane.style.flex = `0 0 ${leftWidth}px`;
        this.previewPane.style.flex = `0 0 ${rightWidth}px`;
    }
    
    stopResize() {
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}
