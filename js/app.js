/**
 * Application initialization
 */

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    // Create the main editor instance
    window.markdownEditor = new MarkdownEditor();
    
    // Initialize file browser
    window.markdownEditor.fileBrowser = new FileBrowser(window.markdownEditor);
    
    // Initialize Google Drive (optional; button hidden if GIS unavailable)
    window.addEventListener('load', () => {
        if (typeof DriveAuth === 'undefined') return;
        const driveAuth = new DriveAuth();
        if (!driveAuth.isAvailable()) return;
        try {
            const last = localStorage.getItem('markdownpro_drive_last_email');
            if (last && !driveAuth.getUserEmail()) driveAuth._lastConnectedEmail = last;
        } catch (_) {}
        const driveStorage = new DriveStorage(driveAuth);
        const driveBrowser = new DriveBrowser(window.markdownEditor, driveAuth, driveStorage);
        window.markdownEditor.driveAuth = driveAuth;
        window.markdownEditor.driveStorage = driveStorage;
        window.markdownEditor.driveBrowser = driveBrowser;

        const btn = document.getElementById('driveConnect');
        if (btn) {
            btn.style.display = '';
            const updateDriveButton = () => {
                btn.classList.remove('btn-drive-disconnected', 'btn-drive-connected', 'btn-drive-connecting');
                btn.disabled = false;
                if (driveAuth.isConnecting()) {
                    btn.classList.add('btn-drive-connecting');
                    btn.disabled = true;
                    btn.title = 'Connecting to Google Drive...';
                } else if (driveAuth.isConnected()) {
                    btn.classList.add('btn-drive-connected');
                    const email = driveAuth.getUserEmail();
                    btn.title = email ? 'Disconnect Google Drive (' + email + ')' : 'Disconnect Google Drive';
                } else {
                    btn.classList.add('btn-drive-disconnected');
                    const last = driveAuth.getLastConnectedEmail?.() || '';
                    btn.title = last ? 'Connect Google Drive (last: ' + last + ')' : 'Connect Google Drive';
                }
            };
            updateDriveButton();
            // Try to restore Drive silently on load if the browser still has a Google session.
            if (driveAuth.getLastConnectedEmail?.()) {
                driveAuth.silentConnect().then((result) => {
                    updateDriveButton();
                    if (result && result.ok) {
                        window.markdownEditor.showNotification?.('Google Drive reconnected', 'success');
                    }
                }).catch(() => {
                    updateDriveButton();
                });
            }
            // Toolbar button is a pure connect / disconnect toggle.
            btn.addEventListener('click', async () => {
                if (driveAuth.isConnected()) {
                    driveAuth.disconnect();
                    updateDriveButton();
                    window.markdownEditor.showNotification?.('Google Drive disconnected', 'info');
                    return;
                }

                // Do not await a silent attempt here. The real Google auth request
                // needs to stay directly inside the original user click gesture.
                updateDriveButton();
                const result = await driveAuth.connect();
                updateDriveButton();
                if (result && result.ok) {
                    window.markdownEditor.showNotification?.('Connected to Google Drive', 'success');
                } else {
                    const err = driveAuth.getLastError?.() || 'Sign-in did not complete.';
                    window.markdownEditor.showNotification?.(
                        'Could not connect to Google Drive. ' + err,
                        'info',
                        { dismissible: true }
                    );
                }
            });
        }
    });
    
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
    
    // Setup minimap
    window.markdownEditor.setupMinimap();
    
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
