/**
 * Application initialization
 */

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Create the main editor instance
    window.markdownEditor = new MarkdownEditor();
    
    // Initialize file browser
    window.markdownEditor.fileBrowser = new FileBrowser(window.markdownEditor);
    
    // Initialize additional components
    new EditorEvents(window.markdownEditor);
    new PaneResizer();
    
    // Setup image paste first
    window.markdownEditor.setupImagePaste();
    
    // Setup simple image collapse
    window.markdownEditor.setupImageCollapse();
    
    // Setup syntax highlighting
    window.markdownEditor.setupSyntaxHighlighting();
    
    // Setup drag and drop
    window.markdownEditor.setupDragAndDrop();
    
    // Expose migration helper to console
    window.migrateToIndexedDB = async (clearLocalStorage = true) => {
        return await window.markdownEditor.migrateAndCleanup(clearLocalStorage);
    };
    
    // Add some helpful console messages
    console.log('🚀 Markdown Editor initialized successfully!');
    console.log('📋 Image paste:', window.markdownEditor.imagePaste ? 'enabled' : 'disabled');
    console.log('🖼️ Image collapse:', window.markdownEditor.imageCollapse ? 'enabled' : 'disabled');
    console.log('💾 Migration helper: Use migrateToIndexedDB(true) to migrate and clear localStorage');
    console.log('💡 Keyboard shortcuts:');
    console.log('   Ctrl/Cmd + N: New file');
    console.log('   Ctrl/Cmd + O: Open file');
    console.log('   Ctrl/Cmd + S: Save file');
    console.log('   Ctrl/Cmd + P: Print file');
    console.log('   Ctrl/Cmd + B: Bold text');
    console.log('   Ctrl/Cmd + I: Italic text');
    console.log('   Ctrl/Cmd + U: Unescape JSON string');
    console.log('   Ctrl/Cmd + Z: Undo (native browser)');
    console.log('   Ctrl/Cmd + Y: Redo (native browser)');
    console.log('   Tab: Indent');
    console.log('   Shift + Tab: Unindent');

    // Update build info display (offline; uses build-info.js only)
    try {
        const buildInfoEl = document.getElementById('buildInfo');
        const buildInfo = typeof BUILD_INFO !== 'undefined' ? BUILD_INFO : null;
        if (buildInfoEl && buildInfo && buildInfo.hash) {
            buildInfoEl.textContent = `(build: ${buildInfo.hash})`;
            buildInfoEl.title =
                `Full hash: ${buildInfo.hashFull}\n` +
                `Build date: ${buildInfo.date}\n` +
                `Version: ${buildInfo.version || '1.0.0'}`;
            console.log(`🏗️ Markdown Pro - Build: ${buildInfo.hash} on ${buildInfo.date}`);
        }
    } catch (e) {
        console.warn('Build info display update failed:', e);
    }
});

// Export for potential future use
window.MarkdownEditor = MarkdownEditor;
