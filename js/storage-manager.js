/**
 * Local Storage Manager for Markdown Editor
 * Handles file persistence, auto-save, and future multi-file support
 */
class LocalStorageManager {
    constructor() {
        this.storageKey = 'markdown-editor-data';
        this.autoSaveDelay = 500; // ms delay for auto-save debouncing
        this.autoSaveTimeout = null;
        
        // Initialize storage structure
        this.initializeStorage();
    }
    
    initializeStorage() {
        const existingData = this.getAllData();
        if (!existingData) {
            const initialData = {
                version: '1.0',
                lastActiveFile: null,
                files: {},
                settings: {
                    theme: 'light',
                    autoSave: true,
                    saveInterval: 500,
                    imageCompression: true
                },
                metadata: {
                    created: new Date().toISOString(),
                    lastAccessed: new Date().toISOString()
                }
            };
            this.saveAllData(initialData);
        }
    }
    
    // Core storage operations
    getAllData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return null;
        }
    }
    
    saveAllData(data) {
        try {
            data.metadata.lastAccessed = new Date().toISOString();
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            this.handleStorageError(error);
            return false;
        }
    }
    
    // Current file operations
    saveCurrentFile(fileName, content, cursorPosition = 0, isModified = false) {
        const data = this.getAllData();
        if (!data) return false;
        
        const fileId = this.generateFileId(fileName);
        const now = new Date().toISOString();
        
        // Save/update file
        data.files[fileId] = {
            id: fileId,
            name: fileName,
            content: content,
            cursorPosition: cursorPosition,
            isModified: isModified,
            created: data.files[fileId]?.created || now,
            modified: now,
            size: content.length,
            wordCount: this.countWords(content),
            lineCount: this.countLines(content)
        };
        
        // Update last active file
        data.lastActiveFile = fileId;
        
        return this.saveAllData(data);
    }
    
    getCurrentFile() {
        const data = this.getAllData();
        if (!data || !data.lastActiveFile) return null;
        
        return data.files[data.lastActiveFile] || null;
    }
    
    // Update file state without changing content (for cursor position, etc.)
    updateFileState(fileName, cursorPosition, isModified) {
        const data = this.getAllData();
        if (!data || !data.lastActiveFile) return false;
        
        const fileId = this.generateFileId(fileName);
        if (data.files[fileId]) {
            data.files[fileId].cursorPosition = cursorPosition;
            data.files[fileId].isModified = isModified;
            data.files[fileId].modified = new Date().toISOString();
            
            return this.saveAllData(data);
        }
        return false;
    }
    
    // Replace current file in localStorage (for file loading or new file)
    replaceCurrentFile(fileName, content, cursorPosition, isModified) {
        const success = this.saveCurrentFile(fileName, content, cursorPosition, isModified);
        if (success) {
            console.log(`Replaced localStorage buffer: ${fileName}`);
            this.showReplaceIndicator(fileName);
        }
        return success;
    }
    
    showReplaceIndicator(fileName) {
        // Create temporary indicator
        const indicator = document.createElement('div');
        indicator.textContent = `📁 Buffered: ${fileName}`;
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--accent-color);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(indicator);
        
        // Animate in
        setTimeout(() => indicator.style.opacity = '1', 10);
        
        // Remove after delay
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 3000);
    }
    
    // Auto-save functionality (legacy method, now used for explicit saves)
    autoSave(fileName, content, cursorPosition, isModified) {
        // Clear existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Set new timeout for debounced save
        this.autoSaveTimeout = setTimeout(() => {
            const success = this.saveCurrentFile(fileName, content, cursorPosition, isModified);
            if (success) {
                console.log(`Auto-saved: ${fileName} at ${new Date().toLocaleTimeString()}`);
                this.showAutoSaveIndicator();
            }
        }, this.autoSaveDelay);
    }
    
    showAutoSaveIndicator() {
        // Create temporary indicator
        const indicator = document.createElement('div');
        indicator.textContent = '✓ Auto-saved';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--success-color);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(indicator);
        
        // Animate in
        setTimeout(() => indicator.style.opacity = '1', 10);
        
        // Remove after delay
        setTimeout(() => {
            indicator.style.opacity = '0';
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 300);
        }, 2000);
    }
    
    // File management (for future multi-file support)
    getAllFiles() {
        const data = this.getAllData();
        return data ? Object.values(data.files) : [];
    }
    
    deleteFile(fileId) {
        const data = this.getAllData();
        if (!data || !data.files[fileId]) return false;
        
        delete data.files[fileId];
        
        // If this was the active file, clear the reference
        if (data.lastActiveFile === fileId) {
            const remainingFiles = Object.keys(data.files);
            data.lastActiveFile = remainingFiles.length > 0 ? remainingFiles[0] : null;
        }
        
        return this.saveAllData(data);
    }
    
    renameFile(fileId, newName) {
        const data = this.getAllData();
        if (!data || !data.files[fileId]) return false;
        
        const newFileId = this.generateFileId(newName);
        
        // Create new file entry with updated name
        data.files[newFileId] = {
            ...data.files[fileId],
            id: newFileId,
            name: newName,
            modified: new Date().toISOString()
        };
        
        // Remove old entry
        delete data.files[fileId];
        
        // Update active file reference if needed
        if (data.lastActiveFile === fileId) {
            data.lastActiveFile = newFileId;
        }
        
        return this.saveAllData(data);
    }
    
    // Utility functions
    generateFileId(fileName) {
        // Create a consistent ID based on filename
        return fileName.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            || 'untitled';
    }
    
    countWords(text) {
        return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    }
    
    countLines(text) {
        return text.split('\n').length;
    }
    
    // Storage management
    getStorageInfo() {
        try {
            const data = JSON.stringify(this.getAllData());
            const used = new Blob([data]).size;
            const quota = this.estimateQuota();
            
            return {
                used: used,
                usedFormatted: this.formatBytes(used),
                quota: quota,
                quotaFormatted: this.formatBytes(quota),
                percentage: ((used / quota) * 100).toFixed(2),
                files: this.getAllFiles().length
            };
        } catch (error) {
            console.error('Error getting storage info:', error);
            return null;
        }
    }
    
    estimateQuota() {
        // localStorage typically has 5-10MB quota
        return 10 * 1024 * 1024; // 10MB estimate
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    handleStorageError(error) {
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            this.showStorageFullWarning();
        }
    }
    
    showStorageFullWarning() {
        const warning = document.createElement('div');
        warning.textContent = '⚠️ Storage quota exceeded! Please delete some files or clear storage.';
        warning.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--danger-color);
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10002;
            box-shadow: var(--shadow-lg);
        `;
        
        document.body.appendChild(warning);
        
        setTimeout(() => {
            if (warning.parentNode) {
                warning.parentNode.removeChild(warning);
            }
        }, 10000);
    }
    
    // Data export/import for backup
    exportData() {
        const data = this.getAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `markdown-editor-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            // Validate data structure
            if (data.version && data.files && data.metadata) {
                return this.saveAllData(data);
            } else {
                throw new Error('Invalid backup file format');
            }
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }
    
    // Clear all data (for reset functionality)
    clearAllData() {
        try {
            localStorage.removeItem(this.storageKey);
            this.initializeStorage();
            return true;
        } catch (error) {
            console.error('Error clearing data:', error);
            return false;
        }
    }
    
    // Settings management
    getSetting(key, defaultValue = null) {
        const data = this.getAllData();
        if (!data || !data.settings) return defaultValue;
        return data.settings[key] !== undefined ? data.settings[key] : defaultValue;
    }
    
    setSetting(key, value) {
        const data = this.getAllData();
        if (!data) return false;
        
        if (!data.settings) {
            data.settings = {};
        }
        
        data.settings[key] = value;
        return this.saveAllData(data);
    }
    
    getAllSettings() {
        const data = this.getAllData();
        return data ? data.settings : null;
    }
}
