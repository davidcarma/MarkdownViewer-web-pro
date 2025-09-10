/**
 * Application initialization
 */

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Create the main editor instance
    window.markdownEditor = new MarkdownEditor();
    
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
    
    // Add some helpful console messages
    console.log('🚀 Markdown Editor initialized successfully!');
    console.log('📋 Image paste:', window.markdownEditor.imagePaste ? 'enabled' : 'disabled');
    console.log('🖼️ Image collapse:', window.markdownEditor.imageCollapse ? 'enabled' : 'disabled');
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
});

// Export for potential future use
window.MarkdownEditor = MarkdownEditor;
