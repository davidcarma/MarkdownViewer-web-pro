'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const identity = require('../js/drive-identity.js');

assert.strictEqual(identity.escapeDriveQueryValue("O'Brien"), "O\\'Brien");
assert.strictEqual(identity.escapeDriveQueryValue('a\\b'), 'a\\\\b');

const a = { id: 'a', createdTime: '2026-01-01T00:00:00.000Z', childCount: 0, parents: ['p1'] };
const b = { id: 'b', createdTime: '2026-06-01T00:00:00.000Z', childCount: 3, parents: ['p1'] };
const nested = { id: 'n', createdTime: '2025-01-01T00:00:00.000Z', childCount: 9, parents: ['other'] };

assert.strictEqual(identity.selectCanonicalItem([a, b], 'a').id, 'a');
assert.strictEqual(identity.selectCanonicalItem([a, b]).id, 'b');
assert.ok(identity.sameParent(a, b));
assert.ok(!identity.sameParent(a, nested));

const window = { DriveIdentity: identity };
const posts = [];
const store = new Map();

function jsonRes(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
    };
}

async function fakeFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (method === 'POST' && /\/files/.test(url)) {
        posts.push({ url, body: options.body });
        const id = 'new-' + posts.length;
        let name = 'created';
        let mimeType = 'text/markdown';
        let parents = [];
        try {
            const parsed = JSON.parse(options.body);
            name = parsed.name || name;
            mimeType = parsed.mimeType || mimeType;
            parents = parsed.parents || [];
        } catch (_) {
            const match = String(options.body).match(/"name":"([^"]+)"/);
            if (match) name = match[1];
            mimeType = /vnd.google-apps.folder/.test(String(options.body))
                ? 'application/vnd.google-apps.folder'
                : 'text/markdown';
            const pMatch = String(options.body).match(/"parents":\["([^"]+)"\]/);
            if (pMatch) parents = [pMatch[1]];
        }
        const file = { id, name, mimeType, parents, createdTime: '2026-09-23T00:00:00.000Z', modifiedTime: '2026-09-23T00:00:00.000Z', trashed: false };
        store.set(id, file);
        return jsonRes(200, file);
    }
    if (method === 'GET' && /q=/.test(url)) {
        const q = decodeURIComponent((url.split('q=')[1] || '').split('&')[0]);
        const files = [...store.values()].filter((file) => {
            if (file.trashed) return false;
            if (/trashed = false/.test(q) === false) return false;
            const nameMatch = q.match(/name = '([^']*)'/);
            if (nameMatch && file.name !== nameMatch[1].replace(/\\'/g, "'")) return false;
            const parentMatch = q.match(/'([^']+)' in parents/);
            if (parentMatch && !(file.parents || []).includes(parentMatch[1])) return false;
            if (q.includes("mimeType = 'application/vnd.google-apps.folder'") && file.mimeType !== 'application/vnd.google-apps.folder') return false;
            if (q.includes("mimeType != 'application/vnd.google-apps.folder'") && file.mimeType === 'application/vnd.google-apps.folder') return false;
            return true;
        });
        return jsonRes(200, { files });
    }
    if (method === 'GET' && /\/files\/([^?/]+)/.test(url)) {
        const id = decodeURIComponent(url.match(/\/files\/([^?/]+)/)[1]);
        const file = store.get(id);
        if (!file) return jsonRes(404, {});
        if (/alt=media/.test(url)) return jsonRes(200, 'body-' + id);
        return jsonRes(200, file);
    }
    if (method === 'PATCH') return jsonRes(200, {});
    if (method === 'DELETE') {
        const id = decodeURIComponent(url.match(/\/files\/([^?/]+)/)[1]);
        const file = store.get(id);
        if (file) file.trashed = true;
        return jsonRes(204, {});
    }
    return jsonRes(500, {});
}

const code = fs.readFileSync(path.join(__dirname, '../js/drive-storage.js'), 'utf8');
const ctx = {
    window,
    fetch: fakeFetch,
    localStorage: {
        _data: {},
        getItem(k) { return this._data[k] || null; },
        setItem(k, v) { this._data[k] = String(v); },
        removeItem(k) { delete this._data[k]; }
    },
    Date,
    Math,
    Promise,
    JSON,
    Error,
    encodeURIComponent,
    setTimeout,
    console
};
vm.runInNewContext(code, ctx);
const DriveStorage = window.DriveStorage;
const drive = new DriveStorage({ getToken: () => 'token' });

store.set('root-a', {
    id: 'root-a',
    name: 'Markdown-pro',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['mydrive'],
    createdTime: '2026-01-01T00:00:00.000Z',
    modifiedTime: '2026-01-01T00:00:00.000Z',
    trashed: false
});
store.set('root-b', {
    id: 'root-b',
    name: 'Markdown-pro',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['mydrive'],
    createdTime: '2026-06-01T00:00:00.000Z',
    modifiedTime: '2026-06-01T00:00:00.000Z',
    trashed: false
});
store.set('nested', {
    id: 'nested',
    name: 'Markdown-pro',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['elsewhere'],
    createdTime: '2025-01-01T00:00:00.000Z',
    modifiedTime: '2025-01-01T00:00:00.000Z',
    trashed: false
});

(async () => {
    ctx.localStorage.setItem('markdownpro_drive_root_folder_id', 'root-a');
    const rootId = await drive.ensureRootFolder();
    assert.strictEqual(rootId, 'root-a');
    assert.strictEqual(store.get('root-b').trashed, true);
    assert.strictEqual(store.get('nested').trashed, false);

    store.set('folder-1', {
        id: 'folder-1',
        name: 'aimonger',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root-a'],
        createdTime: '2026-01-01T00:00:00.000Z',
        modifiedTime: '2026-01-01T00:00:00.000Z',
        trashed: false
    });
    const beforePosts = posts.length;
    const folder = await drive.createFolder('root-a', 'aimonger');
    assert.strictEqual(folder.id, 'folder-1');
    assert.strictEqual(folder.existed, true);
    assert.strictEqual(posts.length, beforePosts);

    const createdFolder = await drive.createFolder('root-a', 'fresh-folder');
    assert.ok(createdFolder.id.startsWith('new-'));
    assert.strictEqual(createdFolder.existed, false);

    store.set('file-1', {
        id: 'file-1',
        name: 'notes.md',
        mimeType: 'text/markdown',
        parents: ['root-a'],
        createdTime: '2026-01-01T00:00:00.000Z',
        modifiedTime: '2026-01-01T00:00:00.000Z',
        trashed: false
    });
    const filePosts = posts.length;
    const saved = await drive.createFile('root-a', 'notes.md', 'hello');
    assert.strictEqual(saved.id, 'file-1');
    assert.strictEqual(saved.existed, true);
    assert.strictEqual(posts.length, filePosts);

    console.log('drive uniqueness: 7/7');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
