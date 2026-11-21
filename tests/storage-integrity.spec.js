const { test, expect } = require('@playwright/test');

// Exercise the persistence classes on a real origin, without starting editor autosave.
test.beforeEach(async ({ page }) => {
  await page.route('**/storage-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto('/storage-harness');
  for (const script of ['storage-manager', 'indexeddb-manager', 'core']) {
    await page.addScriptTag({ url: `/js/${script}.js` });
  }
  await page.evaluate(() => {
    window.app = Object.assign(Object.create(MarkdownEditor.prototype), {
      storageManager: new LocalStorageManager(), indexedDBManager: new IndexedDBManager(),
      showNotification: (message, type) => { window.notice = { message, type }; },
      loadSavedFile: async () => {}, updateStats() {}, updatePreview() {}
    });
    window.confirm = () => true;
  });
});

test('forced cleanup retains all originals after a refused write; retry preserves dates and settings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const sm = app.storageManager, db = app.indexedDBManager;
    const source = sm.getAllData();
    const modified = '2001-02-03T00:00:00.000Z';
    source.files = Object.fromEntries(['a','b'].map(id => [id, { id, name: id, content: id, modified }]));
    source.settings.theme = 'dark';
    sm.saveAllData(source);
    const saveFile = db.saveFile.bind(db);
    db.saveFile = f => f.id === 'b' ? false : saveFile(f);
    const partial = await app.migrateAndCleanup(true);
    const originals = Object.keys(sm.getAllData().files);
    const marker = localStorage.getItem('markdown-editor-migrated-to-indexeddb');
    db.saveFile = saveFile;
    const retry = await app.migrateAndCleanup(true);
    return { partial, originals, marker, retry, source: sm.getAllData(), stored: await db.getFile('a') };
  });
  expect(result.partial).toMatchObject({ migrated: 1, failed: 1, cleared: false });
  expect(result.originals).toEqual(['a','b']);
  expect(result.marker).toBeNull();
  expect(result.retry).toMatchObject({ migrated: 1, skipped: 1, cleared: true });
  expect(result.source.files).toEqual({});
  expect(result.source.settings.theme).toBe('dark');
  expect(result.stored.modified).toBe('2001-02-03T00:00:00.000Z');
});

test('an abort after put success rejects the save and leaves no file', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = app.indexedDBManager;
    const put = IDBObjectStore.prototype.put;
    let succeeded = false, rejected = false;
    IDBObjectStore.prototype.put = function (...args) {
      const req = put.apply(this, args);
      req.addEventListener('success', () => { succeeded = true; this.transaction.abort(); });
      return req;
    };
    try { await db.saveFile({ id: 'abort' }); } catch (_) { rejected = true; }
    finally { IDBObjectStore.prototype.put = put; }
    return { succeeded, rejected, stored: await db.getFile('abort') };
  });
  expect(result).toEqual({ succeeded: true, rejected: true, stored: null });
});

test('backup import reports unavailable storage and preserves file and image dates on retry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const db = app.indexedDBManager;
    const modified = '1999-12-31T00:00:00.000Z';
    const backup = new Blob([JSON.stringify({ schema: 'markdown-pro-backup', schemaVersion: 1,
      localStorage: app.storageManager.getAllData(), indexedDB: {
        files: [{ id: 'file', modified }], images: [{ id: 'image', dataUrl: 'data:,test', modified }]
      }
    })]);
    db.isSupported = false;
    await app.importData(backup);
    const partial = window.notice;
    db.isSupported = true;
    await app.importData(backup);
    return { partial, complete: window.notice, dates: [(await db.getFile('file')).modified, (await db.getImage('image')).modified] };
  });
  expect(result.partial).toEqual({ type: 'warning', message: 'Backup import incomplete: 1 restored, 2 not restored' });
  expect(result.complete.type).toBe('success');
  expect(result.dates).toEqual(Array(2).fill('1999-12-31T00:00:00.000Z'));
});
