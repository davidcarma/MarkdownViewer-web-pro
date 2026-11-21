const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function run(file, globals) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), globals);
}
function storage() {
    const values = new Map();
    return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
}
const noop = () => {};
const driveKey = name => 'markdownpro-drive-' + name;
function drive(localStorage, sessionStorage) {
    const requests = [];
    const window = { addEventListener: noop, removeEventListener: noop, google: { accounts: { oauth2: {
        initTokenClient: config => ({ requestAccessToken: options => requests.push({ config, options }) })
    } } } };
    run('drive-auth.js', { window, document: { addEventListener: noop, removeEventListener: noop },
        localStorage, sessionStorage, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop });
    return { auth: new window.DriveAuth(), requests };
}

test('Drive discards legacy credentials and reconnects only within the active session', async () => {
    const local = storage(), session = storage();
    const keys = ['access-token', 'refresh-token', 'token-expires-at', 'reconnect'].map(driveKey);
    keys.forEach(k => local.setItem(k, 'obsolete'));
    local.setItem('unrelated', 'keep');
    const { auth, requests } = drive(local, session);
    assert.equal(auth.isConnected(), false);
    assert.equal(auth.shouldAttemptReconnect(), false);
    const connected = auth.connect();
    const { config, options } = requests[0];
    assert.equal(config.scope, 'https://www.googleapis.com/auth/drive.file');
    assert.equal(config.include_granted_scopes, false);
    assert.equal(options.prompt, 'consent');
    config.callback({ access_token: 'fixture', expires_in: 3600, refresh_token: 'ignored' });
    assert.ok((await connected).ok);
    for (const key of keys) assert.equal(local.getItem(key), null);
    assert.equal(local.getItem('unrelated'), 'keep');
    assert.equal(session.getItem(driveKey('refresh-token')), null);
    assert.equal(drive(local, session).auth.getToken(), 'fixture');
    const fresh = drive(local, storage()).auth;
    assert.equal(fresh.isConnected() || fresh.shouldAttemptReconnect(), false);
    session.setItem(driveKey('token-expires-at'), '1');
    const reload = drive(local, session);
    assert.equal(reload.auth.isConnected(), false);
    assert.ok(reload.auth.shouldAttemptReconnect());
    const renewal = reload.auth.refreshToken();
    assert.equal(reload.requests[0].options.prompt, '');
    reload.requests[0].config.callback({ access_token: 'renewed', expires_in: 3600 });
    assert.ok((await renewal).ok);
    const pending = reload.auth.refreshToken();
    reload.auth.disconnect();
    reload.requests[1].config.callback({ access_token: 'late', expires_in: 3600 });
    assert.equal((await pending).ok, false);
    assert.equal(reload.auth.getToken(), null);
    for (const key of keys) assert.equal(session.getItem(key), null);
});

test('production analytics can be revoked after grant and re-enabled without duplicate loading', () => {
    const callbacks = {}, nodes = {}, scripts = [], expired = [];
    const button = id => ({ dataset: {}, addEventListener: (name, fn) => { callbacks[id] = fn; } });
    nodes.analyticsConsentLink = button('settings');
    const document = { readyState: 'complete', getElementById: id => nodes[id],
        createElement: () => ({ setAttribute: noop, querySelector: button }),
        body: { appendChild: el => { nodes[el.id] = el; } }, head: { appendChild: el => scripts.push(el) },
        get cookie() { return '_ga=fixture; _ga_ABC=fixture; editor=keep'; }, set cookie(value) { expired.push(value); } };
    const window = { location: { hostname: 'markdownpro.eyesondash.com' }, addEventListener: (key, fn) => { callbacks[key] = fn; } };
    const localStorage = storage();
    run('analytics.js', { window, document, localStorage });
    const disabled = 'ga-disable-G-CPZVPLENGZ';
    assert.equal(window[disabled], true);
    assert.equal(scripts.length, 0);
    callbacks['#analyticsAcceptBtn']();
    assert.equal(window[disabled], false);
    callbacks.settings();
    callbacks['#analyticsRejectBtn']();
    assert.equal(window[disabled], true);
    const command = window.dataLayer.at(-1);
    assert.deepEqual([command[0], command[1], command[2].analytics_storage], ['consent', 'update', 'denied']);
    assert.ok(expired.some(s => s.startsWith('_ga_ABC=') && s.includes('Domain=eyesondash.com')));
    assert.ok(expired.every(s => s.startsWith('_ga')));
    callbacks['#analyticsAcceptBtn']();
    assert.equal(window[disabled], false);
    assert.equal(scripts.length, 1);
    const key = 'markdownpro-analytics-consent';
    localStorage.setItem(key, 'denied');
    callbacks.storage({ key, storageArea: localStorage });
    assert.equal(window[disabled], true);
    assert.equal(nodes.analyticsConsentLink.textContent, 'Analytics: Off');
});
