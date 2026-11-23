/**
 * IndexedDB Manager for Markdown Editor
 * Provides large-capacity storage (50MB - several GB depending on browser)
 * Used as fallback when localStorage is full or for large files
 */
class IndexedDBManager {
    constructor() {
        this.dbName = 'markdown-editor-db';
        this.dbVersion = 2;
        this.storeName = 'files';
        this.imagesStoreName = 'images';
        this.db = null;
        this.isSupported = this.checkSupport();
    }
    
    checkSupport() {
        return typeof indexedDB !== 'undefined';
    }
    
    /**
     * Initialize the database
     * @returns {Promise<boolean>}
     */
    async init() {
        if (!this.isSupported) {
            console.warn('IndexedDB is not supported in this browser');
            return false;
        }
        
        try {
            this.db = await this.openDatabase();
            console.log('✅ IndexedDB initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize IndexedDB:', error);
            return false;
        }
    }
    
    /**
     * Open/create the database
     * @returns {Promise<IDBDatabase>}
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                reject(new Error('Failed to open IndexedDB: ' + request.error));
            };
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    
                    // Create indexes for efficient querying
                    objectStore.createIndex('name', 'name', { unique: false });
                    objectStore.createIndex('modified', 'modified', { unique: false });
                    objectStore.createIndex('created', 'created', { unique: false });
                    
                    console.log('Created IndexedDB object store with indexes');
                }

                // Images store (placeholder -> data URL). Needed for offline-safe collapsed image placeholders.
                if (!db.objectStoreNames.contains(this.imagesStoreName)) {
                    const imagesStore = db.createObjectStore(this.imagesStoreName, { keyPath: 'id' });
                    imagesStore.createIndex('created', 'created', { unique: false });
                    console.log('Created IndexedDB images store');
                }
            };
        });
    }

    async write(storeName, operation) {
        if (!this.db && !await this.init()) return false;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            tx.oncomplete = () => resolve(true);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
            tx.onerror = event => reject(event.target.error || tx.error);
            operation(tx.objectStore(storeName));
        });
    }

    /**
     * Save an image entry (id -> dataUrl + metadata) to IndexedDB.
     * @param {{id: string, alt?: string, dataUrl: string, fullMarkdown?: string, created?: string}} imageData
     */
    async saveImage(imageData) {
        const now = new Date().toISOString();
        const alt = imageData.alt || '';
        return this.write(this.imagesStoreName, store => store.put({
            id: imageData.id, alt, dataUrl: imageData.dataUrl,
            fullMarkdown: imageData.fullMarkdown || `![${alt}](${imageData.dataUrl})`,
            created: imageData.created || now, modified: imageData.modified || now
        }));
    }

    /**
     * Get an image entry by id.
     * @param {string} imageId
     * @returns {Promise<Object|null>}
     */
    async getImage(imageId) {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.imagesStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.imagesStoreName);
            const request = objectStore.get(imageId);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => {
                console.error('Failed to get image from IndexedDB:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Iterate image entries one at a time. A store bloated by duplicate
     * images must never be materialised as one array.
     * @param {(entry: Object) => void} callback
     * @returns {Promise<number>} number of entries seen
     */
    async forEachImage(callback) {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('IndexedDB unavailable');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.imagesStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.imagesStoreName);
            const request = objectStore.openCursor();
            let count = 0;

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(count);
                    return;
                }
                count++;
                try {
                    callback(cursor.value);
                } catch (_) {
                    // A bad record must not stop the scan.
                }
                cursor.continue();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all images from IndexedDB
     * @returns {Promise<Array>}
     */
    async getAllImages() {
        if (!this.db) {
            await this.init();
        }
        if (!this.db) {
            throw new Error('IndexedDB unavailable');
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.imagesStoreName], 'readonly');
            const objectStore = transaction.objectStore(this.imagesStoreName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                resolve(request.result || []);
            };

            request.onerror = () => {
                console.error('Failed to get all images from IndexedDB:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Delete an image entry by id.
     * @param {string} imageId
     * @returns {Promise<boolean>}
     */
    async deleteImage(imageId) {
        return this.write(this.imagesStoreName, store => store.delete(imageId));
    }
    
    /**
     * Save a file to IndexedDB
     * @param {Object} fileData - File data object
     * @returns {Promise<boolean>}
     */
    async saveFile(fileData) {
        return this.write(this.storeName, store => store.put({
            ...fileData, modified: fileData.modified || new Date().toISOString()
        }));
    }
    
    /**
     * Get a file from IndexedDB by ID
     * @param {string} fileId - File ID
     * @returns {Promise<Object|null>}
     */
    async getFile(fileId) {
        if (!this.db) {
            await this.init();
        }
        
        if (!this.db) {
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(fileId);
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                console.error('Failed to get file from IndexedDB:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Get all files from IndexedDB
     * @returns {Promise<Array>}
     */
    async getAllFiles() {
        if (!this.db) {
            await this.init();
        }
        
        if (!this.db) {
            throw new Error('IndexedDB unavailable');
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => {
                resolve(request.result || []);
            };
            
            request.onerror = () => {
                console.error('Failed to get all files from IndexedDB:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Delete a file from IndexedDB
     * @param {string} fileId - File ID
     * @returns {Promise<boolean>}
     */
    async deleteFile(fileId) {
        return this.write(this.storeName, store => store.delete(fileId));
    }
    
    /**
     * Clear all files from IndexedDB
     * @returns {Promise<boolean>}
     */
    async clearAll() {
        return this.write(this.storeName, store => store.clear());
    }
    
    /**
     * Get storage usage estimate
     * @returns {Promise<Object>}
     */
    async getStorageEstimate() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return {
                usage: 0,
                quota: 0,
                supported: false
            };
        }
        
        try {
            const estimate = await navigator.storage.estimate();
            return {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                usageFormatted: this.formatBytes(estimate.usage || 0),
                quotaFormatted: this.formatBytes(estimate.quota || 0),
                percentage: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0,
                supported: true
            };
        } catch (error) {
            console.error('Failed to get storage estimate:', error);
            return {
                usage: 0,
                quota: 0,
                supported: false
            };
        }
    }
    
    /**
     * Format bytes to human-readable string
     * @param {number} bytes - Bytes to format
     * @returns {string}
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Export all data as JSON
     * @returns {Promise<Object>}
     */
    async exportData() {
        const files = await this.getAllFiles();
        return {
            version: '1.0',
            exported: new Date().toISOString(),
            files: files,
            count: files.length
        };
    }
    
    /**
     * Import data from JSON
     * @param {Object} data - Data to import
     * @returns {Promise<number>} Number of files imported
     */
    async importData(data) {
        if (!data || !data.files || !Array.isArray(data.files)) {
            throw new Error('Invalid import data format');
        }
        
        let imported = 0;
        for (const file of data.files) {
            try {
                if (await this.saveFile(file)) imported++;
            } catch (error) {
                console.error('Failed to import file:', file?.name, error);
            }
        }
        
        return imported;
    }
}

